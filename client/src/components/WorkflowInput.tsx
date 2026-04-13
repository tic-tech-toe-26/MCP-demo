import React, { useState } from 'react';
import { useWorkflowStore } from '../stores/workflowStore';
import { api } from '../utils/api';

const EXAMPLE_PROMPTS = [
  'Triage a critical P0 bug: create a Jira issue, a GitHub fix branch, notify the incidents Slack channel, and log it in the Bug Tracker spreadsheet.',
  'Deploy version 2.0: merge the PR, announce in the releases Slack channel, and update the Deployment Log spreadsheet.',
  'Generate a weekly status report: pull data from the Bug Tracker sheet, summarize open issues from Jira, and post a summary to the engineering Slack channel.',
  'Onboard a new engineer: create a Jira onboarding ticket, send a Slack welcome, and add them to the team spreadsheet.',
];

export default function WorkflowInput() {
  const workflowInput = useWorkflowStore((s) => s.workflowInput);
  const setWorkflowInput = useWorkflowStore((s) => s.setWorkflowInput);
  const phase = useWorkflowStore((s) => s.phase);
  const setPhase = useWorkflowStore((s) => s.setPhase);
  const setSessionId = useWorkflowStore((s) => s.setSessionId);
  const setIntent = useWorkflowStore((s) => s.setIntent);
  const sessionId = useWorkflowStore((s) => s.sessionId);
  const setExecutionDag = useWorkflowStore((s) => s.setExecutionDag);
  const setRollbackDag = useWorkflowStore((s) => s.setRollbackDag);
  const clarifications = useWorkflowStore((s) => s.clarifications);
  const executionDag = useWorkflowStore((s) => s.executionDag);
  const reset = useWorkflowStore((s) => s.reset);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDecompose = async () => {
    if (!workflowInput.trim()) return;
    setLoading(true);
    setError(null);

    try {
      // Step 1: Analyze intent
      setPhase('analyzing');
      const analyzeResult = await api.analyze(workflowInput, sessionId || undefined);
      setSessionId(analyzeResult.sessionId);
      setIntent(analyzeResult.intent as any);
      setPhase('pre-planning');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setPhase('input');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDAG = async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);

    try {
      setPhase('planning');
      const planResult = await api.plan(sessionId, workflowInput, clarifications);
      setExecutionDag(planResult.executionDag as any);
      setRollbackDag(planResult.rollbackDag as any);
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Planning failed');
      setPhase('pre-planning');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);

    try {
      await api.execute(sessionId);
      setPhase('executing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    reset();
    setError(null);
  };

  const isInputPhase = phase === 'input' || phase === 'analyzing';
  const isPrePlanning = phase === 'pre-planning';
  const isReview = phase === 'review';
  const isExecuting = phase === 'executing';
  const isDone = phase === 'completed' || phase === 'failed';

  return (
    <div className="workflow-input-section">
      <label className="input-label">Workflow Description</label>
      <textarea
        id="workflow-input"
        className="workflow-textarea"
        value={workflowInput}
        onChange={(e) => setWorkflowInput(e.target.value)}
        placeholder="Describe your workflow in natural language..."
        disabled={isExecuting}
      />

      {/* Example Prompts */}
      {isInputPhase && !workflowInput && (
        <div className="mt-md">
          <span className="text-xs text-muted" style={{ display: 'block', marginBottom: 6 }}>Try an example:</span>
          {EXAMPLE_PROMPTS.map((prompt, i) => (
            <button
              key={i}
              className="btn btn-secondary btn-sm"
              style={{ marginBottom: 4, textAlign: 'left', width: '100%', whiteSpace: 'normal', lineHeight: 1.4, padding: '8px 12px' }}
              onClick={() => setWorkflowInput(prompt)}
            >
              {prompt.slice(0, 80)}...
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          marginTop: 8,
          padding: '8px 12px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.8rem',
          color: '#fca5a5',
        }}>
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="btn-group">
        {isInputPhase && (
          <button
            id="decompose-btn"
            className="btn btn-primary btn-wide"
            onClick={handleDecompose}
            disabled={!workflowInput.trim() || loading}
          >
            {loading ? '⟳ Analyzing...' : '◇ Decompose Workflow'}
          </button>
        )}

        {isPrePlanning && (
          <button
            id="generate-dag-btn"
            className="btn btn-primary btn-wide"
            onClick={handleGenerateDAG}
            disabled={loading}
          >
            {loading ? '⟳ Planning...' : '⊞ Generate DAG'}
          </button>
        )}

        {isReview && (
          <button
            id="execute-btn"
            className="btn btn-success btn-wide"
            onClick={handleExecute}
            disabled={loading}
          >
            {loading ? '⟳ Starting...' : '▶ Execute Workflow'}
          </button>
        )}

        {isDone && (
          <button className="btn btn-secondary btn-wide" onClick={handleReset}>
            ↻ New Workflow
          </button>
        )}
      </div>

      {/* Status Indicator */}
      {(isExecuting || isDone) && (
        <div style={{
          marginTop: 12,
          padding: '8px 12px',
          background: phase === 'completed' ? 'rgba(16, 185, 129, 0.1)' : phase === 'failed' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
          border: `1px solid ${phase === 'completed' ? 'rgba(16, 185, 129, 0.3)' : phase === 'failed' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.8rem',
          color: phase === 'completed' ? '#6ee7b7' : phase === 'failed' ? '#fca5a5' : '#93c5fd',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span className={`timeline-dot ${phase === 'executing' ? 'executing' : phase === 'completed' ? 'completed' : 'failed'}`} />
          {phase === 'executing' ? 'Workflow executing...' : phase === 'completed' ? 'Workflow completed!' : 'Workflow failed'}
        </div>
      )}
    </div>
  );
}
