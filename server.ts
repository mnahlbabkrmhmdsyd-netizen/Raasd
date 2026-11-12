import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { initDatabase, db, hashToken, sanitizeUser } from './server/db.ts';
import { createApiRouter, canAccessFacility } from './server/routes.ts';
import type { SafeUser, UserRecord } from './server/types.ts';

dotenv.config();

initDatabase();

const app = express();
app.use(express.json({ limit: '5mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

interface AuthedSocket extends WebSocket {
  user?: SafeUser;
}

const clients = new Set<AuthedSocket>();

function broadcast(event: string, payload: unknown, facilityId?: string) {
  const message = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN && client.user) {
      if (!facilityId || canAccessFacility(client.user, facilityId)) {
        client.send(message);
      }
    }
  }
}

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  const token = url.searchParams.get('token') || '';
  if (!token) {
    socket.destroy();
    return;
  }
  const session = db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
    .get(hashToken(token)) as { user_id: string; expires_at: string } | undefined;

  if (!session || new Date(session.expires_at).getTime() < Date.now()) {
    socket.destroy();
    return;
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as UserRecord | undefined;
  if (!user || !user.active) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    const authedWs = ws as AuthedSocket;
    authedWs.user = sanitizeUser(user);
    wss.emit('connection', authedWs, request);
  });
});

wss.on('connection', (ws: AuthedSocket) => {
  clients.add(ws);
  ws.send(JSON.stringify({ event: 'ws:connected', payload: { user: ws.user?.username } }));
  ws.on('close', () => {
    clients.delete(ws);
  });
});

app.use('/api', createApiRouter(broadcast));

const PORT = Number(process.env.PORT || 3000);

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`RASAD server running on http://0.0.0.0:${PORT}`);
  });
}

start();
