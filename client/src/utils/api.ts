const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }

  return res.json();
}

export const api = {
  analyze: (input: string, sessionId?: string) =>
    request<{ sessionId: string; intent: unknown }>('/workflow/analyze', {
      method: 'POST',
      body: JSON.stringify({ input, sessionId }),
    }),

  plan: (sessionId: string, input: string, clarifications?: Record<string, string>) =>
    request<{ sessionId: string; executionDag: unknown; rollbackDag: unknown }>('/workflow/plan', {
      method: 'POST',
      body: JSON.stringify({ sessionId, input, clarifications }),
    }),

  execute: (sessionId: string) =>
    request<{ sessionId: string; runId: string; status: string }>('/workflow/execute', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }),

  approve: (nodeId: string, sessionId: string, action: string, modifications?: Record<string, unknown>) =>
    request<{ success: boolean }>(`/workflow/approve/${nodeId}`, {
      method: 'POST',
      body: JSON.stringify({ sessionId, action, modifications, user: 'demo-user' }),
    }),

  anomalyResponse: (sessionId: string, nodeId: string, action: string, modifications?: Record<string, unknown>) =>
    request<{ success: boolean }>('/workflow/anomaly-response', {
      method: 'POST',
      body: JSON.stringify({ sessionId, nodeId, action, modifications }),
    }),

  replay: (runId: string, nodeId: string, sessionId: string) =>
    request<{ status: string }>(`/workflow/replay/${runId}/${nodeId}`, {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }),

  getAuditLog: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ entries: unknown[]; count: number }>(`/audit${query}`);
  },

  getConnectors: () =>
    request<{ connectors: unknown[] }>('/connectors'),

  getHealth: () =>
    request<{ status: string; connectors: string[] }>('/health'),
};
