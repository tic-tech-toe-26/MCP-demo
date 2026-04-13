import React, { useState } from 'react';
import { useWorkflowStore } from '../stores/workflowStore';
import { api } from '../utils/api';

export default function HITLModal() {
  const activeHITL = useWorkflowStore((s) => s.activeHITL);
  const setActiveHITL = useWorkflowStore((s) => s.setActiveHITL);
  const sessionId = useWorkflowStore((s) => s.sessionId);
  const [modifyMode, setModifyMode] = useState(false);
  const [modifications, setModifications] = useState('');
  const [loading, setLoading] = useState(false);

  if (!activeHITL || !sessionId) return null;

  const handleAction = async (action: 'approve' | 'reject' | 'modify') => {
    setLoading(true);
    try {
      let mods: Record<string, unknown> | undefined;
      if (action === 'modify' && modifications) {
        try { mods = JSON.parse(modifications); } catch { }
      }
      await api.approve(activeHITL.nodeId, sessionId, action, mods);
      setActiveHITL(null);
      setModifyMode(false);
      setModifications('');
    } catch (err) {
      console.error('Approval error:', err);
    } finally {
      setLoading(false);
    }
  };

  const confClass = activeHITL.confidenceScore >= 80 ? 'high' : activeHITL.confidenceScore >= 60 ? 'medium' : 'low';

  return (
    <div className="modal-overlay" id="hitl-modal">
      <div className="modal-content">
        <div className="modal-title">
          <span style={{ fontSize: '1.5rem' }}>🔒</span>
          Approval Required
        </div>

        <div className="modal-description">
          {activeHITL.explanation}
        </div>

        {/* Tool Call Details */}
        <div className="modal-section">
          <div className="detail-section-title">Tool Call</div>
          <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            <div className="flex justify-between mt-sm">
              <span className="text-muted">Connector:</span>
              <span className={`node-connector-badge ${activeHITL.toolCall.connector}`}>
                {activeHITL.toolCall.connector}
              </span>
            </div>
            <div className="flex justify-between mt-sm">
              <span className="text-muted">Tool:</span>
              <span className="font-mono">{activeHITL.toolCall.tool}</span>
            </div>
          </div>
          <div className="json-viewer mt-md">
            {JSON.stringify(activeHITL.toolCall.params, null, 2)}
          </div>
        </div>

        {/* Confidence Score */}
        <div className="modal-section">
          <div className="detail-section-title">Confidence Score</div>
          <div className="flex items-center gap-sm">
            <span className={`confidence-badge ${confClass}`} style={{ fontSize: '1rem', padding: '6px 16px' }}>
              {activeHITL.confidenceScore}%
            </span>
            <span className="text-sm text-muted">
              {activeHITL.confidenceScore < 70
                ? 'Low confidence — manual review strongly recommended'
                : 'Moderate confidence — please verify before approving'}
            </span>
          </div>
        </div>

        {/* Consequences */}
        <div className="modal-section">
          <div className="detail-section-title">Skip Consequences</div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            {activeHITL.consequences}
          </p>
        </div>

        {/* Modify Mode */}
        {modifyMode && (
          <div className="modal-section">
            <div className="detail-section-title">Modify Parameters (JSON)</div>
            <textarea
              className="workflow-textarea"
              style={{ minHeight: 80, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
              value={modifications}
              onChange={(e) => setModifications(e.target.value)}
              placeholder='{ "key": "new-value" }'
            />
          </div>
        )}

        {/* Actions */}
        <div className="modal-actions">
          <button
            className="btn btn-success"
            onClick={() => modifyMode ? handleAction('modify') : handleAction('approve')}
            disabled={loading}
          >
            {modifyMode ? '✓ Modify & Approve' : '✓ Approve'}
          </button>
          {!modifyMode && (
            <button className="btn btn-warning btn-sm" onClick={() => setModifyMode(true)}>
              ✎ Modify
            </button>
          )}
          <button className="btn btn-danger" onClick={() => handleAction('reject')} disabled={loading}>
            ✗ Reject
          </button>
        </div>
      </div>
    </div>
  );
}
