import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { forgotPassword, resetPassword } from '@/services/api/authApi';

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

function LoginForm({ onForgotPassword }: { onForgotPassword: () => void }) {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError('Informe o nome de usuário.');
      return;
    }
    if (!password) {
      setError('Informe a senha.');
      return;
    }

    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-username" className="text-sm font-medium text-slate-700">
          Nome de usuário
        </label>
        <Input
          id="login-username"
          type="text"
          autoComplete="username"
          placeholder="seu_usuario"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="login-password" className="text-sm font-medium text-slate-700">
            Senha
          </label>
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
          >
            Esqueci minha senha
          </button>
        </div>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Register form
// ---------------------------------------------------------------------------

function RegisterForm() {
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError('Informe o nome de usuário.');
      return;
    }
    if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username.trim())) {
      setError('O nome de usuário deve ter 3–30 caracteres (letras, números, hífens ou underscores).');
      return;
    }
    if (!password) {
      setError('Informe a senha.');
      return;
    }
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      await register(username.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="reg-username" className="text-sm font-medium text-slate-700">
          Nome de usuário
        </label>
        <Input
          id="reg-username"
          type="text"
          autoComplete="username"
          placeholder="seu_usuario"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
        />
        <p className="text-xs text-slate-400">3–30 caracteres: letras, números, hífens ou underscores.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="reg-password" className="text-sm font-medium text-slate-700">
          Senha
        </label>
        <Input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
        />
        <p className="text-xs text-slate-400">Mínimo de 6 caracteres.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="reg-confirm" className="text-sm font-medium text-slate-700">
          Confirmar senha
        </label>
        <Input
          id="reg-confirm"
          type="password"
          autoComplete="new-password"
          placeholder="••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Criando conta…' : 'Criar Conta'}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Forgot password form
// ---------------------------------------------------------------------------

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Informe o seu e-mail.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Informe um e-mail válido.');
      return;
    }

    setLoading(true);
    try {
      await forgotPassword(email.trim().toLowerCase());
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar e-mail. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">E-mail enviado!</h3>
          <p className="text-sm text-slate-500">
            Se este e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha em breve.
            Verifique também a pasta de spam.
          </p>
        </div>
        <Button variant="outline" onClick={onBack} className="w-full">
          Voltar ao login
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900 mb-1">Redefinir senha</h3>
        <p className="text-sm text-slate-500">
          Informe o e-mail cadastrado na sua conta e enviaremos um link para redefinir sua senha.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="forgot-email" className="text-sm font-medium text-slate-700">
          E-mail
        </label>
        <Input
          id="forgot-email"
          type="email"
          autoComplete="email"
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Enviando…' : 'Enviar link de redefinição'}
      </Button>

      <button
        type="button"
        onClick={onBack}
        className="text-sm text-slate-500 hover:text-slate-700 hover:underline transition-colors text-center"
      >
        ← Voltar ao login
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Reset password form (accessed via email link)
// ---------------------------------------------------------------------------

function ResetPasswordForm({ token, onSuccess }: { token: string; onSuccess: () => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!newPassword) {
      setError('Informe a nova senha.');
      return;
    }
    if (newPassword.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao redefinir senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">Senha redefinida!</h3>
          <p className="text-sm text-slate-500">
            Sua senha foi alterada com sucesso. Você já pode fazer login com a nova senha.
          </p>
        </div>
        <Button onClick={onSuccess} className="w-full">
          Ir para o login
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900 mb-1">Criar nova senha</h3>
        <p className="text-sm text-slate-500">
          Escolha uma nova senha para a sua conta.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="reset-password" className="text-sm font-medium text-slate-700">
          Nova senha
        </label>
        <Input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={loading}
        />
        <p className="text-xs text-slate-400">Mínimo de 6 caracteres.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="reset-confirm" className="text-sm font-medium text-slate-700">
          Confirmar nova senha
        </label>
        <Input
          id="reset-confirm"
          type="password"
          autoComplete="new-password"
          placeholder="••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Salvando…' : 'Salvar nova senha'}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Auth page
// ---------------------------------------------------------------------------

type AuthView = 'tabs' | 'forgot' | 'reset';

export function AuthPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<AuthView>('tabs');
  const [resetToken, setResetToken] = useState<string | null>(null);

  // Check URL params for reset token
  useEffect(() => {
    const action = searchParams.get('action');
    const token = searchParams.get('token');
    if (action === 'reset' && token) {
      setResetToken(token);
      setView('reset');
    }
  }, [searchParams]);

  function handleBackToLogin() {
    setView('tabs');
    setResetToken(null);
    setSearchParams({});
  }

  function handleResetSuccess() {
    setView('tabs');
    setResetToken(null);
    setSearchParams({});
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / branding */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-md shadow-slate-200 ring-1 ring-slate-200/60">
            <img src="/favicon.svg" alt="3Maps" width={48} height={48} className="object-contain" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            3Maps
          </h1>
          <p className="text-sm text-slate-500">Gerador de mapas mentais com IA</p>
        </div>

        {/* Auth card */}
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/60 ring-1 ring-slate-200/60 p-6">
          {view === 'forgot' && (
            <ForgotPasswordForm onBack={handleBackToLogin} />
          )}

          {view === 'reset' && resetToken && (
            <ResetPasswordForm token={resetToken} onSuccess={handleResetSuccess} />
          )}

          {view === 'tabs' && (
            <Tabs defaultValue="login">
              <TabsList className="w-full mb-6">
                <TabsTrigger value="login" className="flex-1">Entrar</TabsTrigger>
                <TabsTrigger value="register" className="flex-1">Criar Conta</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <LoginForm onForgotPassword={() => setView('forgot')} />
              </TabsContent>

              <TabsContent value="register">
                <RegisterForm />
              </TabsContent>
            </Tabs>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          3Maps © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
