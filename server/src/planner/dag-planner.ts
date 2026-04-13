import { v4 as uuidv4 } from 'uuid';
import { callLLM } from '../llm/client.js';
import type {
  ExecutionDAG,
  DAGNode,
  DAGEdge,
  IntentAnalysis,
  ConversationMessage,
} from './dag-types.js';
import { ConnectorRegistry } from '../mcp/registry.js';
import { loadSensitivityRules } from './confidence.js';

export async function generateDAG(
  input: string,
  intent: IntentAnalysis,
  clarifications: Record<string, string>,
  registry: ConnectorRegistry,
  conversationHistory: ConversationMessage[],
  existingDag?: ExecutionDAG
): Promise<ExecutionDAG> {
  const manifests = registry.getAllManifests();
  const sensitivityRules = loadSensitivityRules();

  const systemPrompt = `You are a DAG planner and workflow decomposition engine. Given a natural language workflow description, an intent classification, available MCP tool connectors, and optionally an existing DAG to modify, produce an executable Directed Acyclic Graph (DAG).

RULES:
1. Each node represents a single MCP tool invocation
2. Nodes can reference outputs of upstream nodes using $output.nodeId.field syntax
3. Encode dependency edges between nodes
4. Support linear pipelines (A→B→C), fan-out parallelism (A→[B,C]→D), and conditional branches
5. Tag sensitive operations as "approval_gate" type
6. Assign confidence scores (0-100) to each node
7. If an existing DAG is provided, diff and extend it rather than regenerating

AVAILABLE CONNECTORS AND TOOLS:
${JSON.stringify(manifests, null, 2)}

SENSITIVITY RULES (operations requiring approval):
${JSON.stringify(sensitivityRules, null, 2)}

${existingDag ? `EXISTING DAG (extend, don't replace):
${JSON.stringify(existingDag, null, 2)}` : ''}

Return ONLY valid JSON with "nodes" array and "edges" array. Each node must have: id, connector, tool, params, dependencies (array of node IDs), type ("standard" | "approval_gate" | "conditional" | "anomaly_checkpoint"), confidenceScore (0-100), label (human-readable).`;

  const userPrompt = `Intent: ${intent.category} (confidence: ${intent.confidence}%)
Risk Level: ${intent.riskLevel}
Runbook: ${intent.runbookTemplate.name}
Suggested Steps: ${intent.runbookTemplate.suggestedSteps.join('; ')}
User Clarifications: ${JSON.stringify(clarifications)}

Conversation History:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

Current Request: ${input}`;

  const response = await callLLM({
    systemPrompt,
    userPrompt,
    maxTokens: 4096,
    temperature: 0.3,
  });

  let dagData: { nodes: DAGNode[]; edges: DAGEdge[] };

  try {
    const parsed = JSON.parse(response.content);
    dagData = {
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
    };
  } catch {
    dagData = { nodes: [], edges: [] };
    console.error('Failed to parse DAG from LLM, using empty DAG');
  }

  // If we got an empty DAG, use a fallback
  if (dagData.nodes.length === 0) {
    dagData = generateFallbackDAG(input, intent);
  }

  // Apply sensitivity rules to tag approval gates
  for (const node of dagData.nodes) {
    const rule = sensitivityRules.find(
      r => r.operation === node.tool && r.connector === node.connector
    );
    if (rule?.requiresApproval && node.type !== 'approval_gate') {
      node.type = 'approval_gate';
    }
    // Confidence gate: sub-70% on sensitive operations → approval gate
    if (rule && node.confidenceScore < 70) {
      node.type = 'approval_gate';
    }
  }

  // Validate DAG structure (no cycles)
  validateDAG(dagData.nodes, dagData.edges);

  const dagId = uuidv4();

  return {
    id: dagId,
    nodes: dagData.nodes,
    edges: dagData.edges,
    metadata: {
      intent: intent.category,
      riskLevel: intent.riskLevel,
      createdAt: new Date().toISOString(),
      description: input,
    },
  };
}

function validateDAG(nodes: DAGNode[], edges: DAGEdge[]): void {
  // Check for cycles using DFS
  const adjList = new Map<string, string[]>();
  for (const node of nodes) {
    adjList.set(node.id, []);
  }
  for (const edge of edges) {
    const targets = adjList.get(edge.source);
    if (targets) targets.push(edge.target);
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();

  function hasCycle(nodeId: string): boolean {
    visited.add(nodeId);
    recStack.add(nodeId);

    const neighbors = adjList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        return true;
      }
    }

    recStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (hasCycle(node.id)) {
        throw new Error('Invalid DAG: cycle detected in workflow graph');
      }
    }
  }
}

function generateFallbackDAG(input: string, intent: IntentAnalysis): { nodes: DAGNode[]; edges: DAGEdge[] } {
  const lower = input.toLowerCase();
  const nodes: DAGNode[] = [];
  const edges: DAGEdge[] = [];

  if (intent.category === 'incident_response' || lower.includes('bug') || lower.includes('triage') || lower.includes('incident') || lower.includes('p0')) {
    nodes.push(
      { id: 'node_1', connector: 'jira', tool: 'create_issue', params: { project: 'PROJ', summary: 'Bug triage issue', priority: 'P0', description: 'Auto-created from workflow' }, dependencies: [], type: 'standard', confidenceScore: 92, label: 'Create Jira Issue' },
      { id: 'node_2', connector: 'github', tool: 'create_branch', params: { name: 'fix/bug-triage', baseBranch: 'main' }, dependencies: ['node_1'], type: 'standard', confidenceScore: 88, label: 'Create Fix Branch' },
      { id: 'node_3', connector: 'slack', tool: 'send_message', params: { channel: 'incidents', text: 'New P0 bug triaged: $output.node_1.key — $output.node_1.summary' }, dependencies: ['node_1'], type: 'approval_gate', confidenceScore: 75, label: 'Notify Incidents Channel' },
      { id: 'node_4', connector: 'sheets', tool: 'append_row', params: { sheetName: 'Bug Tracker', values: ['$output.node_1.key', '$output.node_1.summary', 'P0', 'Open', 'dev1', new Date().toISOString().split('T')[0]] }, dependencies: ['node_2', 'node_3'], type: 'standard', confidenceScore: 90, label: 'Log to Bug Tracker' }
    );
    edges.push(
      { source: 'node_1', target: 'node_2' },
      { source: 'node_1', target: 'node_3' },
      { source: 'node_2', target: 'node_4' },
      { source: 'node_3', target: 'node_4' }
    );
  } else if (intent.category === 'release_management' || lower.includes('deploy') || lower.includes('release') || lower.includes('merge')) {
    nodes.push(
      { id: 'node_1', connector: 'github', tool: 'merge_pr', params: { prNumber: 1 }, dependencies: [], type: 'approval_gate', confidenceScore: 80, label: 'Merge Pull Request' },
      { id: 'node_2', connector: 'slack', tool: 'send_message', params: { channel: 'releases', text: 'Deployment completed successfully! PR merged.' }, dependencies: ['node_1'], type: 'approval_gate', confidenceScore: 72, label: 'Announce Deployment' },
      { id: 'node_3', connector: 'sheets', tool: 'append_row', params: { sheetName: 'Deployment Log', values: ['v2.0.0', new Date().toISOString().split('T')[0], 'Success', 'deployer', 'Auto-deployed via MCP Gateway'] }, dependencies: ['node_1'], type: 'standard', confidenceScore: 91, label: 'Log Deployment' }
    );
    edges.push(
      { source: 'node_1', target: 'node_2' },
      { source: 'node_1', target: 'node_3' }
    );
  } else if (intent.category === 'reporting' || lower.includes('report') || lower.includes('status') || lower.includes('summary')) {
    nodes.push(
      { id: 'node_1', connector: 'sheets', tool: 'read_range', params: { sheetName: 'Bug Tracker' }, dependencies: [], type: 'standard', confidenceScore: 90, label: 'Read Bug Tracker' },
      { id: 'node_2', connector: 'jira', tool: 'list_issues', params: { project: 'PROJ', status: 'open' }, dependencies: [], type: 'standard', confidenceScore: 88, label: 'List Open Jira Issues' },
      { id: 'node_3', connector: 'slack', tool: 'send_message', params: { channel: 'engineering', text: 'Weekly Status: Reviewed $output.node_2.total open issues.' }, dependencies: ['node_1', 'node_2'], type: 'standard', confidenceScore: 85, label: 'Post Summary to Slack' }
    );
    edges.push(
      { source: 'node_1', target: 'node_3' },
      { source: 'node_2', target: 'node_3' }
    );
  } else if (intent.category === 'onboarding' || lower.includes('onboard') || lower.includes('new engineer') || lower.includes('welcome')) {
    nodes.push(
      { id: 'node_1', connector: 'jira', tool: 'create_issue', params: { project: 'PROJ', summary: 'Onboarding: New team member setup', priority: 'P2' }, dependencies: [], type: 'standard', confidenceScore: 90, label: 'Create Onboarding Ticket' },
      { id: 'node_2', connector: 'slack', tool: 'send_message', params: { channel: 'general', text: 'Welcome to the team! Your onboarding ticket: $output.node_1.key' }, dependencies: ['node_1'], type: 'standard', confidenceScore: 85, label: 'Send Welcome Message' },
      { id: 'node_3', connector: 'sheets', tool: 'append_row', params: { sheetName: 'Bug Tracker', values: ['$output.node_1.key', 'New team member', 'P2', 'Open', 'hr', new Date().toISOString().split('T')[0]] }, dependencies: ['node_1'], type: 'standard', confidenceScore: 88, label: 'Add to Team Sheet' }
    );
    edges.push(
      { source: 'node_1', target: 'node_2' },
      { source: 'node_1', target: 'node_3' }
    );
  } else {
    // Generic workflow
    nodes.push(
      { id: 'node_1', connector: 'jira', tool: 'create_issue', params: { project: 'PROJ', summary: 'Workflow task', priority: 'P2' }, dependencies: [], type: 'standard', confidenceScore: 85, label: 'Create Task' },
      { id: 'node_2', connector: 'slack', tool: 'send_message', params: { channel: 'general', text: 'New workflow task created: $output.node_1.key' }, dependencies: ['node_1'], type: 'standard', confidenceScore: 82, label: 'Send Notification' },
      { id: 'node_3', connector: 'sheets', tool: 'append_row', params: { sheetName: 'Bug Tracker', values: ['$output.node_1.key', '$output.node_1.summary', 'P2', 'Open', 'system', new Date().toISOString()] }, dependencies: ['node_2'], type: 'standard', confidenceScore: 88, label: 'Log Entry' }
    );
    edges.push(
      { source: 'node_1', target: 'node_2' },
      { source: 'node_2', target: 'node_3' }
    );
  }

  return { nodes, edges };
}

