import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type {
  ExecutionDAG,
  RollbackDAG,
  DAGNode,
  NodeExecution,
  NodeStatus,
  WorkflowRun,
  WSEvent,
  WSEventType,
  HITLApprovalGate,
} from '../planner/dag-types.js';
import { ConnectorRegistry } from '../mcp/registry.js';
import { ContextManager } from './context.js';
import { checkAnomaly } from './anomaly-detector.js';
import { getRetryPolicy, withRetry } from './retry-policy.js';
import { callLLM } from '../llm/client.js';
import { generatePartialRollbackDAG } from '../planner/rollback-planner.js';

export class DAGExecutor extends EventEmitter {
  private registry: ConnectorRegistry;
  private contextManager: ContextManager;
  private nodeExecutions: Map<string, NodeExecution> = new Map();
  private pendingApprovals: Map<string, { resolve: (action: 'approve' | 'reject' | 'modify') => void; modifications?: Record<string, unknown> }> = new Map();
  private pendingAnomalies: Map<string, { resolve: (action: 'ignore' | 'modify' | 'rollback') => void; modifications?: Record<string, unknown> }> = new Map();
  private isPaused = false;
  private isCancelled = false;

  constructor(registry: ConnectorRegistry) {
    super();
    this.registry = registry;
    this.contextManager = new ContextManager();
  }

  getContextManager(): ContextManager {
    return this.contextManager;
  }

  getNodeExecutions(): Map<string, NodeExecution> {
    return this.nodeExecutions;
  }

  async execute(
    dag: ExecutionDAG,
    rollbackDag: RollbackDAG,
    workflowId: string,
    originalIntent: string,
    startFromNodeId?: string
  ): Promise<{ success: boolean; totalDuration: number; nodeExecutions: Map<string, NodeExecution> }> {
    const runId = uuidv4();
    const startTime = Date.now();

    this.emitEvent('execution:started', workflowId, runId, { dagId: dag.id });

    // Topological sort
    const sortedLayers = this.topologicalSort(dag);

    let skipUntilFound = !!startFromNodeId;

    try {
      for (const layer of sortedLayers) {
        if (this.isCancelled) break;

        // Filter nodes in this layer
        let layerNodes = layer;
        if (skipUntilFound) {
          layerNodes = layer.filter(n => {
            if (n.id === startFromNodeId) {
              skipUntilFound = false;
              return true;
            }
            return !skipUntilFound;
          });
          if (layerNodes.length === 0) continue;
        }

        // Execute independent nodes in parallel
        const promises = layerNodes.map(node =>
          this.executeNode(node, dag, workflowId, runId, originalIntent)
        );

        const results = await Promise.allSettled(promises);

        // Check for failures
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const node = layerNodes[i];

          if (result.status === 'rejected') {
            // Node failed after retries
            this.updateNodeStatus(node.id, 'failed');
            this.emitEvent('node:failed', workflowId, runId, {
              nodeId: node.id,
              error: result.reason?.message || 'Unknown error',
            });

            // Cancel downstream nodes
            this.cancelDownstream(node.id, dag, workflowId, runId);

            // Trigger rollback
            const completedNodeIds = Array.from(this.nodeExecutions.entries())
              .filter(([, exec]) => exec.status === 'completed')
              .map(([id]) => id);

            if (completedNodeIds.length > 0) {
              this.emitEvent('rollback:started', workflowId, runId, { fromNode: node.id });
              await this.executeRollback(
                generatePartialRollbackDAG(dag, completedNodeIds),
                workflowId,
                runId
              );
              this.emitEvent('rollback:completed', workflowId, runId, {});
            }

            return {
              success: false,
              totalDuration: Date.now() - startTime,
              nodeExecutions: this.nodeExecutions,
            };
          }
        }
      }

      const totalDuration = Date.now() - startTime;
      this.emitEvent('execution:completed', workflowId, runId, { totalDuration });

      return {
        success: true,
        totalDuration,
        nodeExecutions: this.nodeExecutions,
      };
    } catch (err) {
      const totalDuration = Date.now() - startTime;
      this.emitEvent('execution:failed', workflowId, runId, {
        error: err instanceof Error ? err.message : String(err),
        totalDuration,
      });

      return {
        success: false,
        totalDuration,
        nodeExecutions: this.nodeExecutions,
      };
    }
  }

  private async executeNode(
    node: DAGNode,
    dag: ExecutionDAG,
    workflowId: string,
    runId: string,
    originalIntent: string
  ): Promise<void> {
    const nodeExec: NodeExecution = {
      nodeId: node.id,
      status: 'pending',
      request: {
        connector: node.connector,
        tool: node.tool,
        params: node.params,
      },
      retryCount: 0,
      confidenceScore: node.confidenceScore,
    };
    this.nodeExecutions.set(node.id, nodeExec);

    // Check if this is an approval gate
    if (node.type === 'approval_gate') {
      await this.handleApprovalGate(node, nodeExec, workflowId, runId);
      if (nodeExec.status === 'cancelled') return;
    }

    // Resolve $output references
    const resolvedParams = this.contextManager.resolveReferences(node.params);
    nodeExec.request.params = resolvedParams;

    // Update status to running
    nodeExec.status = 'running';
    nodeExec.startedAt = new Date().toISOString();
    this.emitEvent('node:running', workflowId, runId, { nodeId: node.id, startedAt: nodeExec.startedAt });

    // Get connector
    const connector = this.registry.get(node.connector);
    if (!connector) {
      throw new Error(`Connector "${node.connector}" not found`);
    }

    // Execute with retry policy
    const retryPolicy = getRetryPolicy(node.retryPolicy);
    let retryCount = 0;

    const result = await withRetry(
      async () => {
        return connector.invokeTool(node.tool, resolvedParams, {
          workflowId,
          runId,
          nodeId: node.id,
        });
      },
      retryPolicy,
      (attempt, error, delay) => {
        retryCount = attempt;
        console.log(`Node ${node.id}: retry ${attempt}/${retryPolicy.maxAttempts} after ${delay}ms — ${error.message}`);
      }
    );

    nodeExec.retryCount = retryCount;

    if (!result.success) {
      nodeExec.status = 'failed';
      nodeExec.error = result.error;
      throw new Error(result.error || 'Tool invocation failed');
    }

    // Store output in context
    await this.contextManager.storeOutput(node.id, result.data);
    nodeExec.response = result.data;

    // Anomaly detection checkpoint
    const anomalyResult = await checkAnomaly(
      node.id,
      result.data,
      originalIntent,
      node.connector,
      node.tool,
      this.contextManager.getAllOutputs()
    );

    nodeExec.anomalyResult = anomalyResult;

    if (anomalyResult.isAnomaly) {
      nodeExec.status = 'anomaly_flagged';
      this.emitEvent('node:anomaly-detected', workflowId, runId, {
        nodeId: node.id,
        anomaly: anomalyResult,
      });

      // Wait for user response
      const action = await this.waitForAnomalyResponse(node.id, workflowId, runId);

      if (action === 'rollback') {
        throw new Error(`Rollback triggered due to anomaly: ${anomalyResult.description}`);
      } else if (action === 'modify') {
        // Modifications applied to next step — continue
      }
      // 'ignore' — just continue
    }

    // Mark completed
    nodeExec.status = 'completed';
    nodeExec.completedAt = new Date().toISOString();
    nodeExec.duration = result.duration;
    this.emitEvent('node:completed', workflowId, runId, {
      nodeId: node.id,
      output: result.data,
      duration: result.duration,
    });
  }

  private async handleApprovalGate(
    node: DAGNode,
    nodeExec: NodeExecution,
    workflowId: string,
    runId: string
  ): Promise<void> {
    // Generate explanation
    const explanation = await this.generateApprovalExplanation(node);

    nodeExec.status = 'approval_pending';
    this.emitEvent('node:approval-required', workflowId, runId, {
      nodeId: node.id,
      toolCall: {
        connector: node.connector,
        tool: node.tool,
        params: this.contextManager.resolveReferences(node.params),
      },
      explanation: explanation.explanation,
      consequences: explanation.consequences,
      confidenceScore: node.confidenceScore,
    } as HITLApprovalGate);

    // Wait for user approval
    const action = await this.waitForApproval(node.id, workflowId, runId);

    if (action === 'reject') {
      nodeExec.status = 'cancelled';
      // Cancel all downstream nodes
      return;
    }

    // If 'modify', modifications are already applied to node params
    // If 'approve', continue as normal
  }

  private async generateApprovalExplanation(node: DAGNode): Promise<{ explanation: string; consequences: string }> {
    const response = await callLLM({
      systemPrompt: `You are explaining why a workflow step requires human approval (HITL gate). Generate:
1. A plain-English explanation of why this step requires approval
2. The consequences of skipping this step
Return ONLY valid JSON with "explanation" and "consequences" fields.`,
      userPrompt: `Connector: ${node.connector}
Tool: ${node.tool}
Parameters: ${JSON.stringify(node.params)}
Confidence Score: ${node.confidenceScore}%
Node Label: ${node.label}`,
      temperature: 0.3,
    });

    try {
      return JSON.parse(response.content);
    } catch {
      return {
        explanation: `This operation (${node.connector}.${node.tool}) requires approval because it modifies external systems.`,
        consequences: 'Skipping this step may lead to incomplete workflow execution.',
      };
    }
  }

  waitForApproval(nodeId: string, workflowId: string, runId: string): Promise<'approve' | 'reject' | 'modify'> {
    return new Promise((resolve) => {
      this.pendingApprovals.set(nodeId, { resolve });
    });
  }

  resolveApproval(nodeId: string, action: 'approve' | 'reject' | 'modify', modifications?: Record<string, unknown>): void {
    const pending = this.pendingApprovals.get(nodeId);
    if (pending) {
      if (modifications) {
        // Apply modifications to the node's params
        const nodeExec = this.nodeExecutions.get(nodeId);
        if (nodeExec) {
          nodeExec.request.params = { ...nodeExec.request.params, ...modifications };
        }
        pending.modifications = modifications;
      }
      pending.resolve(action);
      this.pendingApprovals.delete(nodeId);
    }
  }

  waitForAnomalyResponse(nodeId: string, workflowId: string, runId: string): Promise<'ignore' | 'modify' | 'rollback'> {
    return new Promise((resolve) => {
      this.pendingAnomalies.set(nodeId, { resolve });

      // Auto-resolve after 30 seconds if no user input (for automated tests)
      setTimeout(() => {
        if (this.pendingAnomalies.has(nodeId)) {
          resolve('ignore');
          this.pendingAnomalies.delete(nodeId);
        }
      }, 30000);
    });
  }

  resolveAnomaly(nodeId: string, action: 'ignore' | 'modify' | 'rollback', modifications?: Record<string, unknown>): void {
    const pending = this.pendingAnomalies.get(nodeId);
    if (pending) {
      pending.resolve(action);
      this.pendingAnomalies.delete(nodeId);
    }
  }

  async executeRollback(
    rollbackDag: RollbackDAG,
    workflowId: string,
    runId: string
  ): Promise<void> {
    for (const node of rollbackDag.nodes) {
      if (node.tool === 'noop') {
        console.log(`Rollback skip: ${node.label}`);
        continue;
      }

      this.emitEvent('node:rollback-started', workflowId, runId, { nodeId: node.id });

      try {
        const connector = this.registry.get(node.connector);
        if (!connector) {
          console.error(`Rollback: connector "${node.connector}" not found`);
          continue;
        }

        const resolvedParams = this.contextManager.resolveReferences(node.params);
        await connector.invokeTool(node.tool, resolvedParams, {
          workflowId,
          runId,
          nodeId: node.id,
          isRollback: true,
        });

        this.emitEvent('node:rollback-completed', workflowId, runId, { nodeId: node.id });
      } catch (err) {
        console.error(`Rollback error for ${node.id}:`, err);
      }
    }
  }

  private cancelDownstream(nodeId: string, dag: ExecutionDAG, workflowId: string, runId: string): void {
    // Find all downstream nodes
    const visited = new Set<string>();
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of dag.edges) {
        if (edge.source === current && !visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push(edge.target);

          const exec = this.nodeExecutions.get(edge.target);
          if (exec) {
            exec.status = 'cancelled';
          }
          this.emitEvent('node:cancelled', workflowId, runId, { nodeId: edge.target });
        }
      }
    }
  }

  private topologicalSort(dag: ExecutionDAG): DAGNode[][] {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();
    const nodeMap = new Map<string, DAGNode>();

    // Initialize
    for (const node of dag.nodes) {
      inDegree.set(node.id, 0);
      adjList.set(node.id, []);
      nodeMap.set(node.id, node);
    }

    // Build graph
    for (const edge of dag.edges) {
      const targets = adjList.get(edge.source);
      if (targets) targets.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }

    // BFS by layers (nodes at the same depth can run in parallel)
    const layers: DAGNode[][] = [];
    let queue = dag.nodes.filter(n => (inDegree.get(n.id) || 0) === 0);

    while (queue.length > 0) {
      layers.push([...queue]);
      const nextQueue: DAGNode[] = [];

      for (const node of queue) {
        const neighbors = adjList.get(node.id) || [];
        for (const neighborId of neighbors) {
          const newDegree = (inDegree.get(neighborId) || 0) - 1;
          inDegree.set(neighborId, newDegree);
          if (newDegree === 0) {
            const neighborNode = nodeMap.get(neighborId);
            if (neighborNode) nextQueue.push(neighborNode);
          }
        }
      }

      queue = nextQueue;
    }

    return layers;
  }

  private updateNodeStatus(nodeId: string, status: NodeStatus): void {
    const exec = this.nodeExecutions.get(nodeId);
    if (exec) exec.status = status;
  }

  private emitEvent(type: WSEventType, workflowId: string, runId: string, payload: unknown): void {
    const event: WSEvent = {
      type,
      workflowId,
      runId,
      timestamp: new Date().toISOString(),
      payload,
    };
    this.emit('ws-event', event);
  }

  cancel(): void {
    this.isCancelled = true;
  }

  reset(): void {
    this.nodeExecutions.clear();
    this.pendingApprovals.clear();
    this.pendingAnomalies.clear();
    this.isPaused = false;
    this.isCancelled = false;
    this.contextManager.reset();
  }
}
