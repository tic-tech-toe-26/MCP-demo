import React, { useState, useEffect } from 'react';
import { useWorkflowStore } from '../stores/workflowStore';
import { api } from '../utils/api';

export default function AuditLog() {
  const auditCollapsed = useWorkflowStore((s) => s.auditCollapsed);
  const setAuditCollapsed = useWorkflowStore((s) => s.setAuditCollapsed);
  const auditEntries = useWorkflowStore((s) => s.auditEntries);
  const setAuditEntries = useWorkflowStore((s) => s.setAuditEntries);
  const [filter, setFilter] = useState({ connector: '', status: '' });

  const fetchAudit = async () => {
    try {
      const params: Record<string, string> = {};
      if (filter.connector) params.connector = filter.connector;
      if (filter.status) params.status = filter.status;
      const result = await api.getAuditLog(params);
      setAuditEntries(result.entries as Array<Record<string, unknown>>);
    } catch (err) {
      console.error('Audit fetch error:', err);
    }
  };

  useEffect(() => {
    if (!auditCollapsed) {
      fetchAudit();
      const interval = setInterval(fetchAudit, 5000);
      return () => clearInterval(interval);
    }
  }, [auditCollapsed, filter]);

  return (
    <div className={`audit-panel ${auditCollapsed ? 'collapsed' : ''}`} id="audit-panel">
      <div className="audit-panel-header" onClick={() => setAuditCollapsed(!auditCollapsed)}>
        <div className="audit-panel-title">
          <span>📋</span>
          Audit Log
          <span className="text-xs font-mono">({auditEntries.length} entries)</span>
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {auditCollapsed ? '▲' : '▼'}
        </span>
      </div>

      {!auditCollapsed && (
        <>
          <div className="audit-filters">
            <select
              className="audit-filter-select"
              value={filter.connector}
              onChange={(e) => setFilter((f) => ({ ...f, connector: e.target.value }))}
            >
              <option value="">All Connectors</option>
              <option value="jira">Jira</option>
              <option value="slack">Slack</option>
              <option value="github">GitHub</option>
              <option value="sheets">Sheets</option>
            </select>
            <select
              className="audit-filter-select"
              value={filter.status}
              onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">All Status</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
              <option value="rejected">Rejected</option>
              <option value="rolled_back">Rolled Back</option>
            </select>
            <button className="btn btn-secondary btn-sm" onClick={fetchAudit}>
              ↻ Refresh
            </button>
          </div>

          <div className="audit-table-container">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Connector</th>
                  <th>Operation</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Rollback</th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((entry, i) => (
                  <tr key={i}>
                    <td>{new Date(entry.timestamp as string).toLocaleTimeString()}</td>
                    <td>
                      <span className={`node-connector-badge ${entry.connector}`}>
                        {entry.connector as string}
                      </span>
                    </td>
                    <td>{entry.operation as string}</td>
                    <td>
                      <span className={`status-dot ${entry.status}`} />
                      {entry.status as string}
                    </td>
                    <td>{(entry.duration as number)?.toFixed(0)}ms</td>
                    <td>{entry.isRollback ? '↩' : '—'}</td>
                  </tr>
                ))}
                {auditEntries.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                      No audit entries yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
