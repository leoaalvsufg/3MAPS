/**
 * src/pages/AdminPage.tsx
 *
 * Administrative dashboard — 5 tabs:
 *   1. Estatísticas — system stats with plan breakdown and activity
 *   2. Usuários     — user management (list, create, edit, delete)
 *   3. Logs         — activity feed with filters
 *   4. Pagamentos   — Stripe configuration and plan pricing
 *   5. Notificações — admin alerts for suspicious activity
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import {
  getAdminStats,
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  resetUserUsage,
  listAdminLogs,
  listAdminNotifications,
  markNotificationsRead,
  getAdminSettings,
  updateAdminSettings,
  listAdminTokens,
  createAdminToken,
  revokeAdminToken,
  getAdminLlmCredits,
  type AdminUser,
  type AdminStats,
  type ListUsersResponse,
  type ListLogsResponse,
  type AdminNotification,
  type AdminSettings,
  type ApiToken,
  type LlmCredits,
} from '@/services/api/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Users,
  BarChart3,
  Search,
  MoreVertical,
  Shield,
  ShieldOff,
  UserX,
  RefreshCw,
  Crown,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Activity,
  Bell,
  CreditCard,
  UserPlus,
  Eye,
  EyeOff,
  Save,
  Info,
  SlidersHorizontal,
  Key,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'stats' | 'users' | 'logs' | 'payments' | 'notifications' | 'llm' | 'api-tokens';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, string> = {
    free: 'bg-slate-100 text-slate-700',
    premium: 'bg-amber-100 text-amber-700',
    enterprise: 'bg-blue-100 text-blue-700',
    admin: 'bg-violet-100 text-violet-700',
  };
  const labels: Record<string, string> = {
    free: 'Gratuito',
    premium: 'Premium',
    enterprise: 'Enterprise',
    admin: 'Admin',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[plan] ?? styles.free}`}>
      {labels[plan] ?? plan}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color} shrink-0`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function Toast({ toast }: { toast: { type: 'success' | 'error'; message: string } | null }) {
  if (!toast) return null;
  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
      toast.type === 'success'
        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
        : 'bg-red-50 text-red-800 border border-red-200'
    }`}>
      {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {toast.message}
    </div>
  );
}

function useToast() {
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);
  return { toast, showToast };
}

// ---------------------------------------------------------------------------
// Edit user dialog
// ---------------------------------------------------------------------------

interface EditUserDialogProps {
  user: AdminUser | null;
  onClose: () => void;
  onSave: (username: string, updates: Partial<AdminUser & { password: string; addExtraCredits?: number }>) => Promise<void>;
}

function EditUserDialog({ user, onClose, onSave }: EditUserDialogProps) {
  const [plan, setPlan] = useState(user?.plan ?? 'free');
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [isAdmin, setIsAdmin] = useState(user?.isAdmin ?? false);
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [addExtraCredits, setAddExtraCredits] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setPlan(user.plan);
      setIsActive(user.isActive);
      setIsAdmin(user.isAdmin);
      setEmail(user.email ?? '');
      setPassword('');
      setAddExtraCredits('');
      setError(null);
    }
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const updates: Partial<AdminUser & { password: string; addExtraCredits?: number }> = { plan, isActive, isAdmin, email: email || null };
      if (password) updates.password = password;
      const n = parseInt(addExtraCredits, 10);
      if (Number.isFinite(n) && n > 0) updates.addExtraCredits = n;
      await onSave(user.username, updates);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Usuário: {user?.username}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Plano</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as AdminUser['plan'])}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="free">Gratuito</option>
              <option value="premium">Premium</option>
              <option value="enterprise">Enterprise (API própria)</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">E-mail (opcional)</label>
            <Input type="email" placeholder="usuario@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Nova senha (deixe em branco para manter)</label>
            <Input type="password" placeholder="••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {(plan === 'premium' || user?.extraCredits !== undefined) && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">Créditos extras (Premium)</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">
                  Atuais: {(user?.extraCredits ?? 0)}
                </span>
                <Input
                  type="number"
                  min={0}
                  placeholder="Adicionar quantidade"
                  value={addExtraCredits}
                  onChange={(e) => setAddExtraCredits(e.target.value)}
                  className="w-32"
                />
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
              <span className="text-sm text-slate-700">Conta ativa</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
              <span className="text-sm text-slate-700">Administrador</span>
            </label>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Create user dialog
// ---------------------------------------------------------------------------

interface CreateUserDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { username: string; password: string; plan: string; email: string; isAdmin: boolean }) => Promise<void>;
}

function CreateUserDialog({ open, onClose, onCreate }: CreateUserDialogProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState('free');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setUsername(''); setPassword(''); setEmail(''); setPlan('free'); setIsAdmin(false); setError(null);
  }

  async function handleCreate() {
    setError(null);
    if (!username.trim()) { setError('Nome de usuário é obrigatório'); return; }
    if (!password) { setError('Senha é obrigatória'); return; }
    setLoading(true);
    try {
      await onCreate({ username: username.trim(), password, plan, email: email.trim(), isAdmin });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-indigo-600" />
            Criar Novo Usuário
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Nome de usuário *</label>
            <Input placeholder="seu_usuario" value={username} onChange={(e) => setUsername(e.target.value)} />
            <p className="text-xs text-slate-400">3–30 caracteres: letras, números, hífens ou underscores.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Senha *</label>
            <Input type="password" placeholder="••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-xs text-slate-400">Mínimo de 6 caracteres.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">E-mail (opcional)</label>
            <Input type="email" placeholder="usuario@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Plano</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="free">Gratuito</option>
              <option value="premium">Premium</option>
              <option value="enterprise">Enterprise</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
            <span className="text-sm text-slate-700">Administrador</span>
          </label>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={loading}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
            Criar Usuário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

function DeleteDialog({ username, onClose, onConfirm }: {
  username: string | null;
  onClose: () => void;
  onConfirm: (username: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!username) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm(username);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={!!username} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            Excluir Usuário
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600 py-2">
          Tem certeza que deseja excluir o usuário <strong>{username}</strong>? Esta ação não pode ser desfeita.
        </p>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Stats tab
// ---------------------------------------------------------------------------

function LlmCreditsPanel() {
  const [credits, setCredits] = useState<LlmCredits | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setCredits(await getAdminLlmCredits());
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>;
  if (!credits) return null;

  const fmtUsd = (v: number) => `$${v.toFixed(4)}`;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">Créditos / Saldo dos Provedores LLM</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* OpenRouter */}
        <div className={`rounded-lg p-4 border ${credits.openrouter ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
          <div className="text-xs font-semibold text-slate-500 mb-1">OpenRouter</div>
          {credits.openrouter ? (
            <>
              <div className="text-lg font-bold text-emerald-700">{fmtUsd(credits.openrouter.remaining)}</div>
              <div className="text-xs text-slate-500 mt-1">
                Total: {fmtUsd(credits.openrouter.totalCredits)} · Usado: {fmtUsd(credits.openrouter.totalUsage)}
              </div>
              <div className="mt-2 w-full bg-emerald-100 rounded-full h-1.5">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full"
                  style={{ width: `${credits.openrouter.totalCredits > 0 ? Math.min(100, (credits.openrouter.remaining / credits.openrouter.totalCredits) * 100) : 0}%` }}
                />
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-400">Chave não configurada</div>
          )}
        </div>

        {/* OpenAI */}
        <div className={`rounded-lg p-4 border ${credits.openai ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
          <div className="text-xs font-semibold text-slate-500 mb-1">OpenAI</div>
          {credits.openai ? (
            <>
              <div className="text-sm font-medium text-blue-700">Chave configurada</div>
              <p className="text-xs text-slate-500 mt-1">{credits.openai.note}</p>
              <a href="https://platform.openai.com/account/billing/overview" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline mt-1 inline-block">
                Ver saldo no painel
              </a>
            </>
          ) : (
            <div className="text-sm text-slate-400">Chave não configurada</div>
          )}
        </div>

        {/* Gemini */}
        <div className={`rounded-lg p-4 border ${credits.gemini ? 'border-violet-200 bg-violet-50' : 'border-slate-200 bg-slate-50'}`}>
          <div className="text-xs font-semibold text-slate-500 mb-1">Google Gemini</div>
          {credits.gemini ? (
            <>
              <div className="text-sm font-medium text-violet-700">Chave configurada</div>
              <p className="text-xs text-slate-500 mt-1">{credits.gemini.note}</p>
              <a href="https://ai.dev/rate-limit" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline mt-1 inline-block">
                Ver limites
              </a>
            </>
          ) : (
            <div className="text-sm text-slate-400">Chave não configurada</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatsTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await getAdminStats());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar estatísticas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStats(); }, [loadStats]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  if (error) return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <XCircle className="w-10 h-10 text-red-400" />
      <p className="text-slate-600">{error}</p>
      <Button variant="outline" onClick={loadStats}>Tentar novamente</Button>
    </div>
  );

  const planColors: Record<string, string> = {
    free: 'bg-slate-100 text-slate-700',
    premium: 'bg-amber-100 text-amber-700',
    enterprise: 'bg-blue-100 text-blue-700',
    admin: 'bg-violet-100 text-violet-700',
  };
  const planLabels: Record<string, string> = { free: 'Gratuito', premium: 'Premium', enterprise: 'Enterprise', admin: 'Admin' };
  const fmtLimit = (v: number) => (v === -1 ? 'Ilimitado' : String(v));
  const fmtRemaining = (v: number) => (v === -1 ? 'Ilimitado' : String(v));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Estatísticas do Sistema</h2>
        <Button variant="outline" size="sm" onClick={loadStats}>
          <RefreshCw className="w-4 h-4 mr-2" />Atualizar
        </Button>
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total de Usuários" value={stats?.totalUsers ?? 0} icon={Users} color="bg-indigo-500" />
        <StatCard label="Mapas Este Mês" value={stats?.currentMonthMaps ?? 0} icon={BarChart3} color="bg-emerald-500" />
        <StatCard label="Total de Mapas" value={stats?.totalMaps ?? 0} icon={BarChart3} color="bg-amber-500" />
        <StatCard label="Arquivos de Mapa" value={stats?.totalMapFiles ?? 0} icon={BarChart3} color="bg-violet-500" />
      </div>

      {/* LLM usage summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="LLM (estimado/mês)"
          value={stats?.llmUsage?.estimatedRequestsThisMonth ?? 0}
          icon={Activity}
          color="bg-fuchsia-500"
          sub="estimativa: mapas*3 + chat"
        />
        <StatCard
          label="Geração de Mapas (LLM)"
          value={stats?.llmUsage?.mapsGenerationRequestsThisMonth ?? 0}
          icon={BarChart3}
          color="bg-cyan-500"
        />
        <StatCard
          label="Chat (LLM)"
          value={stats?.llmUsage?.chatRequestsThisMonth ?? 0}
          icon={Activity}
          color="bg-teal-500"
        />
      </div>

      {/* LLM Credits */}
      <LlmCreditsPanel />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Users by plan */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Usuários por Plano</h3>
          {stats?.usersByPlan && Object.keys(stats.usersByPlan).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(stats.usersByPlan).map(([plan, count]) => {
                const total = stats.totalUsers || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={plan}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${planColors[plan] ?? 'bg-slate-100 text-slate-700'}`}>
                        {planLabels[plan] ?? plan}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">{count} <span className="text-slate-400 font-normal">({pct}%)</span></span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Nenhum dado disponível.</p>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Atividade nas Últimas 24h</h3>
          {stats?.recentActivity && Object.keys(stats.recentActivity).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(stats.recentActivity).map(([action, count]) => (
                <div key={action} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-sm text-slate-600 font-mono">{action}</span>
                  <span className="text-sm font-semibold text-slate-900 bg-slate-50 px-2 py-0.5 rounded">{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Nenhuma atividade registrada.</p>
          )}
        </div>
      </div>

      {/* Recent registrations */}
      {stats?.recentRegistrations && stats.recentRegistrations.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Novos Cadastros (últimos 30 dias)</h3>
          <div className="flex items-end gap-1 h-20">
            {stats.recentRegistrations.map((item) => {
              const max = Math.max(...stats.recentRegistrations.map((r) => r.count), 1);
              const height = Math.max((item.count / max) * 100, 4);
              return (
                <div key={item.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div
                    className="w-full bg-indigo-400 rounded-t hover:bg-indigo-500 transition-colors cursor-default"
                    style={{ height: `${height}%` }}
                    title={`${item.date}: ${item.count} cadastro(s)`}
                  />
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    {item.count}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1 text-xs text-slate-400">
            <span>{stats.recentRegistrations[0]?.date}</span>
            <span>{stats.recentRegistrations[stats.recentRegistrations.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Account resources usage */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Recursos por Conta (disponíveis x usados)</h3>
          <span className="text-xs text-slate-400">baseado no mês atual</span>
        </div>
        {stats?.accountResourceUsage && stats.accountResourceUsage.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Usuário</th>
                  <th className="text-left px-4 py-2.5 font-medium">Plano</th>
                  <th className="text-left px-4 py-2.5 font-medium">Mapas/mês (usado/limite)</th>
                  <th className="text-left px-4 py-2.5 font-medium">Mapas armazenados (usado/limite)</th>
                  <th className="text-left px-4 py-2.5 font-medium">Chat (mensagens mês)</th>
                  <th className="text-left px-4 py-2.5 font-medium">LLM estimado (mês)</th>
                </tr>
              </thead>
              <tbody>
                {stats.accountResourceUsage.map((row) => (
                  <tr key={row.username} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{row.username}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${planColors[row.plan] ?? 'bg-slate-100 text-slate-700'}`}>
                        {planLabels[row.plan] ?? row.plan}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {row.resources.mapsPerMonth.used} / {fmtLimit(row.resources.mapsPerMonth.limit)}
                      <span className="text-xs text-slate-400 ml-1">
                        (restante: {fmtRemaining(row.resources.mapsPerMonth.remaining)})
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {row.resources.mapsStored.used} / {fmtLimit(row.resources.mapsStored.limit)}
                      <span className="text-xs text-slate-400 ml-1">
                        (restante: {fmtRemaining(row.resources.mapsStored.remaining)})
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {row.resources.chatMessagesThisMonth.used}
                      <span className="text-xs text-slate-400 ml-1">
                        (limite/mapa: {fmtLimit(row.resources.chatMessagesThisMonth.perMapLimit)})
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">
                      {row.resources.estimatedLlmRequestsThisMonth}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-8 text-sm text-slate-400">Nenhum dado de recursos disponível.</div>
        )}
      </div>

      {/* Server info */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Informações do Servidor</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-500">Hora do servidor</dt>
            <dd className="font-medium text-slate-900">{stats ? new Date(stats.serverTime).toLocaleString('pt-BR') : '—'}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users tab
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

function UsersTab() {
  const [data, setData] = useState<ListUsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(0);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteUsername, setDeleteUsername] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { toast, showToast } = useToast();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listAdminUsers({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, search }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  async function handleSaveUser(username: string, updates: Partial<AdminUser & { password: string }>) {
    await updateAdminUser(username, updates);
    showToast('success', `Usuário ${username} atualizado.`);
    void loadUsers();
  }

  async function handleCreateUser(data: { username: string; password: string; plan: string; email: string; isAdmin: boolean }) {
    await createAdminUser(data);
    showToast('success', `Usuário ${data.username} criado com sucesso.`);
    void loadUsers();
  }

  async function handleDeleteUser(username: string) {
    await deleteAdminUser(username);
    showToast('success', `Usuário ${username} excluído.`);
    void loadUsers();
  }

  async function handleResetUsage(username: string) {
    try {
      await resetUserUsage(username);
      showToast('success', `Uso mensal de ${username} resetado.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Erro ao resetar uso');
    }
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="flex flex-col gap-4">
      <Toast toast={toast} />

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold text-slate-900">Gerenciar Usuários</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setPage(0); }} className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input type="text" placeholder="Buscar usuário..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-9 w-48" />
            </div>
            <Button type="submit" variant="outline" size="sm">Buscar</Button>
            {search && <Button type="button" variant="ghost" size="sm" onClick={() => { setSearch(''); setSearchInput(''); setPage(0); }}>Limpar</Button>}
          </form>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Novo Usuário
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <XCircle className="w-10 h-10 text-red-400" />
          <p className="text-slate-600">{error}</p>
          <Button variant="outline" onClick={loadUsers}>Tentar novamente</Button>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Usuário</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Plano</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Criado em</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.users.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-12 text-slate-400">Nenhum usuário encontrado.</td></tr>
                  ) : (
                    data?.users.map((user) => (
                      <tr key={user.userId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs shrink-0">
                              {user.username.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900">{user.username}</p>
                              {user.email && <p className="text-xs text-slate-400">{user.email}</p>}
                            </div>
                            {user.isAdmin && <span title="Administrador"><Shield className="w-3.5 h-3.5 text-violet-500" /></span>}
                          </div>
                        </td>
                        <td className="px-4 py-3"><PlanBadge plan={user.plan} /></td>
                        <td className="px-4 py-3">
                          {user.isActive
                            ? <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium"><CheckCircle className="w-3.5 h-3.5" /> Ativo</span>
                            : <span className="inline-flex items-center gap-1 text-red-500 text-xs font-medium"><XCircle className="w-3.5 h-3.5" /> Inativo</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{new Date(user.createdAt).toLocaleDateString('pt-BR')}</td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><MoreVertical className="w-4 h-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditUser(user)}><Shield className="w-4 h-4 mr-2" />Editar</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleSaveUser(user.username, { plan: 'premium' })}><Crown className="w-4 h-4 mr-2" />Promover para Premium</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleSaveUser(user.username, { plan: 'enterprise' })}><Crown className="w-4 h-4 mr-2 text-blue-600" />Promover para Enterprise</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleSaveUser(user.username, { plan: 'free' })}><ShieldOff className="w-4 h-4 mr-2" />Rebaixar para Gratuito</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleResetUsage(user.username)}><RefreshCw className="w-4 h-4 mr-2" />Resetar uso mensal</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setDeleteUsername(user.username)}>
                                <UserX className="w-4 h-4 mr-2" />Excluir usuário
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>{data?.total ?? 0} usuário{(data?.total ?? 0) !== 1 ? 's' : ''}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft className="w-4 h-4" /></Button>
                <span>Página {page + 1} de {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </>
      )}

      <EditUserDialog user={editUser} onClose={() => setEditUser(null)} onSave={handleSaveUser} />
      <DeleteDialog username={deleteUsername} onClose={() => setDeleteUsername(null)} onConfirm={handleDeleteUser} />
      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreateUser} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Logs tab
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  login: 'Login',
  login_failed: 'Login falhou',
  register: 'Cadastro',
  create_map: 'Criou mapa',
  delete_map: 'Excluiu mapa',
  password_reset: 'Redefiniu senha',
  admin_create_user: 'Admin: criou usuário',
  admin_update_settings: 'Admin: atualizou config',
};

const ACTION_COLORS: Record<string, string> = {
  login: 'bg-emerald-100 text-emerald-700',
  login_failed: 'bg-red-100 text-red-700',
  register: 'bg-blue-100 text-blue-700',
  create_map: 'bg-indigo-100 text-indigo-700',
  delete_map: 'bg-orange-100 text-orange-700',
  password_reset: 'bg-amber-100 text-amber-700',
  admin_create_user: 'bg-violet-100 text-violet-700',
  admin_update_settings: 'bg-violet-100 text-violet-700',
};

function LogsTab() {
  const [data, setData] = useState<ListLogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filterUsername, setFilterUsername] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [usernameInput, setUsernameInput] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listAdminLogs({ limit: 50, offset: page * 50, username: filterUsername, action: filterAction }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar logs');
    } finally {
      setLoading(false);
    }
  }, [page, filterUsername, filterAction]);

  useEffect(() => { void loadLogs(); }, [loadLogs]);

  const totalPages = data ? Math.ceil(data.total / 50) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold text-slate-900">Logs de Atividade</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <form onSubmit={(e) => { e.preventDefault(); setFilterUsername(usernameInput); setPage(0); }} className="flex items-center gap-2">
            <Input placeholder="Filtrar por usuário..." value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} className="w-40" />
            <Button type="submit" variant="outline" size="sm">Filtrar</Button>
            {filterUsername && <Button type="button" variant="ghost" size="sm" onClick={() => { setFilterUsername(''); setUsernameInput(''); setPage(0); }}>Limpar</Button>}
          </form>
          <select
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todas as ações</option>
            {data?.actionTypes.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={loadLogs}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <XCircle className="w-10 h-10 text-red-400" />
          <p className="text-slate-600">{error}</p>
          <Button variant="outline" onClick={loadLogs}>Tentar novamente</Button>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Data/Hora</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Usuário</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Ação</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">IP</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.logs.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-12 text-slate-400">Nenhum log encontrado.</td></tr>
                  ) : (
                    data?.logs.map((log) => (
                      <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap text-xs">
                          {new Date(log.createdAt).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-4 py-2.5">
                          {log.username ? (
                            <span className="font-medium text-slate-900">{log.username}</span>
                          ) : (
                            <span className="text-slate-400 italic">sistema</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[log.action] ?? 'bg-slate-100 text-slate-700'}`}>
                            {ACTION_LABELS[log.action] ?? log.action}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-400 text-xs font-mono">{log.ip ?? '—'}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs max-w-xs truncate">
                          {log.details ? JSON.stringify(log.details) : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>{data?.total ?? 0} registro{(data?.total ?? 0) !== 1 ? 's' : ''}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft className="w-4 h-4" /></Button>
                <span>Página {page + 1} de {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LLM / APIs tab — chaves no servidor, só admin configura
// ---------------------------------------------------------------------------

import {
  OPENROUTER_MODELS,
  OPENAI_MODELS,
  GEMINI_MODELS,
} from '@/lib/constants';
import { useSettingsStore } from '@/stores/settings-store';
import type { LLMProvider } from '@/types/settings';

const PROVIDER_TABS: { id: LLMProvider; label: string; keyField: string; placeholder: string; link: string; models: { id: string; name: string; description: string }[] }[] = [
  { id: 'openrouter', label: 'OpenRouter', keyField: 'openrouter_api_key', placeholder: 'sk-or-v1-...', link: 'https://openrouter.ai/keys', models: OPENROUTER_MODELS as { id: string; name: string; description: string }[] },
  { id: 'openai', label: 'OpenAI', keyField: 'openai_api_key', placeholder: 'sk-...', link: 'https://platform.openai.com/api-keys', models: OPENAI_MODELS as { id: string; name: string; description: string }[] },
  { id: 'gemini', label: 'Gemini', keyField: 'gemini_api_key', placeholder: 'AIza...', link: 'https://aistudio.google.com/apikey', models: GEMINI_MODELS as { id: string; name: string; description: string }[] },
];

function LLMApiTab() {
  const [settings, setSettings] = useState<AdminSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);
  const [activeProvider, setActiveProvider] = useState<LLMProvider>('openrouter');
  const [manualModel, setManualModel] = useState('');
  const [testResults, setTestResults] = useState<Record<string, 'ok' | 'fail' | 'testing'>>({});
  const { toast, showToast } = useToast();
  const settingsStore = useSettingsStore();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await getAdminSettings());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  function update(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateAdminSettings(settings);
      showToast('success', 'Configurações salvas com sucesso.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  const providerTab = PROVIDER_TABS.find((p) => p.id === activeProvider)!;
  const enabledModelsKey = `${activeProvider}_enabled_models`;
  const enabledModels: string[] = (() => {
    try {
      const raw = settings[enabledModelsKey];
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string') return JSON.parse(raw);
    } catch { /* ignore */ }
    return [];
  })();

  function toggleModel(modelId: string) {
    const next = enabledModels.includes(modelId)
      ? enabledModels.filter((m) => m !== modelId)
      : [...enabledModels, modelId];
    update(enabledModelsKey, JSON.stringify(next));
  }

  function addManualModel() {
    const trimmed = manualModel.trim();
    if (!trimmed) return;
    if (!enabledModels.includes(trimmed)) {
      update(enabledModelsKey, JSON.stringify([...enabledModels, trimmed]));
    }
    setManualModel('');
  }

  async function handleTestModels() {
    const models = enabledModels.length > 0 ? enabledModels : providerTab.models.map((m) => m.id);
    if (models.length === 0) { showToast('error', 'Nenhum modelo para testar.'); return; }
    const results: Record<string, 'ok' | 'fail' | 'testing'> = {};
    for (const m of models) results[m] = 'testing';
    setTestResults({ ...results });

    for (const model of models) {
      try {
        const res = await fetch('/api/llm/complete', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${(() => { try { const raw = localStorage.getItem('mindmap-auth'); if (raw) { return JSON.parse(raw)?.state?.token ?? ''; } } catch {} return ''; })()}` },
          body: JSON.stringify({ provider: activeProvider, model, messages: [{ role: 'user', content: 'Diga "ok" em uma palavra.' }], maxTokens: 10 }),
        });
        results[model] = res.ok ? 'ok' : 'fail';
      } catch {
        results[model] = 'fail';
      }
      setTestResults({ ...results });
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  if (error) return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <XCircle className="w-10 h-10 text-red-400" />
      <p className="text-slate-600">{error}</p>
      <Button variant="outline" onClick={loadSettings}>Tentar novamente</Button>
    </div>
  );

  const s = (key: string) => String(settings[key] ?? '');
  const allModels = [...providerTab.models.map((m) => m.id), ...enabledModels.filter((m) => !providerTab.models.some((pm) => pm.id === m))];
  const uniqueModels = Array.from(new Set(allModels));

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Provedor LLM</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSecrets(!showSecrets)}>
            {showSecrets ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
            {showSecrets ? 'Ocultar chaves' : 'Mostrar chaves'}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </div>

      <p className="text-sm text-slate-600 max-w-2xl">
        Com mais de uma chave configurada, o <strong>RouteLLM</strong> direciona tarefas leves (sugestões, clarificação) para modelos mais baratos e usa seu provedor padrão para geração de mapas e chat.
      </p>

      {/* Provider tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-0">
        {PROVIDER_TABS.map((p) => (
          <button
            key={p.id}
            onClick={() => setActiveProvider(p.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
              activeProvider === p.id
                ? 'bg-white border-slate-200 text-indigo-600'
                : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Models checkboxes */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-1">Modelos habilitados para roteamento ({activeProvider})</h3>
        <p className="text-xs text-slate-500 mb-4">O RouteLLM usará apenas os modelos marcados aqui para geração, chat e pesquisas.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {uniqueModels.map((modelId) => {
            const meta = providerTab.models.find((m) => m.id === modelId);
            const isEnabled = enabledModels.includes(modelId);
            const result = testResults[modelId];
            return (
              <label key={modelId} className="flex items-start gap-2 cursor-pointer p-2 rounded-lg border border-slate-100 hover:bg-slate-50">
                <input type="checkbox" checked={isEnabled} onChange={() => toggleModel(modelId)} className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{meta?.name ?? modelId}</span>
                    {result === 'ok' && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                    {result === 'fail' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                    {result === 'testing' && <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />}
                  </div>
                  <span className="text-xs text-slate-400 font-mono">{modelId}</span>
                </div>
              </label>
            );
          })}
        </div>

        {/* Manual model input */}
        <div className="flex items-center gap-2 mb-4">
          <Input
            placeholder={`Adicionar modelo manual (ex.: ${providerTab.models[0]?.id ?? 'model-id'})`}
            value={manualModel}
            onChange={(e) => setManualModel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addManualModel())}
            className="flex-1"
          />
          <Button variant="outline" size="sm" onClick={addManualModel}>Adicionar</Button>
        </div>

        {/* Test button */}
        <Button variant="outline" size="sm" onClick={handleTestModels}>
          Testar modelos ativos
        </Button>
      </div>

      {/* API key for current provider */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Chave API {providerTab.label}</h3>
        <Input
          type={showSecrets ? 'text' : 'password'}
          placeholder={providerTab.placeholder}
          value={s(providerTab.keyField)}
          onChange={(e) => update(providerTab.keyField, e.target.value)}
        />
        <a href={providerTab.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline mt-1 inline-block">Obtenha sua chave em {providerTab.label}</a>
      </div>

      {/* Default model selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Modelo</h3>
        <select
          value={s('llm_default_model') || providerTab.models[0]?.id || ''}
          onChange={(e) => { update('llm_default_model', e.target.value); update('llm_default_provider', activeProvider); }}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          {providerTab.models.map((m) => (
            <option key={m.id} value={m.id}>{m.name} — {m.description}</option>
          ))}
          {enabledModels.filter((m) => !providerTab.models.some((pm) => pm.id === m)).map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* Replicate */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-semibold text-slate-700">Replicate (imagens ilustrativas)</h3>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">Chave API Replicate</label>
          <Input
            type={showSecrets ? 'text' : 'password'}
            placeholder="r8_..."
            value={s('replicate_api_key')}
            onChange={(e) => update('replicate_api_key', e.target.value)}
          />
          <a href="https://replicate.com/account/api-tokens" target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">replicate.com/account/api-tokens</a>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// API Tokens tab — admin gera tokens para usuários
// ---------------------------------------------------------------------------

const SCOPES_OPTIONS = [
  { id: 'maps:read', label: 'Ler mapas' },
  { id: 'maps:write', label: 'Criar/editar mapas' },
  { id: 'llm:complete', label: 'Completions LLM' },
  { id: 'image:generate', label: 'Gerar imagens' },
  { id: 'usage:read', label: 'Consultar uso' },
];

function ApiTokensTab() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [filterUsername, setFilterUsername] = useState('');
  const [newToken, setNewToken] = useState<{ token: string; username: string; name: string } | null>(null);
  const { toast, showToast } = useToast();

  const loadTokens = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAdminTokens(filterUsername || undefined);
      setTokens(res.tokens);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar tokens');
    } finally {
      setLoading(false);
    }
  }, [filterUsername]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await listAdminUsers({ limit: 500 });
      setUsers(res.users);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => { void loadTokens(); }, [loadTokens]);
  useEffect(() => { void loadUsers(); }, [loadUsers]);

  async function handleRevoke(id: string) {
    try {
      await revokeAdminToken(id);
      showToast('success', 'Token revogado.');
      void loadTokens();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Erro ao revogar');
    }
  }

  const activeTokens = tokens.filter((t) => t.isActive);

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-lg font-semibold text-slate-900">Tokens de API</h2>
        <div className="flex items-center gap-2">
          <select
            value={filterUsername}
            onChange={(e) => setFilterUsername(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todos os usuários</option>
            {users.map((u) => (
              <option key={u.username} value={u.username}>{u.username}</option>
            ))}
          </select>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Key className="w-4 h-4 mr-2" />
            Gerar token
          </Button>
        </div>
      </div>

      <p className="text-sm text-slate-600 max-w-2xl">
        Tokens permitem integrações externas acessarem a API do 3Maps. O admin gera tokens para usuários específicos.
        Documentação em <a href="/api/docs" target="_blank" rel="noopener noreferrer" className="text-primary underline">/api/docs</a>.
      </p>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <XCircle className="w-10 h-10 text-red-400" />
          <p className="text-slate-600">{error}</p>
          <Button variant="outline" onClick={loadTokens}>Tentar novamente</Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Usuário</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Nome</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Prefix</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Scopes</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Último uso</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Criado em</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {activeTokens.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Nenhum token ativo. Gere um token para permitir acesso à API.
                  </td>
                </tr>
              ) : (
                activeTokens.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{t.username}</td>
                    <td className="px-4 py-2.5 text-slate-600">{t.name || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{t.tokenPrefix}…</td>
                    <td className="px-4 py-2.5 text-slate-600">{t.scopes.join(', ')}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">
                      {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">
                      {new Date(t.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleRevoke(t.id)}>
                        Revogar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <CreateTokenDialog
          users={users}
          onClose={() => { setCreateOpen(false); setNewToken(null); }}
          onCreate={async (data) => {
            const res = await createAdminToken(data);
            setNewToken({ token: res.token, username: res.username, name: res.name || '' });
            showToast('success', 'Token criado. Copie e guarde — não será exibido novamente.');
            void loadTokens();
          }}
          newToken={newToken}
        />
      )}
    </div>
  );
}

function CreateTokenDialog({
  users,
  onClose,
  onCreate,
  newToken,
}: {
  users: AdminUser[];
  onClose: () => void;
  onCreate: (data: { username: string; name?: string; scopes: string[]; expiresInDays?: number }) => Promise<void>;
  newToken: { token: string; username: string; name: string } | null;
}) {
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['maps:read', 'maps:write', 'llm:complete', 'usage:read']);
  const [expiresInDays, setExpiresInDays] = useState<number | ''>(30);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleScope(id: string) {
    setScopes((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim()) {
      setError('Selecione o usuário.');
      return;
    }
    setSaving(true);
    try {
      await onCreate({
        username: username.trim(),
        name: name.trim() || undefined,
        scopes,
        expiresInDays: expiresInDays === '' ? undefined : Number(expiresInDays),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar token');
    } finally {
      setSaving(false);
    }
  }

  if (newToken) {
    return (
      <Dialog open onOpenChange={() => onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Token criado</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Guarde este token agora. Ele não será exibido novamente.
          </p>
          <div className="flex items-center gap-2">
            <Input readOnly value={newToken.token} className="font-mono text-sm" />
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(newToken.token)}>
              Copiar
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={onClose}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar token de API</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Usuário</label>
            <select
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Selecione…</option>
              {users.map((u) => (
                <option key={u.username} value={u.username}>{u.username}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Nome (opcional)</label>
            <Input placeholder="Ex: Integração CRM" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Scopes</label>
            <div className="flex flex-wrap gap-2">
              {SCOPES_OPTIONS.map((s) => (
                <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={scopes.includes(s.id)} onChange={() => toggleScope(s.id)} />
                  <span className="text-sm text-slate-600">{s.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Expira em (dias, opcional)</label>
            <Input
              type="number"
              min={1}
              placeholder="Ex: 30 (vazio = sem expiração)"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Gerar token
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Payments tab
// ---------------------------------------------------------------------------

function PaymentsTab() {
  const [settings, setSettings] = useState<AdminSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);
  const { toast, showToast } = useToast();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await getAdminSettings());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  function update(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateAdminSettings(settings);
      showToast('success', 'Configurações salvas com sucesso.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  if (error) return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <XCircle className="w-10 h-10 text-red-400" />
      <p className="text-slate-600">{error}</p>
      <Button variant="outline" onClick={loadSettings}>Tentar novamente</Button>
    </div>
  );

  const s = (key: string) => String(settings[key] ?? '');

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Configurações de Pagamento</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSecrets(!showSecrets)}>
            {showSecrets ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
            {showSecrets ? 'Ocultar chaves' : 'Mostrar chaves'}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* Stripe Keys */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-semibold text-slate-700">Chaves Stripe</h3>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Chave Publicável (Publishable Key)</label>
            <Input
              type={showSecrets ? 'text' : 'password'}
              placeholder="pk_live_... ou pk_test_..."
              value={s('stripe_publishable_key')}
              onChange={(e) => update('stripe_publishable_key', e.target.value)}
            />
            <p className="text-xs text-slate-400">Começa com pk_live_ (produção) ou pk_test_ (teste)</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Chave Secreta (Secret Key)</label>
            <Input
              type={showSecrets ? 'text' : 'password'}
              placeholder="sk_live_... ou sk_test_..."
              value={s('stripe_secret_key')}
              onChange={(e) => update('stripe_secret_key', e.target.value)}
            />
            <p className="text-xs text-slate-400">Começa com sk_live_ (produção) ou sk_test_ (teste). Nunca exponha no frontend.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Webhook Secret</label>
            <Input
              type={showSecrets ? 'text' : 'password'}
              placeholder="whsec_..."
              value={s('stripe_webhook_secret')}
              onChange={(e) => update('stripe_webhook_secret', e.target.value)}
            />
            <p className="text-xs text-slate-400">Encontrado no painel Stripe → Webhooks</p>
          </div>
        </div>
      </div>

      {/* Price IDs */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-semibold text-slate-700">IDs de Preço Stripe</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { key: 'stripe_price_free', label: 'Plano Gratuito', placeholder: 'price_...' },
            { key: 'stripe_price_premium', label: 'Plano Premium', placeholder: 'price_...' },
            { key: 'stripe_price_enterprise', label: 'Plano Enterprise', placeholder: 'price_...' },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">{label}</label>
              <Input placeholder={placeholder} value={s(key)} onChange={(e) => update(key, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      {/* Plan descriptions and prices */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Descrições e Preços dos Planos</h3>
        <div className="grid grid-cols-1 gap-6">
          {[
            { prefix: 'plan_free', label: 'Plano Gratuito', color: 'bg-slate-100' },
            { prefix: 'plan_premium', label: 'Plano Premium', color: 'bg-amber-50' },
            { prefix: 'plan_enterprise', label: 'Plano Enterprise', color: 'bg-blue-50' },
          ].map(({ prefix, label, color }) => (
            <div key={prefix} className={`rounded-lg p-4 ${color}`}>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">{label}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">Nome</label>
                  <Input placeholder="Ex: Premium" value={s(`${prefix}_name`)} onChange={(e) => update(`${prefix}_name`, e.target.value)} className="bg-white" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">Preço (ex: R$ 19,90/mês)</label>
                  <Input placeholder="R$ 0,00/mês" value={s(`${prefix}_price`)} onChange={(e) => update(`${prefix}_price`, e.target.value)} className="bg-white" />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-1">
                  <label className="text-xs font-medium text-slate-600">Descrição</label>
                  <Input placeholder="Descrição do plano..." value={s(`${prefix}_description`)} onChange={(e) => update(`${prefix}_description`, e.target.value)} className="bg-white" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* App settings */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Configurações do App</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Nome do App</label>
            <Input placeholder="3Maps" value={s('app_name')} onChange={(e) => update('app_name', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">URL do App</label>
            <Input placeholder="https://seudominio.com" value={s('app_url')} onChange={(e) => update('app_url', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">E-mail de Suporte</label>
            <Input type="email" placeholder="suporte@seudominio.com" value={s('support_email')} onChange={(e) => update('support_email', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notifications tab
// ---------------------------------------------------------------------------

function NotificationsTab() {
  const [data, setData] = useState<{ notifications: AdminNotification[]; total: number; unreadCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { toast, showToast } = useToast();

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listAdminNotifications({ limit: 100, unreadOnly }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar notificações');
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => { void loadNotifications(); }, [loadNotifications]);

  async function handleMarkAllRead() {
    try {
      await markNotificationsRead('all');
      showToast('success', 'Todas as notificações marcadas como lidas.');
      void loadNotifications();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Erro');
    }
  }

  async function handleMarkRead(id: number) {
    try {
      await markNotificationsRead([id]);
      void loadNotifications();
    } catch {
      // ignore
    }
  }

  const typeConfig = {
    warning: { color: 'border-l-amber-400 bg-amber-50', icon: AlertTriangle, iconColor: 'text-amber-500', badge: 'bg-amber-100 text-amber-700' },
    error: { color: 'border-l-red-400 bg-red-50', icon: XCircle, iconColor: 'text-red-500', badge: 'bg-red-100 text-red-700' },
    info: { color: 'border-l-blue-400 bg-blue-50', icon: Info, iconColor: 'text-blue-500', badge: 'bg-blue-100 text-blue-700' },
  };

  return (
    <div className="flex flex-col gap-4">
      <Toast toast={toast} />

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Notificações</h2>
          {(data?.unreadCount ?? 0) > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">
              {data?.unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
            Apenas não lidas
          </label>
          {(data?.unreadCount ?? 0) > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
              <CheckCircle className="w-4 h-4 mr-2" />
              Marcar todas como lidas
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={loadNotifications}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <XCircle className="w-10 h-10 text-red-400" />
          <p className="text-slate-600">{error}</p>
          <Button variant="outline" onClick={loadNotifications}>Tentar novamente</Button>
        </div>
      ) : data?.notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Bell className="w-10 h-10 text-slate-300" />
          <p className="text-slate-500 font-medium">Nenhuma notificação</p>
          <p className="text-sm text-slate-400">O sistema irá alertar sobre atividades suspeitas ou uso excessivo.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data?.notifications.map((notif) => {
            const cfg = typeConfig[notif.type] ?? typeConfig.info;
            const Icon = cfg.icon;
            return (
              <div
                key={notif.id}
                className={`border-l-4 rounded-r-xl p-4 ${cfg.color} ${notif.read ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${cfg.iconColor}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-sm font-semibold text-slate-900">{notif.title}</p>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${cfg.badge}`}>
                          {notif.type === 'warning' ? 'Aviso' : notif.type === 'error' ? 'Erro' : 'Info'}
                        </span>
                        {notif.username && (
                          <span className="text-xs text-slate-500 bg-white/60 px-1.5 py-0.5 rounded">
                            @{notif.username}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600">{notif.message}</p>
                      <p className="text-xs text-slate-400 mt-1">{new Date(notif.createdAt).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                  {!notif.read && (
                    <Button variant="ghost" size="sm" className="shrink-0 h-7 text-xs" onClick={() => handleMarkRead(notif.id)}>
                      Marcar lida
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main AdminPage
// ---------------------------------------------------------------------------

export function AdminPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [activeTab, setActiveTab] = useState<Tab>('stats');
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/auth'); return; }
    const authUser = user as (typeof user & { isAdmin?: boolean }) | null;
    if (authUser && !authUser.isAdmin) navigate('/');
  }, [isAuthenticated, user, navigate]);

  // Poll unread notification count
  useEffect(() => {
    async function fetchUnread() {
      try {
        const data = await listAdminNotifications({ limit: 1 });
        setUnreadCount(data.unreadCount);
      } catch { /* ignore */ }
    }
    void fetchUnread();
    const interval = setInterval(fetchUnread, 30_000);
    return () => clearInterval(interval);
  }, []);

  const authUser = user as (typeof user & { isAdmin?: boolean }) | null;
  if (!isAuthenticated || !authUser?.isAdmin) return null;

  const tabs = [
    { id: 'stats' as Tab, label: 'Estatísticas', icon: BarChart3 },
    { id: 'users' as Tab, label: 'Usuários', icon: Users },
    { id: 'logs' as Tab, label: 'Logs', icon: Activity },
    { id: 'payments' as Tab, label: 'Pagamentos', icon: CreditCard },
    { id: 'notifications' as Tab, label: 'Notificações', icon: Bell, badge: unreadCount },
    { id: 'llm' as Tab, label: 'LLMs / APIs', icon: SlidersHorizontal },
    { id: 'api-tokens' as Tab, label: 'API Tokens', icon: Key },
  ];

  return (
    <div className="h-full bg-slate-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors text-sm"
            >
              <ChevronLeft className="w-4 h-4" />
              Voltar ao app
            </button>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-violet-600" />
              <h1 className="text-lg font-semibold text-slate-900">Painel Administrativo</h1>
            </div>
          </div>
          <Badge variant="secondary" className="bg-violet-100 text-violet-700 border-0">
            Admin: {user?.username}
          </Badge>
        </div>
      </header>

      {/* Navigation tabs */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex flex-wrap gap-1">
            {tabs.map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors relative ${
                  activeTab === id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
                {badge != null && badge > 0 && (
                  <span className="absolute -top-0.5 right-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {activeTab === 'stats' && <StatsTab />}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'logs' && <LogsTab />}
          {activeTab === 'payments' && <PaymentsTab />}
          {activeTab === 'notifications' && <NotificationsTab />}
          {activeTab === 'llm' && <LLMApiTab />}
          {activeTab === 'api-tokens' && <ApiTokensTab />}
        </div>
      </main>
    </div>
  );
}
