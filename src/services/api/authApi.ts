export interface AuthUser {
  userId: string;
  username: string;
  isAdmin?: boolean;
  plan?: string;
  extraCredits?: number;
  /** URL da foto do usuário (login social Google/Firebase) */
  photoURL?: string | null;
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

/**
 * Exchange Firebase ID token for app JWT (after sign-in with Firebase Auth).
 */
export async function firebaseLogin(idToken: string): Promise<AuthResponse> {
  return authFetch<AuthResponse>('/api/auth/firebase', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
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

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return authFetch<{ message: string }>('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  return authFetch<{ message: string }>('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
}

/** Solicita envio de link mágico por e-mail (aceita e-mail ou username). */
export async function requestMagicLink(login: string): Promise<{ message: string }> {
  const trimmed = login.trim();
  const body = trimmed.includes('@') ? { email: trimmed } : { username: trimmed };
  return authFetch<{ message: string }>('/api/auth/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Troca token do link mágico por JWT (faz login). */
export async function verifyMagicLink(token: string): Promise<AuthResponse> {
  return authFetch<AuthResponse>('/api/auth/magic-link/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}
