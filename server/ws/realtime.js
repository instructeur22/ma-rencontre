import { WebSocketServer } from 'ws';
import { getDb } from '../db/database.js';
import { verifyAuthToken } from '../middleware/auth.js';
import { getBlockedUserIds } from '../services/antiScamService.js';

const userSockets = new Map();

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

  wss.on('connection', (ws, req) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      if (!token) {
        ws.close(4001, 'Missing token');
        return;
      }
      const decoded = verifyAuthToken(token);
      const userId = decoded.sub;

      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId).add(ws);

      ws.send(JSON.stringify({ type: 'connected', userId, timestamp: new Date().toISOString() }));

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          } else if (msg.type === 'typing' && msg.recipientId && msg.matchId) {
            const db = getDb();
            const match = db
              .prepare(
                `SELECT id FROM matches
                 WHERE id = ? AND ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?))`
              )
              .get(String(msg.matchId), userId, String(msg.recipientId), String(msg.recipientId), userId);
            if (match && !getBlockedUserIds(db, userId).has(String(msg.recipientId))) {
              emitToUser(String(msg.recipientId), {
                type: 'typing',
                matchId: match.id,
                senderId: userId,
              });
            }
          }
        } catch {
          // Ignore malformed ws message
        }
      });

      ws.on('close', () => {
        const set = userSockets.get(userId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) userSockets.delete(userId);
        }
      });
    } catch {
      ws.close(4002, 'Invalid token');
    }
  });

  return wss;
}

export function emitToUser(userId, payload) {
  const set = userSockets.get(userId);
  if (!set || set.size === 0) return;
  const serialized = JSON.stringify(payload);
  for (const client of set) {
    if (client.readyState === 1) {
      client.send(serialized);
    }
  }
}
