import { useEffect, useRef, useState } from 'react';
import type { PresenceUser, WorkspaceRealtimeEvent } from '../shared/types.ts';

interface UseRealtimeSyncOptions {
  enabled: boolean;
  authToken: string | null;
  projectId: string;
  activePage: string;
  userName?: string;
  onWorkspaceUpdate: (event: Extract<WorkspaceRealtimeEvent, { type: 'workspace:updated' }>) => void;
  onProjectsUpdate: (event: Extract<WorkspaceRealtimeEvent, { type: 'projects:updated' }>) => void;
  onReconnectSync: () => void;
}

export function useRealtimeSync({
  enabled,
  authToken,
  projectId,
  activePage,
  userName = 'Team Member',
  onWorkspaceUpdate,
  onProjectsUpdate,
  onReconnectSync,
}: UseRealtimeSyncOptions) {
  const [connected, setConnected] = useState(false);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [lastSyncEvent, setLastSyncEvent] = useState<{
    summary: string;
    actorName: string;
    timestamp: string;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const hasConnectedOnceRef = useRef(false);

  const callbacksRef = useRef({
    onWorkspaceUpdate,
    onProjectsUpdate,
    onReconnectSync,
  });
  callbacksRef.current = {
    onWorkspaceUpdate,
    onProjectsUpdate,
    onReconnectSync,
  };

  const stateRef = useRef({ projectId, activePage, userName });
  stateRef.current = { projectId, activePage, userName };

  useEffect(() => {
    if (!enabled || !authToken || typeof window === 'undefined') {
      setPresenceUsers([]);
      setConnected(false);
      hasConnectedOnceRef.current = false;
      return;
    }

    let cancelled = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(authToken)}`;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (cancelled) {
          socket.close();
          return;
        }
        setConnected(true);
        const wasReconnect = hasConnectedOnceRef.current;
        hasConnectedOnceRef.current = true;
        reconnectAttempt = 0;

        if (stateRef.current.projectId) {
          socket.send(
            JSON.stringify({
              type: 'join',
              projectId: stateRef.current.projectId,
              activePage: stateRef.current.activePage,
            })
          );
        }

        if (wasReconnect) {
          callbacksRef.current.onReconnectSync();
        }
      };

      socket.onmessage = (evt) => {
        try {
          const payload = JSON.parse(String(evt.data)) as WorkspaceRealtimeEvent;
          if (payload.type === 'presence:updated') {
            if (payload.projectId === stateRef.current.projectId) {
              setPresenceUsers(payload.users);
            }
          } else if (payload.type === 'workspace:updated') {
            if (payload.projectId === stateRef.current.projectId) {
              setLastSyncEvent({
                summary: payload.summary,
                actorName: payload.actorName,
                timestamp: payload.timestamp,
              });
              callbacksRef.current.onWorkspaceUpdate(payload);
            }
          } else if (payload.type === 'projects:updated') {
            setLastSyncEvent({
              summary: payload.summary,
              actorName: 'Workspace',
              timestamp: payload.timestamp,
            });
            callbacksRef.current.onProjectsUpdate(payload);
          }
        } catch {
          // Ignore invalid WebSocket payloads
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (wsRef.current === socket) {
          wsRef.current = null;
        }
        if (!cancelled) {
          const delayMs = Math.min(8000, 800 * Math.pow(2, reconnectAttempt));
          reconnectAttempt++;
          reconnectTimer = setTimeout(connect, delayMs);
        }
      };

      socket.onerror = () => {
        // Error leads to onclose which schedules auto-reconnect
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [enabled, authToken]);

  // Update room & active page when project or page changes
  useEffect(() => {
    const socket = wsRef.current;
    if (!enabled || !authToken || !socket || socket.readyState !== WebSocket.OPEN || !projectId) {
      return;
    }
    socket.send(
      JSON.stringify({
        type: 'presence',
        projectId,
        activePage,
      })
    );
  }, [enabled, authToken, projectId, activePage, userName]);

  return {
    connected,
    presenceUsers,
    lastSyncEvent,
  };
}
