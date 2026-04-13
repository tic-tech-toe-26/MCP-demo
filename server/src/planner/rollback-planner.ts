import { v4 as uuidv4 } from 'uuid';
import type { ExecutionDAG, RollbackDAG, DAGNode, DAGEdge } from './dag-types.js';

// Mapping of tool operations to their inverse/compensating actions
const TOOL_INVERSE_MAP: Record<string, Record<string, { tool: string; paramMapper: (params: Record<string, unknown>) => Record<string, unknown> }>> = {
  jira: {
    create_issue: {
      tool: 'delete_issue',
      paramMapper: (params) => ({ issueKey: '$output.SELF.key' }),
    },
    transition_issue: {
      tool: 'transition_issue',
      paramMapper: (params) => ({ issueKey: params.issueKey, status: 'open' }),
    },
    update_issue: {
      tool: 'update_issue',
      paramMapper: (params) => ({ issueKey: params.issueKey }),
    },
  },
  github: {
    create_branch: {
      tool: 'delete_branch',
      paramMapper: (params) => ({ name: params.name }),
    },
    create_pr: {
      tool: 'close_issue', // Close the PR by number
      paramMapper: (params) => ({ issueNumber: '$output.SELF.number' }),
    },
    merge_pr: {
      tool: 'create_branch', // Can't truly un-merge, but create a revert branch
      paramMapper: (params) => ({ name: `revert/pr-${params.prNumber}`, baseBranch: 'main' }),
    },
    create_issue: {
      tool: 'close_issue',
      paramMapper: (params) => ({ issueNumber: '$output.SELF.number' }),
    },
  },
  slack: {
    send_message: {
      tool: 'send_message', // Send a correction message
      paramMapper: (params) => ({
        channel: params.channel,
        text: `⚠️ [CORRECTION] The previous message has been rolled back. Previous action was undone.`,
      }),
    },
    create_channel: {
      tool: 'send_message', // Can't delete channels via API typically, send notice
      paramMapper: (params) => ({
        channel: params.name,
        text: '⚠️ This channel was created in error and the workflow has been rolled back.',
      }),
    },
  },
  sheets: {
    append_row: {
      tool: 'delete_row',
      paramMapper: (params) => ({
        sheetName: params.sheetName,
        rowIndex: '$output.SELF.rowIndex',
      }),
    },
    update_cell: {
      tool: 'update_cell',
      paramMapper: (params) => ({
        sheetName: params.sheetName,
        row: params.row,
        column: params.column,
        value: '$output.SELF.oldValue', // Restore original value
      }),
    },
    create_sheet: {
      tool: 'delete_row', // Can't delete sheets in mock, just log
      paramMapper: (params) => ({
        sheetName: params.name,
        rowIndex: 1,
      }),
    },
  },
};

export function generateRollbackDAG(executionDag: ExecutionDAG): RollbackDAG {
  const rollbackNodes: DAGNode[] = [];
  const rollbackEdges: DAGEdge[] = [];

  // Reverse the execution order
  const reversedNodes = [...executionDag.nodes].reverse();

  for (let i = 0; i < reversedNodes.length; i++) {
    const originalNode = reversedNodes[i];
    const connectorInverses = TOOL_INVERSE_MAP[originalNode.connector];

    if (!connectorInverses || !connectorInverses[originalNode.tool]) {
      // No inverse available — create a log-only rollback node
      rollbackNodes.push({
        id: `rollback_${originalNode.id}`,
        connector: originalNode.connector,
        tool: 'noop',
        params: { message: `No inverse action available for ${originalNode.connector}.${originalNode.tool}` },
        dependencies: i > 0 ? [`rollback_${reversedNodes[i - 1].id}`] : [],
        type: 'standard',
        confidenceScore: 100,
        label: `⟲ Skip: ${originalNode.label}`,
        description: `No compensating action for ${originalNode.tool}`,
      });
      continue;
    }

    const inverse = connectorInverses[originalNode.tool];
    const rollbackParams = inverse.paramMapper(originalNode.params);

    // Replace $output.SELF references with the original node's output references
    const resolvedParams: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rollbackParams)) {
      if (typeof value === 'string' && value.startsWith('$output.SELF.')) {
        const field = value.replace('$output.SELF.', '');
        resolvedParams[key] = `$output.${originalNode.id}.${field}`;
      } else {
        resolvedParams[key] = value;
      }
    }

    rollbackNodes.push({
      id: `rollback_${originalNode.id}`,
      connector: originalNode.connector,
      tool: inverse.tool,
      params: resolvedParams,
      dependencies: i > 0 ? [`rollback_${reversedNodes[i - 1].id}`] : [],
      type: 'standard',
      confidenceScore: 90,
      label: `⟲ Undo: ${originalNode.label}`,
      description: `Compensating action for ${originalNode.connector}.${originalNode.tool}`,
    });

    // Add sequential edge
    if (i > 0) {
      rollbackEdges.push({
        source: `rollback_${reversedNodes[i - 1].id}`,
        target: `rollback_${originalNode.id}`,
        label: 'rollback sequence',
      });
    }
  }

  return {
    id: uuidv4(),
    nodes: rollbackNodes,
    edges: rollbackEdges,
    originalDagId: executionDag.id,
  };
}

// Generate a partial rollback DAG from a specific node backward
export function generatePartialRollbackDAG(
  executionDag: ExecutionDAG,
  completedNodeIds: string[]
): RollbackDAG {
  // Only include completed nodes in the rollback
  const completedNodes = executionDag.nodes.filter(n => completedNodeIds.includes(n.id));
  const partialDag: ExecutionDAG = {
    ...executionDag,
    nodes: completedNodes,
    edges: executionDag.edges.filter(
      e => completedNodeIds.includes(e.source) && completedNodeIds.includes(e.target)
    ),
  };

  return generateRollbackDAG(partialDag);
}
