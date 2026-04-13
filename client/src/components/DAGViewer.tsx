import React, { useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CustomNode from './CustomNode';
import { useWorkflowStore } from '../stores/workflowStore';
import { getLayoutedElements } from '../utils/dagLayout';

const nodeTypes = { custom: CustomNode };

export default function DAGViewer() {
  const executionDag = useWorkflowStore((s) => s.executionDag);
  const rollbackDag = useWorkflowStore((s) => s.rollbackDag);
  const activeTab = useWorkflowStore((s) => s.activeTab);
  const setActiveTab = useWorkflowStore((s) => s.setActiveTab);
  const nodeExecutions = useWorkflowStore((s) => s.nodeExecutions);

  const activeDag = activeTab === 'execution' ? executionDag : rollbackDag;

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
    if (!activeDag || !activeDag.nodes.length) {
      return { nodes: [], edges: [] };
    }

    const rfNodes: Node[] = activeDag.nodes.map((node) => ({
      id: node.id,
      type: 'custom',
      position: { x: 0, y: 0 },
      data: {
        ...node,
        status: nodeExecutions[node.id]?.status || 'pending',
      },
    }));

    const rfEdges: Edge[] = activeDag.edges.map((edge, i) => {
      const sourceStatus = nodeExecutions[edge.source]?.status;
      const isCompleted = sourceStatus === 'completed';

      return {
        id: `edge-${i}`,
        source: edge.source,
        target: edge.target,
        animated: isCompleted,
        style: {
          stroke: isCompleted ? 'var(--status-completed)' : 'var(--border-default)',
          strokeWidth: 2,
        },
        label: edge.label,
        labelStyle: { fontSize: 10, fill: 'var(--text-muted)' },
        labelBgStyle: { fill: 'var(--bg-tertiary)', fillOpacity: 0.8 },
      };
    });

    return getLayoutedElements(rfNodes, rfEdges);
  }, [activeDag, nodeExecutions]);

  const completedCount = Object.values(nodeExecutions).filter(n => n.status === 'completed').length;
  const totalCount = executionDag?.nodes.length || 0;

  return (
    <div className="dag-viewer">
      {/* Tab Toggle */}
      {executionDag && (
        <div className="dag-tabs">
          <button
            className={`dag-tab ${activeTab === 'execution' ? 'active' : ''}`}
            onClick={() => setActiveTab('execution')}
          >
            ▶ Execution DAG
          </button>
          <button
            className={`dag-tab ${activeTab === 'rollback' ? 'active' : ''}`}
            onClick={() => setActiveTab('rollback')}
          >
            ↩ Rollback DAG
          </button>
        </div>
      )}

      {/* Empty State */}
      {!activeDag && (
        <div className="dag-empty-state">
          <div className="empty-icon">◇</div>
          <h3>No Workflow Yet</h3>
          <p>Describe your workflow in natural language and click "Decompose" to generate an execution DAG.</p>
        </div>
      )}

      {/* React Flow */}
      {activeDag && layoutedNodes.length > 0 && (
        <ReactFlow
          nodes={layoutedNodes}
          edges={layoutedEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
          maxZoom={2}
        >
          <Controls position="bottom-left" />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.03)" />
        </ReactFlow>
      )}

      {/* Stats */}
      {executionDag && (
        <div className="dag-stats">
          <span className="dag-stat">Nodes: {totalCount}</span>
          <span className="dag-stat">Completed: {completedCount}/{totalCount}</span>
          <span className="dag-stat">Edges: {executionDag.edges.length}</span>
        </div>
      )}
    </div>
  );
}
