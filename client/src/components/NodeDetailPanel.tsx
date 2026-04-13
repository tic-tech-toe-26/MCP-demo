import React from 'react';
import { useWorkflowStore } from '../stores/workflowStore';

export default function NodeDetailPanel() {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useWorkflowStore((s) => s.setSelectedNodeId);
  const executionDag = useWorkflowStore((s) => s.executionDag);
  const nodeExecutions = useWorkflowStore((s) => s.nodeExecutions);

  if (!selectedNodeId || !executionDag) return null;

  const node = executionDag.nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const execution = nodeExecutions[selectedNodeId];

  return (
    <div className="node-detail-panel">
      <div className="node-detail-header">
        <div>
          <h3>{node.label}</h3>
          <span className="text-xs text-muted font-mono">{node.connector}.{node.tool}</span>
        </div>
        <button className="node-detail-close" onClick={() => setSelectedNodeId(null)}>✕</button>
      </div>

      <div className="node-detail-body">
        {/* Status */}
        <div className="detail-section">
          <div className="detail-section-title">Status</div>
          <div className="flex items-center gap-sm">
            <span className={`node-status-icon ${execution?.status || 'pending'}`}>
              {execution?.status === 'completed' ? '✓' : execution?.status === 'failed' ? '✗' : '•'}
            </span>
            <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>
              {(execution?.status || 'pending').replace(/_/g, ' ')}
            </span>
            {execution?.duration !== undefined && (
              <span className="text-xs text-muted font-mono" style={{ marginLeft: 'auto' }}>
                {execution.duration}ms
              </span>
            )}
          </div>
        </div>

        {/* Confidence */}
        <div className="detail-section">
          <div className="detail-section-title">Confidence Score</div>
          <div className="flex items-center gap-sm">
            <div style={{
              width: '100%',
              height: 8,
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 'var(--radius-full)',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${node.confidenceScore}%`,
                height: '100%',
                borderRadius: 'var(--radius-full)',
                background: node.confidenceScore >= 80 ? 'var(--status-completed)' :
                  node.confidenceScore >= 60 ? 'var(--status-approval)' : 'var(--status-failed)',
                transition: 'width 0.5s ease'
              }} />
            </div>
            <span className="text-xs font-mono" style={{ minWidth: 40 }}>{node.confidenceScore}%</span>
          </div>
        </div>

        {/* Invocation Parameters */}
        <div className="detail-section">
          <div className="detail-section-title">Invocation Parameters</div>
          <div className="json-viewer">
            {JSON.stringify(execution?.request?.params || node.params, null, 2)}
          </div>
        </div>

        {/* Response */}
        {execution?.response && (
          <div className="detail-section">
            <div className="detail-section-title">Response</div>
            <div className="json-viewer">
              {JSON.stringify(execution.response, null, 2)}
            </div>
          </div>
        )}

        {/* Error */}
        {execution?.error && (
          <div className="detail-section">
            <div className="detail-section-title">Error</div>
            <div className="json-viewer" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
              {execution.error}
            </div>
          </div>
        )}

        {/* Anomaly Check */}
        {execution?.anomalyResult && (
          <div className="detail-section">
            <div className="detail-section-title">Anomaly Check</div>
            <div className="json-viewer" style={{
              borderColor: execution.anomalyResult.isAnomaly ? 'rgba(249, 115, 22, 0.3)' : 'rgba(16, 185, 129, 0.2)'
            }}>
              {JSON.stringify(execution.anomalyResult, null, 2)}
            </div>
          </div>
        )}

        {/* Node Info */}
        <div className="detail-section">
          <div className="detail-section-title">Node Info</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <div className="flex justify-between mt-sm">
              <span className="text-muted">ID:</span>
              <span className="font-mono">{node.id}</span>
            </div>
            <div className="flex justify-between mt-sm">
              <span className="text-muted">Type:</span>
              <span>{node.type}</span>
            </div>
            <div className="flex justify-between mt-sm">
              <span className="text-muted">Dependencies:</span>
              <span className="font-mono">{node.dependencies.length > 0 ? node.dependencies.join(', ') : 'None'}</span>
            </div>
            {execution?.retryCount !== undefined && execution.retryCount > 0 && (
              <div className="flex justify-between mt-sm">
                <span className="text-muted">Retries:</span>
                <span>{execution.retryCount}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
