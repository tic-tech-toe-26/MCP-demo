import WebSocket, { WebSocketServer } from 'ws';
import type { WSEvent } from '../planner/dag-types.js';

let wss: WebSocketServer | null = null;
const clients: Set<WebSocket> = new Set();

export function createWebSocketServer(port: number): WebSocketServer {
  wss = new WebSocketServer({ port });

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`WebSocket client connected (total: ${clients.size})`);

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`WebSocket client disconnected (total: ${clients.size})`);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
      clients.delete(ws);
    });

    // Send welcome message
    ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
  });

  console.log(`WebSocket server listening on port ${port}`);
  return wss;
}

export function broadcastEvent(event: WSEvent): void {
  const data = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

export function getClientCount(): number {
  return clients.size;
}

export function closeWebSocketServer(): void {
  if (wss) {
    for (const client of clients) {
      client.close();
    }
    clients.clear();
    wss.close();
    wss = null;
  }
}
