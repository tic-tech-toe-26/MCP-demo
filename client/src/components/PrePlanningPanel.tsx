import React from 'react';
import { useWorkflowStore } from '../stores/workflowStore';

export default function PrePlanningPanel() {
  const intent = useWorkflowStore((s) => s.intent);
  const clarifications = useWorkflowStore((s) => s.clarifications);
  const setClarification = useWorkflowStore((s) => s.setClarification);
  const phase = useWorkflowStore((s) => s.phase);

  if (!intent || (phase !== 'pre-planning' && phase !== 'planning' && phase !== 'review' && phase !== 'executing' && phase !== 'completed' && phase !== 'failed')) {
    return null;
  }

  return (
    <div className="pre-planning-panel" id="pre-planning-panel">
      {/* Intent Classification */}
      <div className="section-title">Intent Classification</div>
      <div className="flex items-center gap-sm" style={{ flexWrap: 'wrap' }}>
        <span className={`intent-badge ${intent.category}`}>
          {intent.category.replace(/_/g, ' ')}
        </span>
        <span className="text-xs font-mono text-muted">{intent.confidence}% confident</span>
      </div>

      {/* Risk Level */}
      <div className="section-title">Risk Assessment</div>
      <div className="flex items-center gap-sm" style={{ flexWrap: 'wrap' }}>
        <span className={`risk-indicator ${intent.riskLevel}`}>
          {intent.riskLevel === 'high' ? '🔴' : intent.riskLevel === 'medium' ? '🟡' : '🟢'} {intent.riskLevel.toUpperCase()}
        </span>
      </div>
      <p className="text-xs text-muted mt-sm" style={{ lineHeight: 1.6 }}>
        {intent.riskRationale}
      </p>

      {/* Runbook Template */}
      <div className="section-title">Runbook Template</div>
      <div style={{
        padding: '10px 14px',
        background: 'rgba(59, 130, 246, 0.05)',
        border: '1px solid rgba(59, 130, 246, 0.15)',
        borderRadius: 'var(--radius-sm)',
        marginBottom: 4,
      }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-accent)' }}>
          {intent.runbookTemplate.name}
        </div>
        <div className="text-xs text-muted mt-sm">{intent.runbookTemplate.description}</div>
      </div>

      {/* Suggested Steps */}
      {intent.runbookTemplate.suggestedSteps.length > 0 && (
        <>
          <div className="section-title">Suggested Steps</div>
          <ul className="suggested-steps">
            {intent.runbookTemplate.suggestedSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </>
      )}

      {/* Connectors Used */}
      <div className="section-title">Connectors</div>
      <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
        {intent.runbookTemplate.connectors.map((c) => (
          <span key={c} className={`node-connector-badge ${c}`} style={{ fontSize: '0.7rem' }}>
            {c === 'jira' ? '📋' : c === 'slack' ? '💬' : c === 'github' ? '🔧' : '📊'} {c}
          </span>
        ))}
      </div>

      {/* Ambiguities */}
      {intent.ambiguities.length > 0 && (
        <>
          <div className="section-title">⚠ Ambiguities Detected</div>
          <div className="clarification-list">
            {intent.ambiguities.map((amb, i) => (
              <div key={i} className="clarification-item" style={{ borderColor: 'rgba(249, 115, 22, 0.3)' }}>
                {amb}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Clarification Questions */}
      {intent.clarifications.length > 0 && (
        <>
          <div className="section-title">Clarification Needed</div>
          <div className="clarification-list">
            {intent.clarifications.map((q) => (
              <div key={q.id} className="clarification-item">
                <div style={{ marginBottom: 4, color: 'var(--text-primary)', fontWeight: 500 }}>
                  {q.question}
                  {q.required && <span style={{ color: '#fca5a5', marginLeft: 4 }}>*</span>}
                </div>
                <input
                  className="clarification-input"
                  placeholder={q.defaultValue || 'Enter value...'}
                  value={clarifications[q.field] || ''}
                  onChange={(e) => setClarification(q.field, e.target.value)}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
