import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { analyzeIntent } from '../intent/engine.js';
import { generateDAG } from '../planner/dag-planner.js';
import { generateRollbackDAG } from '../planner/rollback-planner.js';
import { DAGExecutor } from '../runtime/executor.js';
import { ConnectorRegistry } from '../mcp/registry.js';
import { queryAuditLog } from '../db/sqlite.js';
import { broadcastEvent } from './websocket.js';
import type {
  ExecutionDAG,
  RollbackDAG,
  IntentAnalysis,
  ConversationMessage,
  WSEvent,
} from '../planner/dag-types.js';

const router = Router();

// Session storage (in-memory)
interface Session {
  id: string;
  intent?: IntentAnalysis;
  executionDag?: ExecutionDAG;
  rollbackDag?: RollbackDAG;
  conversationHistory: ConversationMessage[];
  executor?: DAGExecutor;
  createdAt: string;
}

const sessions = new Map<string, Session>();

let registryRef: ConnectorRegistry;

export function initRoutes(registry: ConnectorRegistry): Router {
  registryRef = registry;

  // ====================================================
  // POST /api/workflow/analyze — Intent Reasoning
  // ====================================================
  router.post('/api/workflow/analyze', async (req: Request, res: Response) => {
    try {
      const { input, sessionId } = req.body;

      if (!input) {
        return res.status(400).json({ error: 'Input is required' });
      }

      // Create or reuse session
      const session: Session = sessionId && sessions.has(sessionId)
        ? sessions.get(sessionId)!
        : { id: uuidv4(), conversationHistory: [], createdAt: new Date().toISOString() };

      session.conversationHistory.push({
        role: 'user',
        content: input,
        timestamp: new Date().toISOString(),
      });

      // Run intent analysis
      const intent = await analyzeIntent(input);
      session.intent = intent;

      sessions.set(session.id, session);

      res.json({
        sessionId: session.id,
        intent,
      });
    } catch (err) {
      console.error('Analysis error:', err);
      res.status(500).json({ error: 'Intent analysis failed', details: String(err) });
    }
  });

  // ====================================================
  // POST /api/workflow/plan — DAG Generation
  // ====================================================
  router.post('/api/workflow/plan', async (req: Request, res: Response) => {
    try {
      const { sessionId, input, clarifications } = req.body;

      if (!sessionId || !sessions.has(sessionId)) {
        return res.status(400).json({ error: 'Valid sessionId is required. Call /analyze first.' });
      }

      const session = sessions.get(sessionId)!;
      if (!session.intent) {
        return res.status(400).json({ error: 'No intent analysis found. Call /analyze first.' });
      }

      // Add clarifications to conversation
      if (clarifications) {
        session.conversationHistory.push({
          role: 'user',
          content: `Clarifications: ${JSON.stringify(clarifications)}`,
          timestamp: new Date().toISOString(),
        });
      }

      // Generate execution DAG
      const executionDag = await generateDAG(
        input || session.conversationHistory[0]?.content || '',
        session.intent,
        clarifications || {},
        registryRef,
        session.conversationHistory,
        session.executionDag // Pass existing DAG for multi-turn
      );

      // Generate rollback DAG
      const rollbackDag = generateRollbackDAG(executionDag);

      session.executionDag = executionDag;
      session.rollbackDag = rollbackDag;

      res.json({
        sessionId: session.id,
        executionDag,
        rollbackDag,
      });
    } catch (err) {
      console.error('Planning error:', err);
      res.status(500).json({ error: 'DAG planning failed', details: String(err) });
    }
  });

  // ====================================================
  // POST /api/workflow/execute — Start Execution
  // ====================================================
  router.post('/api/workflow/execute', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.body;

      if (!sessionId || !sessions.has(sessionId)) {
        return res.status(400).json({ error: 'Valid sessionId required' });
      }

      const session = sessions.get(sessionId)!;
      if (!session.executionDag || !session.rollbackDag) {
        return res.status(400).json({ error: 'No DAG planned. Call /plan first.' });
      }

      // Create executor
      const executor = new DAGExecutor(registryRef);
      session.executor = executor;

      // Forward WS events
      executor.on('ws-event', (event: WSEvent) => {
        broadcastEvent(event);
      });

      // Start execution (non-blocking)
      const workflowId = session.id;
      const originalIntent = session.conversationHistory[0]?.content || '';

      // Respond immediately with runId
      const runId = uuidv4();
      res.json({ sessionId, runId, status: 'executing' });

      // Execute asynchronously
      executor.execute(
        session.executionDag,
        session.rollbackDag,
        workflowId,
        originalIntent
      ).then((result) => {
        broadcastEvent({
          type: result.success ? 'execution:completed' : 'execution:failed',
          workflowId,
          runId,
          timestamp: new Date().toISOString(),
          payload: {
            success: result.success,
            totalDuration: result.totalDuration,
            nodeCount: result.nodeExecutions.size,
          },
        });
      }).catch((err) => {
        console.error('Execution error:', err);
      });
    } catch (err) {
      console.error('Execute error:', err);
      res.status(500).json({ error: 'Execution start failed', details: String(err) });
    }
  });

  // ====================================================
  // POST /api/workflow/approve/:nodeId
  // ====================================================
  router.post('/api/workflow/approve/:nodeId', async (req: Request, res: Response) => {
    try {
      const { nodeId } = req.params;
      const { sessionId, action, modifications, user } = req.body;

      const session = sessions.get(sessionId);
      if (!session?.executor) {
        return res.status(400).json({ error: 'No active execution' });
      }

      session.executor.resolveApproval(
        nodeId,
        action || 'approve',
        modifications
      );

      res.json({ success: true, nodeId, action: action || 'approve' });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ====================================================
  // POST /api/workflow/anomaly-response
  // ====================================================
  router.post('/api/workflow/anomaly-response', async (req: Request, res: Response) => {
    try {
      const { sessionId, nodeId, action, modifications } = req.body;

      const session = sessions.get(sessionId);
      if (!session?.executor) {
        return res.status(400).json({ error: 'No active execution' });
      }

      session.executor.resolveAnomaly(nodeId, action, modifications);
      res.json({ success: true, nodeId, action });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ====================================================
  // POST /api/workflow/replay/:runId/:nodeId
  // ====================================================
  router.post('/api/workflow/replay/:runId/:nodeId', async (req: Request, res: Response) => {
    try {
      const { nodeId } = req.params;
      const { sessionId } = req.body;

      const session = sessions.get(sessionId);
      if (!session?.executionDag || !session?.rollbackDag) {
        return res.status(400).json({ error: 'No DAG available for replay' });
      }

      // Create a new executor for replay
      const executor = new DAGExecutor(registryRef);
      session.executor = executor;

      executor.on('ws-event', (event: WSEvent) => {
        broadcastEvent(event);
      });

      res.json({ status: 'replaying', fromNode: nodeId });

      executor.execute(
        session.executionDag,
        session.rollbackDag,
        session.id,
        session.conversationHistory[0]?.content || '',
        nodeId
      );
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ====================================================
  // GET /api/audit — Query audit log
  // ====================================================
  router.get('/api/audit', (req: Request, res: Response) => {
    try {
      const params = {
        connector: req.query.connector as string | undefined,
        startTime: req.query.startTime as string | undefined,
        endTime: req.query.endTime as string | undefined,
        operationType: req.query.operationType as string | undefined,
        workflowId: req.query.workflowId as string | undefined,
        status: req.query.status as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };

      const entries = queryAuditLog(params);
      res.json({ entries, count: entries.length });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ====================================================
  // GET /api/connectors — List MCP connectors
  // ====================================================
  router.get('/api/connectors', (_req: Request, res: Response) => {
    const manifests = registryRef.getAllManifests();
    res.json({ connectors: manifests });
  });

  // ====================================================
  // GET /api/session/:id — Get session state
  // ====================================================
  router.get('/api/session/:id', (req: Request, res: Response) => {
    const session = sessions.get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const nodeExecutions = session.executor
      ? Object.fromEntries(session.executor.getNodeExecutions())
      : {};

    res.json({
      sessionId: session.id,
      intent: session.intent,
      executionDag: session.executionDag,
      rollbackDag: session.rollbackDag,
      conversationHistory: session.conversationHistory,
      nodeExecutions,
    });
  });

  return router;
}
