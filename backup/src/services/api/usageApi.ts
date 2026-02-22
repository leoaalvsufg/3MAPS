import type { PlanLimits } from '@/lib/plans';

// ---------------------------------------------------------------------------
// Usage API client
// ---------------------------------------------------------------------------

export interface UsageData {
  mapsCreatedThisMonth: number;
  monthKey: string;
  totalMapsCreated: number;
  chatMessagesSent: Record<string, number>;
}

export interface UsageResponse {
  usage: UsageData;
  limits: PlanLimits;
}

export interface CheckActionResponse {
  allowed: boolean;
  reason?: string;
  remaining?: number;
}

async function usageFetch<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new Error(`Network error: ${String((err as any)?.message ?? err)}`);
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const json = await res.json();
      if (json && typeof json === 'object' && 'error' in json) msg = String(json.error);
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

/**
 * Fetch the current user's usage stats and plan limits.
 */
export async function getUsage(token: string): Promise<UsageResponse> {
  return usageFetch<UsageResponse>('/api/usage', {
    method: 'GET',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

/**
 * Check whether a specific action is allowed for the current user.
 */
export async function checkAction(
  token: string,
  action: string,
  opts?: { mapId?: string; format?: string }
): Promise<CheckActionResponse> {
  return usageFetch<CheckActionResponse>('/api/usage/check', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...opts }),
  });
}
