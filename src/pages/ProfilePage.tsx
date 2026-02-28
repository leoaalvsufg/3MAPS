import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, User, Crown, LogOut, Coins, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { useUsageStore } from '@/stores/usage-store';
import { useNavigate } from 'react-router-dom';
import { listMyCreditLedger } from '@/services/api/usageApi';
import { createCreditsCheckoutSession } from '@/services/api/billingApi';

export function ProfilePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, logout } = useAuthStore();
  const token = useAuthStore((s) => s.token ?? '');
  const planLimits = useUsageStore((s) => s.limits);
  const extraCredits = useUsageStore((s) => s.extraCredits);
  const fetchUsage = useUsageStore((s) => s.fetchUsage);
  const [creditsCheckoutLoading, setCreditsCheckoutLoading] = useState(false);
  const [creditsCheckoutError, setCreditsCheckoutError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<Array<{
    id: number;
    delta: number;
    balanceBefore: number;
    balanceAfter: number;
    reason: string | null;
    createdBy: string | null;
    createdAt: string;
  }>>([]);
  const planId = planLimits?.id ?? 'free';

  useEffect(() => {
    void fetchUsage();
  }, [fetchUsage]);

  useEffect(() => {
    if (!token) return;
    listMyCreditLedger(token, { limit: 20, offset: 0 })
      .then((r) => setLedger(r.entries))
      .catch(() => setLedger([]));
  }, [token]);

  const creditsSuccess = searchParams.get('credits') === 'success';
  const creditsCancelled = searchParams.get('credits') === 'cancelled';
  useEffect(() => {
    if (creditsSuccess || creditsCancelled) {
      void fetchUsage();
      setSearchParams({}, { replace: true });
    }
  }, [creditsSuccess, creditsCancelled, fetchUsage, setSearchParams]);

  async function handleBuyCredits() {
    if (!token) return;
    setCreditsCheckoutError(null);
    setCreditsCheckoutLoading(true);
    try {
      const { url } = await createCreditsCheckoutSession(token);
      window.location.href = url;
    } catch (err) {
      setCreditsCheckoutError(err instanceof Error ? err.message : 'Erro ao iniciar pagamento');
      setCreditsCheckoutLoading(false);
    }
  }

  const planLabels: Record<string, string> = {
    free: 'Gratuito',
    premium: 'Premium',
    enterprise: 'Enterprise',
    admin: 'Admin',
  };
  const planName = planLabels[planId] ?? 'Gratuito';

  function handleLogout() {
    logout();
    navigate('/');
  }

  if (!user) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-6 py-8">
          <p className="text-muted-foreground">Faça login para ver seu perfil.</p>
          <Button asChild className="mt-4">
            <Link to="/auth">Entrar</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-6 py-8 flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Voltar">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <User className="h-6 w-6 text-primary" />
              Meu Perfil
            </h1>
            <p className="text-muted-foreground text-sm">
              Informações da sua conta
            </p>
          </div>
        </div>

        {/* Profile card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <div className="shrink-0">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.username}
                  className="w-24 h-24 rounded-full object-cover ring-2 ring-border"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-border">
                  <User className="h-12 w-12 text-primary" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{user.username}</h2>
                <div className="flex items-center justify-center sm:justify-start gap-2 mt-1">
                  <Crown className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-muted-foreground capitalize">
                    Plano {planName}
                  </span>
                </div>
                <div className="mt-2 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                  Créditos extras disponíveis: <span className="ml-1 font-semibold text-slate-900">{extraCredits}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleBuyCredits}
                    disabled={creditsCheckoutLoading}
                  >
                    {creditsCheckoutLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Coins className="h-4 w-4" />
                    )}
                    Comprar 5 créditos extras
                  </Button>
                  {creditsCheckoutError && (
                    <span className="text-xs text-red-600">{creditsCheckoutError}</span>
                  )}
                </div>
              </div>

              {user.isAdmin && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-medium">
                  Admin
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 pt-6 border-t border-border flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              className="w-full sm:w-auto gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Sair da conta
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Extrato de créditos</h3>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lançamento registrado ainda.</p>
          ) : (
            <div className="space-y-2">
              {ledger.slice(0, 12).map((entry) => (
                <div key={entry.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className={entry.delta >= 0 ? 'text-emerald-600 font-semibold' : 'text-amber-700 font-semibold'}>
                    {entry.delta >= 0 ? `+${entry.delta}` : entry.delta}
                  </span>
                  <span className="text-slate-500 truncate flex-1" title={entry.reason ?? ''}>
                    {entry.reason ?? 'Ajuste de créditos'}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(entry.createdAt).toLocaleString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          A foto é exibida quando você faz login com Google ou outro provedor social.
        </p>
      </div>
    </div>
  );
}
