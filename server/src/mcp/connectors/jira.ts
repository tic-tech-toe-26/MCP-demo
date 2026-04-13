import { v4 as uuidv4 } from 'uuid';
import { BaseMCPConnector } from '../base-connector.js';
import type { ToolManifest, ToolInvocationResult } from '../../planner/dag-types.js';

interface JiraIssue {
  id: string;
  key: string;
  project: string;
  summary: string;
  description: string;
  priority: string;
  status: string;
  assignee: string;
  labels: string[];
  createdAt: string;
}

export class JiraConnector extends BaseMCPConnector {
  readonly name = 'jira';
  readonly category = 'project_management';
  readonly description = 'Jira project management - create, update, and manage issues';

  private issues: Map<string, JiraIssue> = new Map();
  private issueCounter = 0;

  getTools(): ToolManifest[] {
    return [
      {
        name: 'create_issue',
        description: 'Create a new Jira issue with the specified details',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Project key (e.g., "PROJ")' },
            summary: { type: 'string', description: 'Issue summary/title' },
            description: { type: 'string', description: 'Detailed description' },
            priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3', 'P4'], description: 'Priority level' },
            assignee: { type: 'string', description: 'Assignee username' },
            labels: { type: 'array', items: { type: 'string' }, description: 'Labels to add' },
          },
          required: ['project', 'summary', 'priority'],
        },
      },
      {
        name: 'get_issue',
        description: 'Retrieve a Jira issue by its key',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Issue key (e.g., "PROJ-123")' },
          },
          required: ['issueKey'],
        },
      },
      {
        name: 'update_issue',
        description: 'Update fields on an existing Jira issue',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Issue key' },
            summary: { type: 'string' },
            description: { type: 'string' },
            priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3', 'P4'] },
            assignee: { type: 'string' },
            labels: { type: 'array', items: { type: 'string' } },
          },
          required: ['issueKey'],
        },
      },
      {
        name: 'transition_issue',
        description: 'Transition an issue to a new status',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Issue key' },
            status: { type: 'string', enum: ['open', 'in_progress', 'in_review', 'done', 'closed'], description: 'Target status' },
          },
          required: ['issueKey', 'status'],
        },
      },
      {
        name: 'delete_issue',
        description: 'Delete a Jira issue permanently',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Issue key to delete' },
          },
          required: ['issueKey'],
        },
      },
      {
        name: 'list_issues',
        description: 'List issues in a project, optionally filtered by status',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Project key' },
            status: { type: 'string', description: 'Filter by status' },
          },
          required: ['project'],
        },
      },
    ];
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<ToolInvocationResult> {
    const start = Date.now();

    // Simulate network latency
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));

    switch (toolName) {
      case 'create_issue': {
        this.issueCounter++;
        const project = params.project as string;
        const key = `${project}-${this.issueCounter}`;
        const issue: JiraIssue = {
          id: uuidv4(),
          key,
          project,
          summary: (params.summary as string) || '',
          description: (params.description as string) || '',
          priority: (params.priority as string) || 'P2',
          status: 'open',
          assignee: (params.assignee as string) || 'unassigned',
          labels: (params.labels as string[]) || [],
          createdAt: new Date().toISOString(),
        };
        this.issues.set(key, issue);
        return { success: true, data: issue, duration: Date.now() - start };
      }

      case 'get_issue': {
        const issue = this.issues.get(params.issueKey as string);
        if (!issue) return { success: false, error: `Issue ${params.issueKey} not found`, duration: Date.now() - start };
        return { success: true, data: issue, duration: Date.now() - start };
      }

      case 'update_issue': {
        const existing = this.issues.get(params.issueKey as string);
        if (!existing) return { success: false, error: `Issue ${params.issueKey} not found`, duration: Date.now() - start };
        if (params.summary) existing.summary = params.summary as string;
        if (params.description) existing.description = params.description as string;
        if (params.priority) existing.priority = params.priority as string;
        if (params.assignee) existing.assignee = params.assignee as string;
        if (params.labels) existing.labels = params.labels as string[];
        return { success: true, data: existing, duration: Date.now() - start };
      }

      case 'transition_issue': {
        const issue = this.issues.get(params.issueKey as string);
        if (!issue) return { success: false, error: `Issue ${params.issueKey} not found`, duration: Date.now() - start };
        issue.status = params.status as string;
        return { success: true, data: issue, duration: Date.now() - start };
      }

      case 'delete_issue': {
        const key = params.issueKey as string;
        const deleted = this.issues.delete(key);
        if (!deleted) return { success: false, error: `Issue ${key} not found`, duration: Date.now() - start };
        return { success: true, data: { deleted: key }, duration: Date.now() - start };
      }

      case 'list_issues': {
        const project = params.project as string;
        const status = params.status as string | undefined;
        const filtered = Array.from(this.issues.values()).filter(
          (i) => i.project === project && (!status || i.status === status)
        );
        return { success: true, data: { issues: filtered, total: filtered.length }, duration: Date.now() - start };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}`, duration: Date.now() - start };
    }
  }
}
