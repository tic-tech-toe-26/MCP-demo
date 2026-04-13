import { v4 as uuidv4 } from 'uuid';
import { BaseMCPConnector } from '../base-connector.js';
import type { ToolManifest, ToolInvocationResult } from '../../planner/dag-types.js';

interface GitBranch {
  name: string;
  baseBranch: string;
  createdAt: string;
}

interface GitPR {
  id: string;
  number: number;
  title: string;
  body: string;
  sourceBranch: string;
  targetBranch: string;
  status: 'open' | 'merged' | 'closed';
  createdAt: string;
}

interface GitIssue {
  id: string;
  number: number;
  title: string;
  body: string;
  labels: string[];
  status: 'open' | 'closed';
  priority: string;
  createdAt: string;
}

export class GitHubConnector extends BaseMCPConnector {
  readonly name = 'github';
  readonly category = 'devops';
  readonly description = 'GitHub - branches, pull requests, and issues management';

  private branches: Map<string, GitBranch> = new Map([
    ['main', { name: 'main', baseBranch: '', createdAt: new Date().toISOString() }],
  ]);
  private pullRequests: Map<string, GitPR> = new Map();
  private issues: Map<string, GitIssue> = new Map();
  private prCounter = 0;
  private issueCounter = 0;

  getTools(): ToolManifest[] {
    return [
      {
        name: 'create_branch',
        description: 'Create a new Git branch from a base branch',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Branch name' },
            baseBranch: { type: 'string', description: 'Base branch (default: main)' },
          },
          required: ['name'],
        },
      },
      {
        name: 'delete_branch',
        description: 'Delete a Git branch',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Branch name to delete' },
          },
          required: ['name'],
        },
      },
      {
        name: 'create_pr',
        description: 'Create a pull request',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'PR title' },
            body: { type: 'string', description: 'PR description' },
            sourceBranch: { type: 'string', description: 'Source branch' },
            targetBranch: { type: 'string', description: 'Target branch (default: main)' },
          },
          required: ['title', 'sourceBranch'],
        },
      },
      {
        name: 'merge_pr',
        description: 'Merge a pull request',
        inputSchema: {
          type: 'object',
          properties: {
            prNumber: { type: 'number', description: 'PR number to merge' },
          },
          required: ['prNumber'],
        },
      },
      {
        name: 'create_issue',
        description: 'Create a GitHub issue',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Issue title' },
            body: { type: 'string', description: 'Issue body' },
            labels: { type: 'array', items: { type: 'string' }, description: 'Labels' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Priority' },
          },
          required: ['title'],
        },
      },
      {
        name: 'close_issue',
        description: 'Close a GitHub issue',
        inputSchema: {
          type: 'object',
          properties: {
            issueNumber: { type: 'number', description: 'Issue number' },
          },
          required: ['issueNumber'],
        },
      },
    ];
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<ToolInvocationResult> {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 90));

    switch (toolName) {
      case 'create_branch': {
        const name = params.name as string;
        const base = (params.baseBranch as string) || 'main';
        if (this.branches.has(name)) {
          return { success: false, error: `Branch "${name}" already exists`, duration: Date.now() - start };
        }
        if (!this.branches.has(base)) {
          return { success: false, error: `Base branch "${base}" not found`, duration: Date.now() - start };
        }
        const branch: GitBranch = { name, baseBranch: base, createdAt: new Date().toISOString() };
        this.branches.set(name, branch);
        return { success: true, data: branch, duration: Date.now() - start };
      }

      case 'delete_branch': {
        const name = params.name as string;
        if (name === 'main') return { success: false, error: 'Cannot delete main branch', duration: Date.now() - start };
        const deleted = this.branches.delete(name);
        if (!deleted) return { success: false, error: `Branch "${name}" not found`, duration: Date.now() - start };
        return { success: true, data: { deleted: name }, duration: Date.now() - start };
      }

      case 'create_pr': {
        this.prCounter++;
        const pr: GitPR = {
          id: uuidv4(),
          number: this.prCounter,
          title: params.title as string,
          body: (params.body as string) || '',
          sourceBranch: params.sourceBranch as string,
          targetBranch: (params.targetBranch as string) || 'main',
          status: 'open',
          createdAt: new Date().toISOString(),
        };
        this.pullRequests.set(String(pr.number), pr);
        return { success: true, data: pr, duration: Date.now() - start };
      }

      case 'merge_pr': {
        const prNum = String(params.prNumber);
        const pr = this.pullRequests.get(prNum);
        if (!pr) return { success: false, error: `PR #${prNum} not found`, duration: Date.now() - start };
        if (pr.status !== 'open') return { success: false, error: `PR #${prNum} is not open`, duration: Date.now() - start };
        pr.status = 'merged';
        return { success: true, data: { ...pr, mergedAt: new Date().toISOString() }, duration: Date.now() - start };
      }

      case 'create_issue': {
        this.issueCounter++;
        const issue: GitIssue = {
          id: uuidv4(),
          number: this.issueCounter,
          title: params.title as string,
          body: (params.body as string) || '',
          labels: (params.labels as string[]) || [],
          status: 'open',
          priority: (params.priority as string) || 'medium',
          createdAt: new Date().toISOString(),
        };
        this.issues.set(String(issue.number), issue);
        return { success: true, data: issue, duration: Date.now() - start };
      }

      case 'close_issue': {
        const issueNum = String(params.issueNumber);
        const issue = this.issues.get(issueNum);
        if (!issue) return { success: false, error: `Issue #${issueNum} not found`, duration: Date.now() - start };
        issue.status = 'closed';
        return { success: true, data: issue, duration: Date.now() - start };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}`, duration: Date.now() - start };
    }
  }
}
