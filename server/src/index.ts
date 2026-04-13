import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import express from 'express';
import cors from 'cors';
import { initRoutes } from './api/routes.js';
import { createWebSocketServer } from './api/websocket.js';
import { getDatabase } from './db/sqlite.js';
import { ConnectorRegistry } from './mcp/registry.js';
import { JiraConnector } from './mcp/connectors/jira.js';
import { SlackConnector } from './mcp/connectors/slack.js';
import { GitHubConnector } from './mcp/connectors/github.js';
import { SheetsConnector } from './mcp/connectors/sheets.js';

const PORT = parseInt(process.env.PORT || '3001');
const WS_PORT = parseInt(process.env.WS_PORT || '3002');

async function main() {
  console.log('🚀 Agentic MCP Gateway — Starting...');

  // Initialize database
  console.log('📦 Initializing SQLite database...');
  getDatabase();

  // Initialize MCP connector registry
  console.log('🔌 Registering MCP connectors...');
  const registry = new ConnectorRegistry();
  registry.register(new JiraConnector());
  registry.register(new SlackConnector());
  registry.register(new GitHubConnector());
  registry.register(new SheetsConnector());

  console.log(`   Registered: ${registry.listConnectorNames().join(', ')}`);

  // Create Express app
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Mount routes
  const routes = initRoutes(registry);
  app.use(routes);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      connectors: registry.listConnectorNames(),
      timestamp: new Date().toISOString(),
    });
  });

  // Start HTTP server
  app.listen(PORT, () => {
    console.log(`🌐 HTTP server listening on http://localhost:${PORT}`);
  });

  // Start WebSocket server
  createWebSocketServer(WS_PORT);
  console.log(`📡 WebSocket server listening on ws://localhost:${WS_PORT}`);
  console.log('');
  console.log('✅ Agentic MCP Gateway ready!');
  console.log(`   API:       http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${WS_PORT}`);
  console.log(`   LLM Mode:  ${process.env.OPENAI_API_KEY ? 'OpenAI API' : 'Mock LLM'}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
