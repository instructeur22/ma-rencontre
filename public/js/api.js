const TOKEN_KEY = 'akwaba_jwt_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const errMsg = data?.error?.message || `Erreur réseau (${res.status})`;
    const error = new Error(errMsg);
    error.code = data?.error?.code || 'API_ERROR';
    error.status = res.status;
    throw error;
  }
  return data.data !== undefined ? data.data : data;
}

export function connectRealtimeSocket(onEvent) {
  let socket = null;
  let closedByUser = false;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let pingTimer = null;

  const clearTimers = () => {
    clearTimeout(reconnectTimer);
    clearInterval(pingTimer);
    reconnectTimer = null;
    pingTimer = null;
  };

  const scheduleReconnect = () => {
    if (closedByUser || !getToken()) return;
    const delays = [1000, 2000, 4000, 8000, 15000];
    const delay = delays[Math.min(reconnectAttempt, delays.length - 1)];
    reconnectAttempt += 1;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(openConnection, delay);
  };

  const openConnection = async () => {
    if (closedByUser || !getToken()) return;
    try {
      const res = await apiFetch('/auth/ws-ticket', { method: 'POST' });
      if (closedByUser || !res?.ticket) return;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws?ticket=${encodeURIComponent(res.ticket)}`);
      socket = ws;

      ws.addEventListener('open', () => {
        reconnectAttempt = 0;
        clearInterval(pingTimer);
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25_000);
      });

      ws.addEventListener('message', (evt) => {
        try {
          const payload = JSON.parse(evt.data);
          onEvent(payload);
        } catch {
          // Ignore malformed payload
        }
      });

      ws.addEventListener('close', (evt) => {
        clearInterval(pingTimer);
        if (evt.code === 4004) {
          closedByUser = true;
          return;
        }
        scheduleReconnect();
      });

      ws.addEventListener('error', () => {
        // close listener handles backoff reconnection
      });
    } catch {
      scheduleReconnect();
    }
  };

  openConnection();

  return {
    send(payload) {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
        return true;
      }
      return false;
    },
    isOpen() {
      return Boolean(socket && socket.readyState === WebSocket.OPEN);
    },
    close() {
      closedByUser = true;
      clearTimers();
      if (socket) {
        try {
          socket.close();
        } catch {
          // Ignore close errors
        }
        socket = null;
      }
    },
  };
}
