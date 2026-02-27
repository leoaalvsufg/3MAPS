import { useState } from 'react';
import { Crown, Check, X, Lock, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/stores/auth-store';
import { createCheckoutSession } from '@/services/api/billingApi';

// ---------------------------------------------------------------------------
// UpgradePrompt — shown when a user hits a plan limit
// ---------------------------------------------------------------------------

interface UpgradePromptProps {
  /** The feature that triggered the upgrade prompt (for display purposes) */
  feature?: string;
  /** Custom message to show instead of the default */
  message?: string;
  onClose: () => void;
}

const FREE_FEATURES = [
  '5 mapas por mês',
  '3 templates disponíveis',
  'Exportação apenas em PNG',
  'Chat limitado (5 msgs/mapa)',
  'Até 5 mapas armazenados',
];

const PREMIUM_FEATURES = [
  'Mapas ilimitados por mês',
  'Todos os templates disponíveis',
  'Exportação em PNG, SVG, PDF e Markdown',
  'Chat ilimitado em todos os mapas',
  'Armazenamento ilimitado de mapas',
  'Geração de imagens ilustrativas',
];

export function UpgradePrompt({ feature, message, onClose }: UpgradePromptProps) {
  const token = useAuthStore((s) => s.token);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const handleUpgrade = async () => {
    if (!token) {
      setCheckoutError('Faça login para iniciar o pagamento.');
      return;
    }

    setCheckoutError(null);
    setSubmitting(true);
    try {
      const { url } = await createCheckoutSession(token, 'premium');
      window.location.href = url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Não foi possível iniciar o checkout.');
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Lock className="h-5 w-5 text-amber-500" />
            Limite do Plano Gratuito
          </DialogTitle>
        </DialogHeader>

        {message && (
          <p className="text-sm text-muted-foreground -mt-1 mb-1">{message}</p>
        )}

        {!message && feature && (
          <p className="text-sm text-muted-foreground -mt-1 mb-1">
            O recurso <strong>{feature}</strong> não está disponível no plano gratuito.
          </p>
        )}

        {/* Comparison table */}
        <div className="grid grid-cols-2 gap-3 mt-2">
          {/* Free column */}
          <div className="rounded-xl border border-border p-4 bg-muted/30">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="secondary" className="text-xs">Gratuito</Badge>
            </div>
            <ul className="space-y-2">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <X className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Premium column */}
          <div className="rounded-xl border-2 border-amber-400 p-4 bg-amber-50/50 relative">
            <div className="flex items-center gap-2 mb-3">
              <Badge className="text-xs bg-amber-500 hover:bg-amber-500 text-white gap-1">
                <Crown className="h-3 w-3" />
                Premium
              </Badge>
            </div>
            <ul className="space-y-2">
              {PREMIUM_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-foreground">
                  <Check className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Upgrade action */}
        <div className="mt-4 space-y-2">
          <Button
            className="w-full bg-amber-500 hover:bg-amber-600 text-white gap-2"
            onClick={handleUpgrade}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Crown className="h-4 w-4" />
            )}
            {submitting ? 'Redirecionando para Stripe...' : 'Fazer Upgrade'}
          </Button>
          {checkoutError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 text-center">
              {checkoutError}
            </div>
          )}
          <Button variant="outline" className="w-full" onClick={onClose}>
            Continuar no Plano Gratuito
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
