export interface AuthUser {
  userId: string;
  username: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const json = await res.json();
    if (json && typeof json === 'object' && 'error' in json) return String(json.error);
  } catch {
    // ignore
  }
  return `${res.status} ${res.statusText}`;
}

async function authFetch<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new Error(`Network error: ${String((err as any)?.message ?? err)}`);
  }
  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export async function loginUser(username: string, password: string): Promise<AuthResponse> {
  return authFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

export async function registerUser(username: string, password: string): Promise<AuthResponse> {
  return authFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

export async function getCurrentUser(token: string): Promise<{ user: AuthUser }> {
  return authFetch<{ user: AuthUser }>('/api/auth/me', {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  });
}
