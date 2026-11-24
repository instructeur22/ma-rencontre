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
  const token = getToken();
  if (!token) return null;

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);

  ws.addEventListener('message', (evt) => {
    try {
      const payload = JSON.parse(evt.data);
      onEvent(payload);
    } catch {
      // Ignore malformed payload
    }
  });

  return ws;
}
