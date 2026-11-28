import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { config } from '../config.js';
import { getDb } from '../db/database.js';
import { verifyAuthToken } from '../middleware/auth.js';
import { getBlockedUserIds } from '../services/antiScamService.js';

const userSockets = new Map();
const wsTickets = new Map();

export function issueWsTicket(userId) {
  const now = Date.now();
  if (wsTickets.size > 500) {
    for (const [k, v] of wsTickets.entries()) {
      if (v.expiresAt <= now) wsTickets.delete(k);
    }
  }
  const ticket = `wst_${crypto.randomUUID()}`;
  wsTickets.set(ticket, { userId, expiresAt: now + 30_000 });
  return { ticket, expiresInSec: 30 };
}

export function consumeWsTicket(ticket) {
  if (!ticket || typeof ticket !== 'string') return null;
  const entry = wsTickets.get(ticket);
  wsTickets.delete(ticket);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.userId;
}

export function disconnectUserSockets(userId) {
  const set = userSockets.get(userId);
  if (!set) return;
  for (const ws of set) {
    try {
      ws.close(4004, 'Account terminated');
    } catch {
      // Ignore closed socket
    }
  }
  userSockets.delete(userId);
}

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

  wss.on('connection', (ws, req) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const ticket = url.searchParams.get('ticket');
      const token = url.searchParams.get('token');

      let userId = null;
      if (ticket) {
        userId = consumeWsTicket(ticket);
      } else if (token) {
        if (config.nodeEnv === 'production') {
          ws.close(4003, 'Ephemeral WS ticket required');
          return;
        }
        const decoded = verifyAuthToken(token);
        userId = decoded.sub;
      } else {
        ws.close(4001, 'Missing auth ticket');
        return;
      }

      if (!userId) {
        ws.close(4002, 'Invalid or expired ticket');
        return;
      }

      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId).add(ws);

      ws.send(JSON.stringify({ type: 'connected', userId, timestamp: new Date().toISOString() }));

      ws.on('message', async (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          } else if (msg.type === 'typing' && msg.recipientId && msg.matchId) {
            const db = getDb();
            const match = await db.get(
              `SELECT id FROM matches
               WHERE id = ? AND ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?))`,
              String(msg.matchId),
              userId,
              String(msg.recipientId),
              String(msg.recipientId),
              userId
            );
            const blocked = match ? await getBlockedUserIds(db, userId) : null;
            if (match && !blocked.has(String(msg.recipientId))) {
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
