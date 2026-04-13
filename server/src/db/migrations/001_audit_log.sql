CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  connector TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_params TEXT NOT NULL,
  response_data TEXT,
  status TEXT NOT NULL CHECK(status IN ('success', 'failure', 'rejected', 'rolled_back')),
  user_identity TEXT NOT NULL DEFAULT 'system',
  anomaly_result TEXT,
  duration_ms REAL NOT NULL DEFAULT 0,
  is_rollback INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_audit_connector ON audit_log(connector);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_operation ON audit_log(operation);
CREATE INDEX IF NOT EXISTS idx_audit_workflow ON audit_log(workflow_id);
CREATE INDEX IF NOT EXISTS idx_audit_status ON audit_log(status);
