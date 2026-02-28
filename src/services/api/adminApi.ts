/**
 * src/services/api/adminApi.ts
 *
 * Admin API client — communicates with /api/admin/* endpoints.
 * All requests require an admin JWT token.
 */

export interface AdminUser {
  userId: string;
  username: string;
  plan: 'free' | 'premium' | 'enterprise' | 'admin';
  extraCredits?: number;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  isAdmin: boolean;
  stripeCustomerId?: string | null;
}

export interface AdminUserDetail extends AdminUser {
  usage: {
    mapsCreatedThisMonth: number;
    monthKey: string;
    totalMapsCreated: number;
    chatMessagesSent: Record<string, number>;
  };
  mapCount: number;
}

export interface AdminStats {
  totalUsers: number;
  totalMaps: number;
  currentMonthMaps: number;
  totalMapFiles: number;
  serverTime: string;
  usersByPlan: Record<string, number>;
  recentRegistrations: Array<{ date: string; count: number }>;
  recentActivity: Record<string, number>;
  llmUsage?: {
    estimatedRequestsThisMonth: number;
    mapsGenerationRequestsThisMonth: number;
    chatRequestsThisMonth: number;
    topAccounts: Array<{
      username: string;
      plan: string;
      estimatedLlmRequestsThisMonth: number;
      mapsUsedThisMonth: number;
      chatMessagesUsedThisMonth: number;
    }>;
  };
  accountResourceUsage?: Array<{
    username: string;
    plan: string;
    isAdmin: boolean;
    resources: {
      mapsPerMonth: { used: number; limit: number; remaining: number };
      mapsStored: { used: number; limit: number; remaining: number };
      chatMessagesThisMonth: { used: number; perMapLimit: number };
      estimatedLlmRequestsThisMonth: number;
    };
  }>;
}

export interface ListUsersResponse {
  users: AdminUser[];
  total: number;
  limit: number;
  offset: number;
}

export interface ActivityLog {
  id: number;
  username: string | null;
  action: string;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface ListLogsResponse {
  logs: ActivityLog[];
  total: number;
  actionTypes: string[];
}

export interface AdminNotification {
  id: number;
  type: 'warning' | 'error' | 'info';
  title: string;
  message: string;
  username: string | null;
  read: boolean;
  createdAt: string;
}

export interface ListNotificationsResponse {
  notifications: AdminNotification[];
  total: number;
  unreadCount: number;
}

export type AdminSettings = Record<string, string | number | boolean | null>;
export interface CreditLedgerEntry {
  id: number;
  username: string;
  delta: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string | null;
  createdBy: string | null;
  requestId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getToken(): string {
  // Read from localStorage via the auth store's persisted state
  try {
    const raw = localStorage.getItem('mindmap-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.state?.token ?? '';
    }
  } catch {
    // ignore
  }
  return '';
}

async function adminFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (err) {
    throw new Error(`Network error: ${String((err as any)?.message ?? err)}`);
  }

  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const json = await res.json();
      if (json?.error) msg = String(json.error);
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Users API
// ---------------------------------------------------------------------------

export async function getAdminStats(): Promise<AdminStats> {
  return adminFetch<AdminStats>('/api/admin/stats');
}

export async function listAdminUsers(params?: {
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<ListUsersResponse> {
  const qs = new URLSearchParams();
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  if (params?.offset !== undefined) qs.set('offset', String(params.offset));
  if (params?.search) qs.set('search', params.search);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return adminFetch<ListUsersResponse>(`/api/admin/users${query}`);
}

export async function createAdminUser(data: {
  username: string;
  password: string;
  plan?: string;
  email?: string | null;
  isAdmin?: boolean;
}): Promise<{ userId: string; username: string }> {
  return adminFetch<{ userId: string; username: string }>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getAdminUser(username: string): Promise<AdminUserDetail> {
  return adminFetch<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(username)}`);
}

export async function updateAdminUser(
  username: string,
  updates: Partial<Pick<AdminUser, 'plan' | 'isActive' | 'isAdmin' | 'email' | 'extraCredits'> & { password: string }>
): Promise<AdminUser> {
  return adminFetch<AdminUser>(`/api/admin/users/${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteAdminUser(username: string): Promise<{ ok: boolean }> {
  return adminFetch<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(username)}`, {
    method: 'DELETE',
  });
}

export async function resetUserUsage(username: string): Promise<{ ok: boolean; username: string }> {
  return adminFetch<{ ok: boolean; username: string }>(
    `/api/admin/users/${encodeURIComponent(username)}/reset-usage`,
    { method: 'POST' }
  );
}

export async function addAdminUserCredits(
  username: string,
  data: { amount: number; reason?: string; requestId?: string }
): Promise<{
  ok: boolean;
  username: string;
  requestId: string;
  added: number;
  balanceBefore: number;
  balanceAfter: number;
  ledgerEntryId: number;
  idempotent?: boolean;
}> {
  return adminFetch(`/api/admin/users/${encodeURIComponent(username)}/credits/add`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listAdminUserCreditsLedger(
  username: string,
  params?: { limit?: number; offset?: number }
): Promise<{ username: string; currentBalance: number; entries: CreditLedgerEntry[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  if (params?.offset !== undefined) qs.set('offset', String(params.offset));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return adminFetch(`/api/admin/users/${encodeURIComponent(username)}/credits/ledger${query}`);
}

// ---------------------------------------------------------------------------
// Logs API
// ---------------------------------------------------------------------------

export async function listAdminLogs(params?: {
  limit?: number;
  offset?: number;
  username?: string;
  action?: string;
  since?: string;
}): Promise<ListLogsResponse> {
  const qs = new URLSearchParams();
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  if (params?.offset !== undefined) qs.set('offset', String(params.offset));
  if (params?.username) qs.set('username', params.username);
  if (params?.action) qs.set('action', params.action);
  if (params?.since) qs.set('since', params.since);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return adminFetch<ListLogsResponse>(`/api/admin/logs${query}`);
}

// ---------------------------------------------------------------------------
// Notifications API
// ---------------------------------------------------------------------------

export async function listAdminNotifications(params?: {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}): Promise<ListNotificationsResponse> {
  const qs = new URLSearchParams();
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  if (params?.offset !== undefined) qs.set('offset', String(params.offset));
  if (params?.unreadOnly) qs.set('unread', 'true');
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return adminFetch<ListNotificationsResponse>(`/api/admin/notifications${query}`);
}

export async function markNotificationsRead(ids: number[] | 'all'): Promise<{ ok: boolean }> {
  return adminFetch<{ ok: boolean }>('/api/admin/notifications/read', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

// ---------------------------------------------------------------------------
// Settings API
// ---------------------------------------------------------------------------

export async function getAdminSettings(): Promise<AdminSettings> {
  return adminFetch<AdminSettings>('/api/admin/settings');
}

export async function updateAdminSettings(settings: AdminSettings): Promise<{ ok: boolean; updated: string[] }> {
  return adminFetch<{ ok: boolean; updated: string[] }>('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// ---------------------------------------------------------------------------
// API Tokens API
// ---------------------------------------------------------------------------

export interface ApiToken {
  id: string;
  tokenPrefix: string;
  username: string;
  name: string | null;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  isActive: boolean;
  createdAt: string;
  createdBy: string | null;
}

export interface ListApiTokensResponse {
  tokens: ApiToken[];
}

export interface CreateApiTokenResponse {
  id: string;
  username: string;
  name: string | null;
  scopes: string[];
  expiresAt: string | null;
  token: string;
  message: string;
}

export async function listAdminTokens(username?: string): Promise<ListApiTokensResponse> {
  const qs = username ? new URLSearchParams({ username }) : '';
  const query = qs ? `?${qs}` : '';
  return adminFetch<ListApiTokensResponse>(`/api/admin/tokens${query}`);
}

export async function createAdminToken(data: {
  username: string;
  name?: string;
  scopes?: string[];
  expiresInDays?: number;
}): Promise<CreateApiTokenResponse> {
  return adminFetch<CreateApiTokenResponse>('/api/admin/tokens', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ---------------------------------------------------------------------------
// Billing / Stripe sync API
// ---------------------------------------------------------------------------

export interface BillingSyncResponse {
  synced: number;
  total: number;
  results: Array<{ username: string; plan?: string; changed?: boolean; error?: string }>;
}

export async function syncBillingStripe(): Promise<BillingSyncResponse> {
  return adminFetch<BillingSyncResponse>('/api/admin/billing/sync', { method: 'POST' });
}

export interface BillingSubscriptionStatusResponse {
  statusByUser: Record<string, { periodEnd?: string | null; status?: string | null; stripeCustomerId?: string; error?: boolean }>;
}

export async function getBillingSubscriptionStatus(): Promise<BillingSubscriptionStatusResponse> {
  return adminFetch<BillingSubscriptionStatusResponse>('/api/admin/billing/subscription-status');
}

// ---------------------------------------------------------------------------
// LLM Credits API
// ---------------------------------------------------------------------------

export interface LlmCredits {
  openrouter: { totalCredits: number; totalUsage: number; remaining: number } | null;
  openai: { status: string; note: string } | null;
  gemini: { status: string; note: string } | null;
}

export async function getAdminLlmCredits(): Promise<LlmCredits> {
  return adminFetch<LlmCredits>('/api/admin/llm-credits');
}

export async function revokeAdminToken(id: string): Promise<{ message: string }> {
  return adminFetch<{ message: string }>(`/api/admin/tokens/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
