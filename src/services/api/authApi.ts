export interface AuthUser {
  userId: string;
  username: string;
  isAdmin?: boolean;
  plan?: string;
  email?: string | null;
  avatarUrl?: string | null;
  extraCredits?: number;
}

export interface UserProfile {
  username: string;
  email: string | null;
  avatarUrl: string | null;
  plan: string;
  extraCredits?: number;
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

/** Get current user profile (email, avatar, etc.). Requires token. */
export async function getUserProfile(token: string): Promise<{ profile: UserProfile }> {
  const res = await fetch('/api/user/profile', {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(msg);
  }
  const data = await res.json();
  return { profile: data };
}

/** Update user profile (email). */
export async function updateUserProfile(token: string, updates: { email?: string | null }): Promise<UserProfile> {
  const res = await fetch('/api/user/profile', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(msg);
  }
  return (await res.json()) as UserProfile;
}

/** Change password. */
export async function changeUserPassword(
  token: string,
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  const res = await fetch('/api/user/change-password', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(msg);
  }
  return (await res.json()) as { message: string };
}

/** Upload avatar (base64 data URL). */
export async function uploadAvatar(token: string, avatarDataUrl: string): Promise<{ avatarUrl: string }> {
  const res = await fetch('/api/user/avatar', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ avatar: avatarDataUrl }),
  });
  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(msg);
  }
  return (await res.json()) as { avatarUrl: string };
}
