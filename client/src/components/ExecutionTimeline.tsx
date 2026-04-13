import React from 'react';
import { useWorkflowStore } from '../stores/workflowStore';

export default function ExecutionTimeline() {
  const phase = useWorkflowStore((s) => s.phase);
  const executionDag = useWorkflowStore((s) => s.executionDag);
  const nodeExecutions = useWorkflowStore((s) => s.nodeExecutions);
  const totalDuration = useWorkflowStore((s) => s.totalDuration);
  const executionStatus = useWorkflowStore((s) => s.executionStatus);

  if (!executionDag || phase === 'input' || phase === 'analyzing') return null;

  const totalNodes = executionDag.nodes.length;
  const completedNodes = Object.values(nodeExecutions).filter(n => n.status === 'completed').length;
  const failedNodes = Object.values(nodeExecutions).filter(n => n.status === 'failed').length;
  const runningNodes = Object.values(nodeExecutions).filter(n => n.status === 'running').length;
  const progress = totalNodes > 0 ? (completedNodes / totalNodes) * 100 : 0;

  const statusLabel = (() => {
    switch (executionStatus) {
      case 'executing': return 'Executing';
      case 'completed': return 'Completed';
      case 'failed': return 'Failed';
      case 'rolling_back': return 'Rolling Back';
      case 'rolled_back': return 'Rolled Back';
      default:
        if (phase === 'review') return 'Ready';
        return 'Idle';
    }
  })();

  const dotClass = (() => {
    switch (executionStatus) {
      case 'executing': return 'executing';
      case 'completed': return 'completed';
      case 'failed': return 'failed';
      case 'rolling_back': return 'rolling-back';
      default: return 'idle';
    }
  })();

  return (
    <div className="execution-timeline" id="execution-timeline">
      <div className="timeline-status">
        <span className={`timeline-dot ${dotClass}`} />
        <span>{statusLabel}</span>
      </div>

      <div className="timeline-progress">
        <div
          className="timeline-progress-bar"
          style={{
            width: `${progress}%`,
            background: failedNodes > 0
              ? 'linear-gradient(135deg, #ef4444, #dc2626)'
              : 'var(--gradient-brand)',
          }}
        />
      </div>

      <div className="timeline-info">
        {completedNodes}/{totalNodes} nodes
        {runningNodes > 0 && ` • ${runningNodes} running`}
        {failedNodes > 0 && ` • ${failedNodes} failed`}
        {totalDuration !== null && ` • ${totalDuration}ms`}
      </div>
    </div>
  );
}
