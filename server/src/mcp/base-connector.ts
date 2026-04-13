import { v4 as uuidv4 } from 'uuid';
import { appendAuditLog } from '../db/sqlite.js';
import type {
  ToolManifest,
  ConnectorManifest,
  ToolInvocationResult,
  AuditLogEntry,
} from '../planner/dag-types.js';

export abstract class BaseMCPConnector {
  abstract readonly name: string;
  abstract readonly category: string;
  abstract readonly description: string;

  protected allowedOperations: Set<string> = new Set();
  protected deniedOperations: Set<string> = new Set();

  abstract getTools(): ToolManifest[];
  abstract executeTool(toolName: string, params: Record<string, unknown>): Promise<ToolInvocationResult>;

  getManifest(): ConnectorManifest {
    return {
      name: this.name,
      category: this.category,
      description: this.description,
      tools: this.getTools(),
    };
  }

  setPermissions(allowed: string[], denied: string[]): void {
    this.allowedOperations = new Set(allowed);
    this.deniedOperations = new Set(denied);
  }

  private checkPermission(toolName: string): void {
    if (this.deniedOperations.has(toolName)) {
      throw new Error(
        `Permission denied: Operation "${toolName}" is explicitly denied for connector "${this.name}". ` +
        `Check the permission manifest.`
      );
    }
    if (this.allowedOperations.size > 0 && !this.allowedOperations.has(toolName)) {
      throw new Error(
        `Permission denied: Operation "${toolName}" is not in the allowed operations list for connector "${this.name}". ` +
        `Allowed: [${[...this.allowedOperations].join(', ')}]`
      );
    }
  }

  async invokeTool(
    toolName: string,
    params: Record<string, unknown>,
    meta: { workflowId: string; runId: string; nodeId: string; user?: string; isRollback?: boolean }
  ): Promise<ToolInvocationResult> {
    // Permission check
    this.checkPermission(toolName);

    const startTime = Date.now();
    let result: ToolInvocationResult;

    try {
      result = await this.executeTool(toolName, params);
    } catch (err) {
      result = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration: Date.now() - startTime,
      };
    }

    // Audit log
    const auditEntry: AuditLogEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      workflowId: meta.workflowId,
      runId: meta.runId,
      nodeId: meta.nodeId,
      connector: this.name,
      operation: toolName,
      requestParams: params,
      responseData: result.data ?? result.error,
      status: result.success ? 'success' : 'failure',
      user: meta.user || 'system',
      duration: result.duration,
      isRollback: meta.isRollback || false,
    };

    try {
      appendAuditLog(auditEntry);
    } catch (e) {
      console.error('Failed to write audit log:', e);
    }

    return result;
  }
}
