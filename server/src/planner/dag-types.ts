// =====================================================
// DAG Type Definitions
// =====================================================

export type NodeType = 'standard' | 'approval_gate' | 'conditional' | 'anomaly_checkpoint';

export type NodeStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'approval_pending'
  | 'anomaly_flagged'
  | 'rolled_back'
  | 'cancelled'
  | 'skipped';

export interface DAGNode {
  id: string;
  connector: string;
  tool: string;
  params: Record<string, unknown>;
  dependencies: string[];
  type: NodeType;
  confidenceScore: number;
  label: string;
  description?: string;
  retryPolicy?: RetryPolicy;
  condition?: ConditionalBranch;
}

export interface DAGEdge {
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

export interface ExecutionDAG {
  id: string;
  nodes: DAGNode[];
  edges: DAGEdge[];
  metadata: {
    intent: string;
    riskLevel: RiskLevel;
    createdAt: string;
    description: string;
  };
}

export interface RollbackDAG {
  id: string;
  nodes: DAGNode[];
  edges: DAGEdge[];
  originalDagId: string;
}

export interface ConditionalBranch {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt';
  value: unknown;
  trueBranch: string[];
  falseBranch: string[];
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  useJitter: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  useJitter: true,
};

// =====================================================
// Intent & Pre-Planning Types
// =====================================================

export type IntentCategory =
  | 'incident_response'
  | 'release_management'
  | 'data_pipeline'
  | 'onboarding'
  | 'reporting'
  | 'custom';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface IntentAnalysis {
  category: IntentCategory;
  confidence: number;
  riskLevel: RiskLevel;
  riskRationale: string;
  clarifications: ClarificationQuestion[];
  ambiguities: string[];
  runbookId: string;
  runbookTemplate: RunbookTemplate;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  field: string;
  required: boolean;
  defaultValue?: string;
}

export interface RunbookTemplate {
  id: string;
  name: string;
  description: string;
  requiredFields: string[];
  suggestedSteps: string[];
  connectors: string[];
}

// =====================================================
// Execution Types
// =====================================================

export interface NodeExecution {
  nodeId: string;
  status: NodeStatus;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  request: {
    connector: string;
    tool: string;
    params: Record<string, unknown>;
  };
  response?: unknown;
  error?: string;
  retryCount: number;
  anomalyResult?: AnomalyResult;
  confidenceScore: number;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  suggestedAction: 'ignore' | 'modify' | 'rollback';
  details?: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  executionDag: ExecutionDAG;
  rollbackDag: RollbackDAG;
  nodeExecutions: Map<string, NodeExecution>;
  status: 'planning' | 'ready' | 'running' | 'paused' | 'completed' | 'failed' | 'rolling_back' | 'rolled_back';
  startedAt?: string;
  completedAt?: string;
  totalDuration?: number;
  originalIntent: string;
  conversationHistory: ConversationMessage[];
  context: RuntimeContext;
}

export interface RuntimeContext {
  outputs: Record<string, unknown>;
  summaries: Record<string, string>;
  fullPayloads: Record<string, unknown>;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

// =====================================================
// MCP Types
// =====================================================

export interface ToolManifest {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ConnectorManifest {
  name: string;
  category: string;
  description: string;
  tools: ToolManifest[];
}

export interface PermissionRule {
  connector: string;
  allowedOperations: string[];
  deniedOperations: string[];
  maxCallsPerMinute: number;
}

export interface ToolInvocationResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
}

// =====================================================
// Audit Types
// =====================================================

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  workflowId: string;
  runId: string;
  nodeId: string;
  connector: string;
  operation: string;
  requestParams: Record<string, unknown>;
  responseData: unknown;
  status: 'success' | 'failure' | 'rejected' | 'rolled_back';
  user: string;
  anomalyResult?: AnomalyResult;
  duration: number;
  isRollback: boolean;
}

export interface AuditQueryParams {
  connector?: string;
  startTime?: string;
  endTime?: string;
  operationType?: string;
  workflowId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

// =====================================================
// WebSocket Event Types
// =====================================================

export type WSEventType =
  | 'node:pending'
  | 'node:running'
  | 'node:completed'
  | 'node:failed'
  | 'node:approval-required'
  | 'node:anomaly-detected'
  | 'node:rollback-started'
  | 'node:rollback-completed'
  | 'node:cancelled'
  | 'execution:started'
  | 'execution:completed'
  | 'execution:failed'
  | 'rollback:started'
  | 'rollback:completed';

export interface WSEvent {
  type: WSEventType;
  workflowId: string;
  runId: string;
  timestamp: string;
  payload: unknown;
}

// =====================================================
// API Request/Response Types
// =====================================================

export interface AnalyzeRequest {
  input: string;
  sessionId?: string;
}

export interface AnalyzeResponse {
  sessionId: string;
  intent: IntentAnalysis;
}

export interface PlanRequest {
  sessionId: string;
  input: string;
  clarifications?: Record<string, string>;
}

export interface PlanResponse {
  sessionId: string;
  executionDag: ExecutionDAG;
  rollbackDag: RollbackDAG;
}

export interface ExecuteRequest {
  sessionId: string;
  dagId: string;
}

export interface ApprovalRequest {
  action: 'approve' | 'reject' | 'modify';
  modifications?: Record<string, unknown>;
  user: string;
}

export interface AnomalyResponseRequest {
  action: 'ignore' | 'modify' | 'rollback';
  modifications?: Record<string, unknown>;
}

export interface ReplayRequest {
  runId: string;
  fromNodeId: string;
}

// =====================================================
// HITL Types
// =====================================================

export interface HITLApprovalGate {
  nodeId: string;
  toolCall: {
    connector: string;
    tool: string;
    params: Record<string, unknown>;
  };
  explanation: string;
  consequences: string;
  confidenceScore: number;
  timestamp: string;
}
