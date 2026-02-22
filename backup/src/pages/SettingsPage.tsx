import { useState, useEffect } from 'react';
import { Settings, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useSettingsStore } from '@/stores/settings-store';
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
  const settings = useSettingsStore();
  const hasKey = settings.hasApiKey();

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

        {/* Server persistence */}
        <section className="flex flex-col gap-4">
          <h2 className="text-base font-semibold border-b border-border pb-2">Persistência no servidor</h2>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Usuário</label>
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
        </section>
      </div>
    </div>
  );
}
