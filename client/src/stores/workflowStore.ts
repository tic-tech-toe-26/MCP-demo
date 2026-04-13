import { create } from 'zustand';

export interface DAGNodeData {
  id: string;
  connector: string;
  tool: string;
  params: Record<string, unknown>;
  dependencies: string[];
  type: string;
  confidenceScore: number;
  label: string;
  description?: string;
}

export interface DAGEdgeData {
  source: string;
  target: string;
  label?: string;
}

export interface IntentData {
  category: string;
  confidence: number;
  riskLevel: string;
  riskRationale: string;
  clarifications: Array<{
    id: string;
    question: string;
    field: string;
    required: boolean;
    defaultValue?: string;
  }>;
  ambiguities: string[];
  runbookId: string;
  runbookTemplate: {
    name: string;
    description: string;
    requiredFields: string[];
    suggestedSteps: string[];
    connectors: string[];
  };
}

export interface NodeExecutionData {
  nodeId: string;
  status: string;
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
  anomalyResult?: {
    isAnomaly: boolean;
    severity: string;
    description: string;
    suggestedAction: string;
  };
  confidenceScore: number;
}

export interface AnomalyAlert {
  nodeId: string;
  severity: string;
  description: string;
  suggestedAction: string;
}

export interface HITLGate {
  nodeId: string;
  toolCall: {
    connector: string;
    tool: string;
    params: Record<string, unknown>;
  };
  explanation: string;
  consequences: string;
  confidenceScore: number;
}

export type AppPhase = 'input' | 'analyzing' | 'pre-planning' | 'planning' | 'review' | 'executing' | 'completed' | 'failed';

interface WorkflowState {
  // Session
  sessionId: string | null;
  phase: AppPhase;
  
  // Input
  workflowInput: string;
  
  // Intent Analysis
  intent: IntentData | null;
  clarifications: Record<string, string>;
  
  // DAGs
  executionDag: { id: string; nodes: DAGNodeData[]; edges: DAGEdgeData[]; metadata: Record<string, unknown> } | null;
  rollbackDag: { id: string; nodes: DAGNodeData[]; edges: DAGEdgeData[] } | null;
  activeTab: 'execution' | 'rollback';
  
  // Execution
  nodeExecutions: Record<string, NodeExecutionData>;
  executionStatus: string;
  totalDuration: number | null;
  
  // HITL & Anomaly
  activeHITL: HITLGate | null;
  activeAnomaly: AnomalyAlert | null;
  
  // Node Detail
  selectedNodeId: string | null;
  
  // Audit
  auditCollapsed: boolean;
  auditEntries: Array<Record<string, unknown>>;
  
  // Actions
  setWorkflowInput: (input: string) => void;
  setPhase: (phase: AppPhase) => void;
  setSessionId: (id: string) => void;
  setIntent: (intent: IntentData) => void;
  setClarification: (field: string, value: string) => void;
  setExecutionDag: (dag: WorkflowState['executionDag']) => void;
  setRollbackDag: (dag: WorkflowState['rollbackDag']) => void;
  setActiveTab: (tab: 'execution' | 'rollback') => void;
  updateNodeExecution: (nodeId: string, data: Partial<NodeExecutionData>) => void;
  setExecutionStatus: (status: string) => void;
  setTotalDuration: (duration: number) => void;
  setActiveHITL: (gate: HITLGate | null) => void;
  setActiveAnomaly: (anomaly: AnomalyAlert | null) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setAuditCollapsed: (collapsed: boolean) => void;
  setAuditEntries: (entries: Array<Record<string, unknown>>) => void;
  reset: () => void;
}

const initialState = {
  sessionId: null,
  phase: 'input' as AppPhase,
  workflowInput: '',
  intent: null,
  clarifications: {},
  executionDag: null,
  rollbackDag: null,
  activeTab: 'execution' as const,
  nodeExecutions: {},
  executionStatus: 'idle',
  totalDuration: null,
  activeHITL: null,
  activeAnomaly: null,
  selectedNodeId: null,
  auditCollapsed: true,
  auditEntries: [],
};

export const useWorkflowStore = create<WorkflowState>((set) => ({
  ...initialState,
  
  setWorkflowInput: (input) => set({ workflowInput: input }),
  setPhase: (phase) => set({ phase }),
  setSessionId: (id) => set({ sessionId: id }),
  setIntent: (intent) => set({ intent }),
  setClarification: (field, value) => set((state) => ({
    clarifications: { ...state.clarifications, [field]: value },
  })),
  setExecutionDag: (dag) => set({ executionDag: dag }),
  setRollbackDag: (dag) => set({ rollbackDag: dag }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  updateNodeExecution: (nodeId, data) => set((state) => ({
    nodeExecutions: {
      ...state.nodeExecutions,
      [nodeId]: { ...state.nodeExecutions[nodeId], ...data, nodeId } as NodeExecutionData,
    },
  })),
  setExecutionStatus: (status) => set({ executionStatus: status }),
  setTotalDuration: (duration) => set({ totalDuration: duration }),
  setActiveHITL: (gate) => set({ activeHITL: gate }),
  setActiveAnomaly: (anomaly) => set({ activeAnomaly: anomaly }),
  setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),
  setAuditCollapsed: (collapsed) => set({ auditCollapsed: collapsed }),
  setAuditEntries: (entries) => set({ auditEntries: entries }),
  reset: () => set(initialState),
}));
