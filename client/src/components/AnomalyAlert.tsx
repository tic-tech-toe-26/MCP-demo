import React from 'react';
import { useWorkflowStore } from '../stores/workflowStore';
import { api } from '../utils/api';

export default function AnomalyAlert() {
  const activeAnomaly = useWorkflowStore((s) => s.activeAnomaly);
  const setActiveAnomaly = useWorkflowStore((s) => s.setActiveAnomaly);
  const sessionId = useWorkflowStore((s) => s.sessionId);

  if (!activeAnomaly || !sessionId) return null;

  const handleAction = async (action: 'ignore' | 'modify' | 'rollback') => {
    try {
      await api.anomalyResponse(sessionId, activeAnomaly.nodeId, action);
      setActiveAnomaly(null);
    } catch (err) {
      console.error('Anomaly response error:', err);
    }
  };

  return (
    <div className="anomaly-alert" id="anomaly-alert">
      <div className="anomaly-alert-content">
        <div className="anomaly-header">
          <div className="anomaly-icon">⚠</div>
          <div>
            <div className="anomaly-title">Anomaly Detected</div>
            <div className="anomaly-severity">
              Severity: <strong style={{ textTransform: 'uppercase' }}>{activeAnomaly.severity}</strong> • Node: {activeAnomaly.nodeId}
            </div>
          </div>
        </div>

        <div className="anomaly-description">
          {activeAnomaly.description}
        </div>

        <div className="anomaly-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => handleAction('ignore')}>
            Ignore & Continue
          </button>
          <button className="btn btn-warning btn-sm" onClick={() => handleAction('modify')}>
            Modify Next Step
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => handleAction('rollback')}>
            ↩ Trigger Rollback
          </button>
        </div>
      </div>
    </div>
  );
}
