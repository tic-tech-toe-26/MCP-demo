import OpenAI from 'openai';

// LLM abstraction — uses OpenAI when API key is available, falls back to mock
let openaiClient: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (openaiClient) return openaiClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    openaiClient = new OpenAI({ apiKey });
    return openaiClient;
  }
  return null;
}

export interface LLMRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: number;
}

export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const client = getClient();
  const model = process.env.LLM_MODEL || 'gpt-4o';
  const maxTokens = request.maxTokens || 4096;

  if (client) {
    try {
      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        temperature: request.temperature ?? 0.3,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
      });

      const content = response.choices[0]?.message?.content || '';
      return {
        content,
        model,
        tokensUsed: response.usage?.total_tokens || 0,
      };
    } catch (err) {
      console.error('OpenAI API error, falling back to mock:', err);
      return mockLLMCall(request);
    }
  }

  return mockLLMCall(request);
}

// Deterministic mock LLM for when no API key is available
function mockLLMCall(request: LLMRequest): LLMResponse {
  const prompt = request.userPrompt.toLowerCase();

  // Intent classification mock
  if (request.systemPrompt.includes('intent classification')) {
    return mockIntentClassification(prompt);
  }

  // Risk assessment mock
  if (request.systemPrompt.includes('risk assessment')) {
    return mockRiskAssessment(prompt);
  }

  // DAG planning mock
  if (request.systemPrompt.includes('DAG planner') || request.systemPrompt.includes('workflow decomposition')) {
    return mockDAGPlanning(prompt);
  }

  // Anomaly detection mock
  if (request.systemPrompt.includes('anomaly detection') || request.systemPrompt.includes('anomaly check')) {
    return mockAnomalyDetection(prompt);
  }

  // Confidence scoring mock
  if (request.systemPrompt.includes('confidence')) {
    return { content: JSON.stringify({ score: 85 }), model: 'mock', tokensUsed: 0 };
  }

  // Rollback planning mock
  if (request.systemPrompt.includes('rollback')) {
    return mockRollbackPlanning(prompt);
  }

  // HITL explanation mock
  if (request.systemPrompt.includes('approval') || request.systemPrompt.includes('HITL')) {
    return {
      content: JSON.stringify({
        explanation: 'This operation modifies external systems and requires human verification.',
        consequences: 'Skipping this step may result in incomplete workflow execution.',
      }),
      model: 'mock',
      tokensUsed: 0,
    };
  }

  // Summarization mock
  if (request.systemPrompt.includes('summarize') || request.systemPrompt.includes('summarization')) {
    return {
      content: JSON.stringify({
        summary: 'Output data from the previous workflow step. Contains relevant result fields.',
      }),
      model: 'mock',
      tokensUsed: 0,
    };
  }

  // Default
  return { content: '{}', model: 'mock', tokensUsed: 0 };
}

function mockIntentClassification(prompt: string): LLMResponse {
  let category = 'custom';
  let confidence = 70;

  const keywords: Record<string, string[]> = {
    incident_response: ['bug', 'incident', 'crash', 'error', 'triage', 'p0', 'p1', 'critical', 'broken', 'fix'],
    release_management: ['deploy', 'release', 'merge', 'pr', 'ship', 'launch', 'version'],
    data_pipeline: ['data', 'pipeline', 'etl', 'sync', 'export', 'import', 'spreadsheet'],
    onboarding: ['onboard', 'new hire', 'setup', 'welcome', 'invite'],
    reporting: ['report', 'status', 'summary', 'metrics', 'analytics'],
  };

  for (const [cat, words] of Object.entries(keywords)) {
    const matchCount = words.filter((w) => prompt.includes(w)).length;
    if (matchCount > 0) {
      category = cat;
      confidence = Math.min(95, 60 + matchCount * 12);
      break;
    }
  }

  return {
    content: JSON.stringify({ category, confidence }),
    model: 'mock',
    tokensUsed: 0,
  };
}

function mockRiskAssessment(prompt: string): LLMResponse {
  const highRisk = ['delete', 'production', 'merge', 'deploy', 'p0', 'critical'];
  const medRisk = ['update', 'modify', 'send', 'change'];

  const highMatches = highRisk.filter((w) => prompt.includes(w)).length;
  const medMatches = medRisk.filter((w) => prompt.includes(w)).length;

  let level = 'low';
  let rationale = 'Standard workflow with low-risk operations.';

  if (highMatches > 0) {
    level = 'high';
    rationale = `Contains ${highMatches} high-risk operation(s) including modifications to production systems.`;
  } else if (medMatches > 0) {
    level = 'medium';
    rationale = `Contains ${medMatches} operations that modify existing data or send communications.`;
  }

  return {
    content: JSON.stringify({ level, rationale }),
    model: 'mock',
    tokensUsed: 0,
  };
}

function mockDAGPlanning(prompt: string): LLMResponse {
  // Generate a plausible DAG based on keywords
  const nodes: Array<Record<string, unknown>> = [];
  const edges: Array<Record<string, unknown>> = [];

  if (prompt.includes('bug') || prompt.includes('triage') || prompt.includes('incident')) {
    nodes.push(
      { id: 'node_1', connector: 'jira', tool: 'create_issue', params: { project: 'PROJ', summary: 'Bug triage issue', priority: 'P0' }, dependencies: [], type: 'standard', confidenceScore: 92, label: 'Create Jira Issue' },
      { id: 'node_2', connector: 'github', tool: 'create_branch', params: { name: 'fix/bug-triage', baseBranch: 'main' }, dependencies: ['node_1'], type: 'standard', confidenceScore: 88, label: 'Create Fix Branch' },
      { id: 'node_3', connector: 'slack', tool: 'send_message', params: { channel: 'incidents', text: 'New P0 bug triaged: $output.node_1.key' }, dependencies: ['node_1'], type: 'approval_gate', confidenceScore: 75, label: 'Notify Team' },
      { id: 'node_4', connector: 'sheets', tool: 'append_row', params: { sheetName: 'Bug Tracker', values: ['$output.node_1.key', '$output.node_1.summary', 'P0', 'Open', 'dev1', '$output.node_1.createdAt'] }, dependencies: ['node_2', 'node_3'], type: 'standard', confidenceScore: 90, label: 'Log to Sheet' }
    );
    edges.push(
      { source: 'node_1', target: 'node_2' },
      { source: 'node_1', target: 'node_3' },
      { source: 'node_2', target: 'node_4' },
      { source: 'node_3', target: 'node_4' }
    );
  } else if (prompt.includes('deploy') || prompt.includes('release')) {
    nodes.push(
      { id: 'node_1', connector: 'github', tool: 'merge_pr', params: { prNumber: 1 }, dependencies: [], type: 'approval_gate', confidenceScore: 80, label: 'Merge PR' },
      { id: 'node_2', connector: 'slack', tool: 'send_message', params: { channel: 'releases', text: 'Deployment completed for PR #1' }, dependencies: ['node_1'], type: 'approval_gate', confidenceScore: 72, label: 'Announce Deployment' },
      { id: 'node_3', connector: 'sheets', tool: 'append_row', params: { sheetName: 'Deployment Log', values: ['v2.0.0', new Date().toISOString().split('T')[0], 'Success', 'deployer', 'Auto-deployed'] }, dependencies: ['node_1'], type: 'standard', confidenceScore: 91, label: 'Log Deployment' }
    );
    edges.push(
      { source: 'node_1', target: 'node_2' },
      { source: 'node_1', target: 'node_3' }
    );
  } else {
    // Generic workflow
    nodes.push(
      { id: 'node_1', connector: 'jira', tool: 'create_issue', params: { project: 'PROJ', summary: 'Workflow task', priority: 'P2' }, dependencies: [], type: 'standard', confidenceScore: 85, label: 'Create Task' },
      { id: 'node_2', connector: 'slack', tool: 'send_message', params: { channel: 'general', text: 'New workflow task created' }, dependencies: ['node_1'], type: 'standard', confidenceScore: 82, label: 'Send Notification' },
      { id: 'node_3', connector: 'sheets', tool: 'append_row', params: { sheetName: 'Bug Tracker', values: ['$output.node_1.key', '$output.node_1.summary', 'P2', 'Open', 'system', new Date().toISOString()] }, dependencies: ['node_2'], type: 'standard', confidenceScore: 88, label: 'Log Entry' }
    );
    edges.push(
      { source: 'node_1', target: 'node_2' },
      { source: 'node_2', target: 'node_3' }
    );
  }

  return {
    content: JSON.stringify({ nodes, edges }),
    model: 'mock',
    tokensUsed: 0,
  };
}

function mockAnomalyDetection(prompt: string): LLMResponse {
  // Check for specific anomaly triggers in the context
  if (prompt.includes('priority mismatch') || prompt.includes('inconsistent') ||
      (prompt.includes('P0') && prompt.includes('low'))) {
    return {
      content: JSON.stringify({
        isAnomaly: true,
        severity: 'high',
        description: 'Priority mismatch detected: Jira issue marked P0 but downstream GitHub issue created with low priority.',
        suggestedAction: 'modify',
      }),
      model: 'mock',
      tokensUsed: 0,
    };
  }

  return {
    content: JSON.stringify({
      isAnomaly: false,
      severity: 'low',
      description: 'Output is semantically consistent with workflow intent.',
      suggestedAction: 'ignore',
    }),
    model: 'mock',
    tokensUsed: 0,
  };
}

function mockRollbackPlanning(prompt: string): LLMResponse {
  // The rollback planner will handle the actual logic;
  // this just returns a mock response structure
  return {
    content: JSON.stringify({
      rollbackGenerated: true,
      strategy: 'reverse_compensation',
    }),
    model: 'mock',
    tokensUsed: 0,
  };
}
