import crypto from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { PresenceUser, WorkspaceRealtimeEvent } from '../src/shared/types.ts';
import { verifySessionToken } from './auth.ts';
import { isProjectMember } from './db.ts';

interface ConnectedClient {
  ws: WebSocket;
  clientId: string;
  userId: string;
  projectId: string;
  userName: string;
  activePage: string;
  joinedAt: string;
  isAlive: boolean;
}

const clients = new Map<WebSocket, ConnectedClient>();

function broadcastToRoom(projectId: string, payload: WorkspaceRealtimeEvent): void {
  const serialized = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (client.projectId === projectId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(serialized);
    }
  }
}

function broadcastPresence(projectId: string): void {
  if (!projectId) return;
  const users: PresenceUser[] = [];
  for (const client of clients.values()) {
    if (client.projectId === projectId && client.ws.readyState === WebSocket.OPEN) {
      users.push({
        clientId: client.clientId,
        userName: client.userName,
        activePage: client.activePage,
        joinedAt: client.joinedAt,
      });
    }
  }
  broadcastToRoom(projectId, {
    type: 'presence:updated',
    projectId,
    users,
  });
}

export function initRealtimeServer(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const heartbeat = setInterval(() => {
    for (const [ws, client] of clients.entries()) {
      if (!client.isAlive) {
        clients.delete(ws);
        ws.terminate();
        if (client.projectId) {
          broadcastPresence(client.projectId);
        }
        continue;
      }
      client.isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  wss.on('connection', (ws, req) => {
    let token: string | null = null;
    try {
      const parsedUrl = new URL(req.url || '/ws', 'http://localhost');
      token = parsedUrl.searchParams.get('token');
    } catch {
      token = null;
    }

    const authUser = verifySessionToken(token);
    if (!authUser) {
      ws.close(4001, 'Authentication required');
      return;
    }

    const client: ConnectedClient = {
      ws,
      clientId: `ws_${crypto.randomBytes(4).toString('hex')}`,
      userId: authUser.id,
      projectId: '',
      userName: authUser.name,
      activePage: 'overview',
      joinedAt: new Date().toISOString(),
      isAlive: true,
    };
    clients.set(ws, client);

    ws.on('pong', () => {
      client.isAlive = true;
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          projectId?: string;
          activePage?: string;
        };
        if (msg.type === 'join' || msg.type === 'presence') {
          const prevProject = client.projectId;
          const nextProject = typeof msg.projectId === 'string' ? msg.projectId.trim() : prevProject;
          if (nextProject && !isProjectMember(nextProject, client.userId)) {
            return;
          }
          client.projectId = nextProject;
          if (typeof msg.activePage === 'string' && msg.activePage.trim()) {
            client.activePage = msg.activePage.trim().slice(0, 32);
          }

          if (prevProject && prevProject !== nextProject) {
            broadcastPresence(prevProject);
          }
          if (nextProject) {
            broadcastPresence(nextProject);
          }
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    ws.on('close', () => {
      const leftProject = client.projectId;
      clients.delete(ws);
      if (leftProject) {
        broadcastPresence(leftProject);
      }
    });
  });

  return wss;
}

export function broadcastProjectUpdate(
  projectId: string,
  eventType:
    | 'task'
    | 'dependency'
    | 'meeting'
    | 'commitment'
    | 'simulation'
    | 'recovery'
    | 'project',
  actorName: string,
  summary: string
): void {
  broadcastToRoom(projectId, {
    type: 'workspace:updated',
    projectId,
    eventType,
    actorName,
    summary,
    timestamp: new Date().toISOString(),
  });
}

export function broadcastProjectsChanged(summary: string): void {
  const payload: WorkspaceRealtimeEvent = {
    type: 'projects:updated',
    summary,
    timestamp: new Date().toISOString(),
  };
  const serialized = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(serialized);
    }
  }
}

export function getActiveConnectionCount(): number {
  let count = 0;
  for (const client of clients.values()) {
    if (client.ws.readyState === WebSocket.OPEN) count++;
  }
  return count;
}
