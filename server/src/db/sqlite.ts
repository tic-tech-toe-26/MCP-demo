import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { AuditLogEntry, AuditQueryParams } from '../planner/dag-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db: Database.Database | null = null;

export function getDatabase(dbPath?: string): Database.Database {
  if (db) return db;

  const path = dbPath || process.env.SQLITE_DB_PATH || './data/audit.db';

  // Ensure data directory exists
  const dirPath = dirname(path);
  mkdirSync(dirPath, { recursive: true });

  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations
  const migrationSql = readFileSync(
    join(__dirname, 'migrations', '001_audit_log.sql'),
    'utf-8'
  );
  db.exec(migrationSql);

  return db;
}

export function appendAuditLog(entry: AuditLogEntry): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT INTO audit_log (
      id, timestamp, workflow_id, run_id, node_id, connector,
      operation, request_params, response_data, status,
      user_identity, anomaly_result, duration_ms, is_rollback
    ) VALUES (
      @id, @timestamp, @workflowId, @runId, @nodeId, @connector,
      @operation, @requestParams, @responseData, @status,
      @user, @anomalyResult, @duration, @isRollback
    )
  `);

  stmt.run({
    id: entry.id,
    timestamp: entry.timestamp,
    workflowId: entry.workflowId,
    runId: entry.runId,
    nodeId: entry.nodeId,
    connector: entry.connector,
    operation: entry.operation,
    requestParams: JSON.stringify(entry.requestParams),
    responseData: JSON.stringify(entry.responseData),
    status: entry.status,
    user: entry.user,
    anomalyResult: entry.anomalyResult ? JSON.stringify(entry.anomalyResult) : null,
    duration: entry.duration,
    isRollback: entry.isRollback ? 1 : 0,
  });
}

export function queryAuditLog(params: AuditQueryParams): AuditLogEntry[] {
  const database = getDatabase();
  const conditions: string[] = [];
  const values: Record<string, unknown> = {};

  if (params.connector) {
    conditions.push('connector = @connector');
    values.connector = params.connector;
  }
  if (params.startTime) {
    conditions.push('timestamp >= @startTime');
    values.startTime = params.startTime;
  }
  if (params.endTime) {
    conditions.push('timestamp <= @endTime');
    values.endTime = params.endTime;
  }
  if (params.operationType) {
    conditions.push('operation = @operationType');
    values.operationType = params.operationType;
  }
  if (params.workflowId) {
    conditions.push('workflow_id = @workflowId');
    values.workflowId = params.workflowId;
  }
  if (params.status) {
    conditions.push('status = @status');
    values.status = params.status;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = params.limit || 100;
  const offset = params.offset || 0;

  const stmt = database.prepare(`
    SELECT * FROM audit_log ${where}
    ORDER BY timestamp DESC
    LIMIT @limit OFFSET @offset
  `);

  const rows = stmt.all({ ...values, limit, offset }) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: row.id as string,
    timestamp: row.timestamp as string,
    workflowId: row.workflow_id as string,
    runId: row.run_id as string,
    nodeId: row.node_id as string,
    connector: row.connector as string,
    operation: row.operation as string,
    requestParams: JSON.parse(row.request_params as string),
    responseData: row.response_data ? JSON.parse(row.response_data as string) : null,
    status: row.status as AuditLogEntry['status'],
    user: row.user_identity as string,
    anomalyResult: row.anomaly_result ? JSON.parse(row.anomaly_result as string) : undefined,
    duration: row.duration_ms as number,
    isRollback: Boolean(row.is_rollback),
  }));
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
