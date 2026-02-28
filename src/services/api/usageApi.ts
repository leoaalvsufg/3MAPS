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
  extraCredits?: number;
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
  opts?: { mapId?: string; format?: string; generationMode?: 'normal' | 'deep' }
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

export async function consumeMapGenerationCredits(
  token: string,
  generationMode: 'normal' | 'deep',
  requestId?: string
): Promise<{ ok: boolean; consumedExtraCredits: number; remainingExtraCredits: number; ledgerEntryId?: number; idempotent?: boolean }> {
  return usageFetch<{ ok: boolean; consumedExtraCredits: number; remainingExtraCredits: number; ledgerEntryId?: number; idempotent?: boolean }>('/api/usage/map-generation', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ generationMode, requestId }),
  });
}

export async function listMyCreditLedger(
  token: string,
  params?: { limit?: number; offset?: number }
): Promise<{
  username: string;
  currentBalance: number;
  entries: Array<{
    id: number;
    username: string;
    delta: number;
    balanceBefore: number;
    balanceAfter: number;
    reason: string | null;
    createdBy: string | null;
    requestId: string | null;
    createdAt: string;
  }>;
  total: number;
}> {
  const qs = new URLSearchParams();
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  if (params?.offset !== undefined) qs.set('offset', String(params.offset));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return usageFetch(`/api/usage/credits/ledger${query}`, {
    method: 'GET',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

/**
 * Record that a chat message was sent for a given map.
 * Call after the chat response completes successfully.
 */
export async function recordChatMessage(token: string, mapId: string): Promise<{ ok: boolean }> {
  return usageFetch<{ ok: boolean }>('/api/usage/chat-message', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ mapId }),
  });
}
