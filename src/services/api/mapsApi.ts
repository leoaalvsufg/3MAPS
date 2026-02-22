import type { SavedMap } from '@/types/mindmap';
import { useAuthStore } from '@/stores/auth-store';

export class HttpError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.name = 'HttpError';
		this.status = status;
	}
}

export function isHttpError(err: unknown): err is HttpError {
	return err instanceof HttpError;
}

async function readErrorMessage(res: Response) {
  try {
    const json = await res.json();
    if (json && typeof json === 'object' && 'error' in json) return String(json.error);
  } catch {
    // ignore
  }
  return `${res.status} ${res.statusText}`;
}

/** Build auth headers if a token is available. */
function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
	let res: Response;
	try {
		res = await fetch(input, {
      ...init,
      headers: {
        ...authHeaders(),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
	} catch (err) {
		// e.g. server down / DNS / CORS / offline
		throw new Error(`Network error: ${String((err as any)?.message ?? err)}`);
	}
  if (!res.ok) {
		throw new HttpError(res.status, await readErrorMessage(res));
  }
  return (await res.json()) as T;
}

export async function listUserMaps(username: string): Promise<SavedMap[]> {
  return await fetchJson<SavedMap[]>(`/api/users/${encodeURIComponent(username)}/maps`);
}

export async function getUserMap(username: string, mapId: string): Promise<SavedMap> {
  return await fetchJson<SavedMap>(
    `/api/users/${encodeURIComponent(username)}/maps/${encodeURIComponent(mapId)}`
  );
}

export async function putUserMap(username: string, mapId: string, map: SavedMap): Promise<SavedMap> {
  return await fetchJson<SavedMap>(
    `/api/users/${encodeURIComponent(username)}/maps/${encodeURIComponent(mapId)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(map),
    }
  );
}

export async function deleteUserMap(username: string, mapId: string): Promise<{ ok: boolean; deleted: boolean }> {
  return await fetchJson<{ ok: boolean; deleted: boolean }>(
    `/api/users/${encodeURIComponent(username)}/maps/${encodeURIComponent(mapId)}`,
    { method: 'DELETE' }
  );
}
