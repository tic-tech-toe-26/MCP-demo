import { useEffect, useRef, useCallback } from 'react';
import { useWorkflowStore } from '../stores/workflowStore';

const WS_URL = `ws://${window.location.hostname}:3002`;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();
  const {
    updateNodeExecution,
    setActiveHITL,
    setActiveAnomaly,
    setExecutionStatus,
    setTotalDuration,
    setPhase,
  } = useWorkflowStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleEvent(data);
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting in 3s...');
      reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }, []);

  const handleEvent = useCallback((event: { type: string; payload: Record<string, unknown> }) => {
    const { type, payload } = event;

    switch (type) {
      case 'node:pending':
        updateNodeExecution(payload.nodeId as string, { status: 'pending' });
        break;

      case 'node:running':
        updateNodeExecution(payload.nodeId as string, {
          status: 'running',
          startedAt: payload.startedAt as string,
        });
        break;

      case 'node:completed':
        updateNodeExecution(payload.nodeId as string, {
          status: 'completed',
          response: payload.output,
          duration: payload.duration as number,
        });
        break;

      case 'node:failed':
        updateNodeExecution(payload.nodeId as string, {
          status: 'failed',
          error: payload.error as string,
        });
        break;

      case 'node:approval-required':
        updateNodeExecution(payload.nodeId as string, { status: 'approval_pending' });
        setActiveHITL({
          nodeId: payload.nodeId as string,
          toolCall: payload.toolCall as { connector: string; tool: string; params: Record<string, unknown> },
          explanation: payload.explanation as string,
          consequences: payload.consequences as string,
          confidenceScore: payload.confidenceScore as number,
        });
        break;

      case 'node:anomaly-detected': {
        const anomaly = payload.anomaly as Record<string, unknown>;
        updateNodeExecution(payload.nodeId as string, { status: 'anomaly_flagged' });
        setActiveAnomaly({
          nodeId: payload.nodeId as string,
          severity: anomaly.severity as string,
          description: anomaly.description as string,
          suggestedAction: anomaly.suggestedAction as string,
        });
        break;
      }

      case 'node:rollback-started':
        updateNodeExecution(payload.nodeId as string, { status: 'rolled_back' });
        break;

      case 'node:rollback-completed':
        updateNodeExecution(payload.nodeId as string, { status: 'rolled_back' });
        break;

      case 'node:cancelled':
        updateNodeExecution(payload.nodeId as string, { status: 'cancelled' });
        break;

      case 'execution:started':
        setExecutionStatus('executing');
        setPhase('executing');
        break;

      case 'execution:completed':
        setExecutionStatus('completed');
        setTotalDuration((payload.totalDuration as number) || 0);
        setPhase('completed');
        break;

      case 'execution:failed':
        setExecutionStatus('failed');
        setTotalDuration((payload.totalDuration as number) || 0);
        setPhase('failed');
        break;

      case 'rollback:started':
        setExecutionStatus('rolling_back');
        break;

      case 'rollback:completed':
        setExecutionStatus('rolled_back');
        break;
    }
  }, [updateNodeExecution, setActiveHITL, setActiveAnomaly, setExecutionStatus, setTotalDuration, setPhase]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return wsRef;
}
