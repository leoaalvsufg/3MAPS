import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Eye, EyeOff, CheckCircle2, AlertCircle, User, LogOut, LogIn, Lock, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/stores/settings-store';
import { useAuthStore } from '@/stores/auth-store';
import { useUsageStore } from '@/stores/usage-store';
import { OPENROUTER_MODELS, OPENAI_MODELS } from '@/lib/constants';
import { decryptValue } from '@/lib/crypto';

function ApiKeyInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void | Promise<void>;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">{label}</label>
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10 font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const settings = useSettingsStore();
  const hasKey = settings.hasApiKey();
  const { isAuthenticated, user, logout } = useAuthStore();
  const planLimits = useUsageStore((s) => s.limits);
  const canConfigureApiKeys = planLimits?.canConfigureApiKeys === true;

  function handleLogout() {
    logout();
    navigate('/');
  }

  // Non-enterprise users see a restricted view
  if (!canConfigureApiKeys) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-6 py-8 flex flex-col gap-8">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Settings className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Configurações</h1>
          </div>

          {/* Enterprise-only notice */}
          <div className="flex flex-col items-center gap-6 py-12 text-center">
            <div className="w-20 h-20 rounded-2xl bg-violet-50 flex items-center justify-center">
              <Building2 className="h-10 w-10 text-violet-500" />
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-bold text-foreground">Configurações Enterprise</h2>
              <p className="text-muted-foreground max-w-md">
                A configuração de chaves de API próprias está disponível exclusivamente para clientes do plano <strong>Enterprise</strong>.
              </p>
              <p className="text-sm text-muted-foreground max-w-md mt-1">
                No plano Enterprise, você utiliza suas próprias chaves de API (OpenRouter, OpenAI, Replicate) e tem acesso a todas as funcionalidades do sistema com suporte dedicado.
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full max-w-sm">
              <div className="flex items-center gap-3 p-4 rounded-xl border border-violet-200 bg-violet-50/50">
                <Lock className="h-5 w-5 text-violet-500 shrink-0" />
                <div className="text-left">
                  <div className="text-sm font-semibold text-violet-900">Plano Enterprise</div>
                  <div className="text-xs text-violet-700">Valor negociado · Suporte dedicado · API própria</div>
                </div>
              </div>
              <a
                href="mailto:contato@3maps.com"
                className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
              >
                <Building2 className="h-4 w-4" />
                Entrar em contato
              </a>
            </div>
          </div>

          {/* Account section — always visible */}
          <section className="flex flex-col gap-4">
            <h2 className="text-base font-semibold border-b border-border pb-2">Conta</h2>
            {isAuthenticated && user ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                  <div className="flex items-center justify-center w-9 h-9 rounded-full bg-indigo-100 shrink-0">
                    <User className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">{user.username}</span>
                    <span className="text-xs text-muted-foreground capitalize">
                      Plano: {planLimits?.name ?? 'Gratuito'}
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Sair da conta
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => navigate('/auth')}
                >
                  <LogIn className="h-4 w-4" />
                  Entrar / Criar conta
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  // Decrypted display values – kept in local state so the inputs show plain text
  const [openrouterDisplay, setOpenrouterDisplay] = useState('');
  const [openaiDisplay, setOpenaiDisplay] = useState('');
  const [replicateDisplay, setReplicateDisplay] = useState('');

  // Decrypt stored (possibly encrypted) values for display on mount / when stored value changes
  useEffect(() => {
    decryptValue(settings.openrouterApiKey).then(setOpenrouterDisplay);
  }, [settings.openrouterApiKey]);

  useEffect(() => {
    decryptValue(settings.openaiApiKey).then(setOpenaiDisplay);
  }, [settings.openaiApiKey]);

  useEffect(() => {
    decryptValue(settings.replicateApiKey).then(setReplicateDisplay);
  }, [settings.replicateApiKey]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-6 py-8 flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Configurações</h1>
        </div>

        {/* Status */}
        <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
          hasKey
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          {hasKey
            ? <><CheckCircle2 className="h-4 w-4" /> API configurada e pronta para uso.</>
            : <><AlertCircle className="h-4 w-4" /> Configure uma chave de API para começar a gerar mapas.</>
          }
        </div>

        {/* LLM Provider */}
        <section className="flex flex-col gap-4">
          <h2 className="text-base font-semibold border-b border-border pb-2">Provedor LLM</h2>

          <div className="flex gap-3">
            {(['openrouter', 'openai'] as const).map((p) => (
              <button
                key={p}
                onClick={() => settings.setProvider(p)}
                className={`flex-1 py-2.5 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                  settings.provider === p
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:border-foreground/30'
                }`}
              >
                {p === 'openrouter' ? 'OpenRouter' : 'OpenAI'}
              </button>
            ))}
          </div>

          {settings.provider === 'openrouter' ? (
            <>
              <ApiKeyInput
                label="Chave API OpenRouter"
                value={openrouterDisplay}
                onChange={settings.setOpenrouterApiKey}
                placeholder="sk-or-v1-..."
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Modelo</label>
                <select
                  value={settings.selectedModel}
                  onChange={(e) => settings.setSelectedModel(e.target.value)}
                  className="h-9 px-3 rounded-md border border-input bg-background text-sm"
                >
                  {OPENROUTER_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} — {m.description}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Obtenha sua chave em{' '}
                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  openrouter.ai/keys
                </a>
              </p>
            </>
          ) : (
            <>
              <ApiKeyInput
                label="Chave API OpenAI"
                value={openaiDisplay}
                onChange={settings.setOpenaiApiKey}
                placeholder="sk-..."
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Modelo</label>
                <select
                  value={settings.selectedModel}
                  onChange={(e) => settings.setSelectedModel(e.target.value)}
                  className="h-9 px-3 rounded-md border border-input bg-background text-sm"
                >
                  {OPENAI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} — {m.description}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </section>

        {/* Replicate */}
        <section className="flex flex-col gap-4">
          <h2 className="text-base font-semibold border-b border-border pb-2">
            Geração de Imagens (Opcional)
          </h2>
          <ApiKeyInput
            label="Chave API Replicate"
            value={replicateDisplay}
            onChange={settings.setReplicateApiKey}
            placeholder="r8_..."
          />
          <p className="text-xs text-muted-foreground">
            Necessário para gerar imagens ilustrativas. Obtenha em{' '}
            <a href="https://replicate.com/account/api-tokens" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              replicate.com
            </a>
          </p>
        </section>

        {/* Server persistence / account */}
        <section className="flex flex-col gap-4">
          <h2 className="text-base font-semibold border-b border-border pb-2">Conta e Persistência</h2>
          {isAuthenticated && user ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-indigo-100 shrink-0">
                  <User className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-medium truncate">{user.username}</span>
                  <span className="text-xs text-muted-foreground">
                    Mapas sincronizados automaticamente com o servidor.
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Sair da conta
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Usuário (sem autenticação)</label>
                <Input
                  value={settings.username}
                  onChange={(e) => settings.setUsername(e.target.value)}
                  placeholder="ex.: maria"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Os mapas serão salvos em <code className="font-mono">{'DATA_DIR/users/<usuário>/maps'}</code> no servidor.
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => navigate('/auth')}
              >
                <LogIn className="h-4 w-4" />
                Entrar / Criar conta
              </Button>
              <p className="text-xs text-muted-foreground">
                Para sincronização segura entre dispositivos, faça login.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
