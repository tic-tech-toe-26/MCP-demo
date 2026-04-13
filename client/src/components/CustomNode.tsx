import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useWorkflowStore } from '../stores/workflowStore';

const STATUS_ICONS: Record<string, string> = {
  pending: '⏳',
  running: '⚡',
  completed: '✓',
  failed: '✗',
  approval_pending: '🔒',
  anomaly_flagged: '⚠',
  rolled_back: '↩',
  cancelled: '⊘',
  skipped: '⊘',
};

const CONNECTOR_ICONS: Record<string, string> = {
  jira: '📋',
  slack: '💬',
  github: '🔧',
  sheets: '📊',
};

function CustomNode({ data, id }: { data: Record<string, unknown>; id: string }) {
  const nodeExecutions = useWorkflowStore((s) => s.nodeExecutions);
  const setSelectedNodeId = useWorkflowStore((s) => s.setSelectedNodeId);

  const execution = nodeExecutions[id];
  const status = execution?.status || (data.status as string) || 'pending';
  const connector = data.connector as string;
  const tool = data.tool as string;
  const label = data.label as string;
  const confidenceScore = data.confidenceScore as number;
  const nodeType = data.type as string;

  const confidenceClass = confidenceScore >= 80 ? 'high' : confidenceScore >= 60 ? 'medium' : 'low';

  return (
    <div className={`dag-node ${status}`} onClick={() => setSelectedNodeId(id)}>
      <Handle type="target" position={Position.Top} style={{ background: 'var(--border-default)', border: 'none', width: 8, height: 8 }} />

      <div className="node-header">
        <span className={`node-connector-badge ${connector}`}>
          {CONNECTOR_ICONS[connector] || '🔌'} {connector}
        </span>
        <span className={`node-status-icon ${status}`}>
          {STATUS_ICONS[status] || '•'}
        </span>
      </div>

      <div className="node-label">{label}</div>
      <div className="node-tool">{connector}.{tool}</div>

      <div className="node-footer">
        <span className={`confidence-badge ${confidenceClass}`}>
          {confidenceScore}%
        </span>
        {nodeType !== 'standard' && (
          <span className={`node-type-badge ${nodeType}`}>
            {nodeType === 'approval_gate' ? '🔒 Gate' : nodeType === 'conditional' ? '⑂ Cond' : '🔍 Check'}
          </span>
        )}
      </div>

      {execution?.duration !== undefined && (
        <div style={{ marginTop: 4, fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {execution.duration}ms
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--border-default)', border: 'none', width: 8, height: 8 }} />
    </div>
  );
}

export default memo(CustomNode);
