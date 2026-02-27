import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Crown, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { useUsageStore } from '@/stores/usage-store';
import { PLANS } from '@/lib/plans';

const PLAN_NAMES: Record<string, string> = {
  premium: 'Premium',
  enterprise: 'Enterprise',
};

export function BillingSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { checkAuth, isAuthenticated } = useAuthStore();
  const fetchUsage = useUsageStore((s) => s.fetchUsage);
  const planParam = (searchParams.get('plan') ?? 'premium').toLowerCase();
  const planName = PLAN_NAMES[planParam] ?? PLANS.premium?.name ?? 'Premium';

  useEffect(() => {
    if (!isAuthenticated) return;
    const refresh = () => {
      void checkAuth().then(() => fetchUsage());
    };
    refresh();
    const t1 = setTimeout(refresh, 2000);
    const t2 = setTimeout(refresh, 5000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isAuthenticated, checkAuth, fetchUsage]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-emerald-50 via-white to-amber-50/30 px-4">
      <div className="max-w-md w-full flex flex-col items-center text-center gap-8 py-12">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center animate-in zoom-in duration-500">
            <CheckCircle2 className="w-14 h-14 text-emerald-600" />
          </div>
          <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-amber-900" />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold text-foreground">
            Obrigado pela compra!
          </h1>
          <p className="text-lg text-muted-foreground">
            Parabéns! Agora você faz parte do plano <strong className="text-foreground">{planName}</strong>.
          </p>
        </div>

        <div className="flex flex-col gap-4 p-6 rounded-2xl border border-amber-200 bg-amber-50/80 w-full">
          <div className="flex items-center justify-center gap-2 text-amber-800">
            <Crown className="w-5 h-5" />
            <span className="font-semibold">Benefícios do plano {planName}</span>
          </div>
          <ul className="text-sm text-amber-900/90 text-left space-y-2">
            <li>✓ Mapas ilimitados por mês</li>
            <li>✓ Todos os templates disponíveis</li>
            <li>✓ Exportação em PNG, SVG, PDF e Markdown</li>
            <li>✓ Geração de imagens ilustrativas</li>
            <li>✓ Chat ilimitado nos mapas</li>
            {planParam === 'enterprise' && (
              <li>✓ Configuração de chaves de API próprias</li>
            )}
          </ul>
        </div>

        <Button
          size="lg"
          className="gap-2 w-full max-w-xs bg-emerald-600 hover:bg-emerald-700"
          onClick={() => navigate('/')}
        >
          <ArrowRight className="w-4 h-4" />
          Continuar para o app
        </Button>
      </div>
    </div>
  );
}
