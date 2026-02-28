import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { forgotPassword, resetPassword, requestMagicLink } from '@/services/api/authApi';
import { APP_VERSION } from '@/lib/version';
import { isFirebaseConfigured } from '@/lib/firebase-config';

// Firebase forms — lazy-loaded so Firebase SDK only loads when configured
const FirebaseLoginForm = lazy(() =>
  import('@/components/auth/FirebaseAuthForms').then((m) => ({ default: m.FirebaseLoginForm })),
);
const FirebaseRegisterForm = lazy(() =>
  import('@/components/auth/FirebaseAuthForms').then((m) => ({ default: m.FirebaseRegisterForm })),
);

function FirebaseFormFallback() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Magic link verify (ao clicar no link no e-mail)
// ---------------------------------------------------------------------------

function MagicLinkVerify({ token, onSuccess }: { token: string; onSuccess: () => void }) {
  const navigate = useNavigate();
  const loginWithMagicLink = useAuthStore((s) => s.loginWithMagicLink);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await loginWithMagicLink(token);
        if (!mounted) return;
        setStatus('success');
        navigate('/');
      } catch (err) {
        if (!mounted) return;
        setStatus('error');
      }
    })();
    return () => { mounted = false; };
  }, [token, loginWithMagicLink, navigate]);

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4 text-center py-8">
        <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center mx-auto animate-pulse">
          <svg className="w-7 h-7 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p className="text-sm text-slate-500">Validando seu link…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p className="text-sm text-red-600">Link inválido ou expirado. Solicite um novo link.</p>
        <Button variant="outline" onClick={onSuccess} className="w-full">
          Voltar ao login
        </Button>
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Magic link form (enviar link por e-mail)
// ---------------------------------------------------------------------------

function MagicLinkForm({ onBack }: { onBack: () => void }) {
  const [login, setLogin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!login.trim()) {
      setError('Informe o e-mail ou nome de usuário.');
      return;
    }

    setLoading(true);
    try {
      await requestMagicLink(login.trim());
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar link. Tente novamente.');
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
          <h3 className="text-base font-semibold text-slate-900 mb-1">Link enviado!</h3>
          <p className="text-sm text-slate-500">
            Se o e-mail ou usuário estiver cadastrado, você receberá um link para entrar em breve.
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
        <h3 className="text-base font-semibold text-slate-900 mb-1">Entrar com link mágico</h3>
        <p className="text-sm text-slate-500">
          Informe o e-mail ou nome de usuário da sua conta. Enviaremos um link de acesso único por e-mail.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="magic-login" className="text-sm font-medium text-slate-700">
          E-mail ou nome de usuário
        </label>
        <Input
          id="magic-login"
          type="text"
          autoComplete="username email"
          placeholder="seu@email.com ou nome_de_usuario"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Enviando…' : 'Enviar link mágico'}
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
// Login form (legacy — nome de usuário)
// ---------------------------------------------------------------------------

function LoginForm({ onForgotPassword, onMagicLink }: { onForgotPassword: () => void; onMagicLink: () => void }) {
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
      setError('Informe o e-mail ou nome de usuário.');
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
          E-mail ou nome de usuário
        </label>
        <Input
          id="login-username"
          type="text"
          autoComplete="username email"
          placeholder="seu@email.com ou nome_de_usuario"
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onMagicLink}
              className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
            >
              Entrar com link mágico
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
            >
              Esqueci minha senha
            </button>
          </div>
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
// Login tab: Firebase (email/Google) or legacy username
// ---------------------------------------------------------------------------

function LoginTabContent({ onForgotPassword, onMagicLink }: { onForgotPassword: () => void; onMagicLink: () => void }) {
  const [showLegacy, setShowLegacy] = useState(false);
  const useFirebase = isFirebaseConfigured();

  if (useFirebase && !showLegacy) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-xs text-slate-500 -mt-1">
          Use e-mail e senha, login social (Google) ou conta local (e-mail/nome de usuário).
        </p>
        <Suspense fallback={<FirebaseFormFallback />}>
          <FirebaseLoginForm onForgotPassword={onForgotPassword} />
        </Suspense>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-slate-500">ou</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowLegacy(true)}
          className="text-sm text-slate-500 hover:text-slate-700 hover:underline transition-colors"
        >
          Entrar com e-mail ou nome de usuário (conta local)
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <LoginForm onForgotPassword={onForgotPassword} onMagicLink={onMagicLink} />
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-2 text-slate-500">ou</span>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={!useFirebase}
        onClick={() => setShowLegacy(false)}
      >
        Entrar com Google
      </Button>
      {!useFirebase && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Login social disponível após configurar Firebase (VITE_FIREBASE_API_KEY e VITE_FIREBASE_APP_ID).
        </p>
      )}
      {useFirebase && (
        <button
          type="button"
          onClick={() => setShowLegacy(false)}
          className="text-sm text-slate-500 hover:text-slate-700 hover:underline transition-colors"
        >
          Entrar com e-mail ou Google
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Register tab: Firebase or legacy username
// ---------------------------------------------------------------------------

function RegisterTabContent() {
  const [showLegacy, setShowLegacy] = useState(false);
  const useFirebase = isFirebaseConfigured();

  if (useFirebase && !showLegacy) {
    return (
      <div className="flex flex-col gap-4">
        <Suspense fallback={<FirebaseFormFallback />}>
          <FirebaseRegisterForm />
        </Suspense>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-slate-500">ou</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowLegacy(true)}
          className="text-sm text-slate-500 hover:text-slate-700 hover:underline transition-colors"
        >
          Criar conta com nome de usuário
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <RegisterForm />
      {useFirebase && (
        <button
          type="button"
          onClick={() => setShowLegacy(false)}
          className="text-sm text-slate-500 hover:text-slate-700 hover:underline transition-colors"
        >
          Criar conta com e-mail ou Google
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Register form (legacy)
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
  const useFirebase = isFirebaseConfigured();

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
      if (useFirebase) {
        const { sendFirebasePasswordResetEmail } = await import('@/components/auth/FirebaseAuthForms');
        await sendFirebasePasswordResetEmail(email.trim());
      } else {
        await forgotPassword(email.trim().toLowerCase());
      }
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

type AuthView = 'tabs' | 'forgot' | 'reset' | 'magic' | 'magic-verify';

export function AuthPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<AuthView>('tabs');
  const [resetToken, setResetToken] = useState<string | null>(null);

  // Check URL params for reset token or magic link
  useEffect(() => {
    const action = searchParams.get('action');
    const token = searchParams.get('token');
    if (action === 'reset' && token) {
      setResetToken(token);
      setView('reset');
    } else if (action === 'magic' && token) {
      setResetToken(token);
      setView('magic-verify');
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

          {view === 'magic' && (
            <MagicLinkForm onBack={handleBackToLogin} />
          )}

          {view === 'magic-verify' && resetToken && (
            <MagicLinkVerify token={resetToken} onSuccess={handleBackToLogin} />
          )}

          {view === 'tabs' && (
            <Tabs defaultValue="login">
              <TabsList className="w-full mb-6">
                <TabsTrigger value="login" className="flex-1">Entrar</TabsTrigger>
                <TabsTrigger value="register" className="flex-1">Criar Conta</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <LoginTabContent onForgotPassword={() => setView('forgot')} onMagicLink={() => setView('magic')} />
              </TabsContent>

              <TabsContent value="register">
                <RegisterTabContent />
              </TabsContent>
            </Tabs>
          )}
        </div>

        <div className="text-center text-xs text-slate-500 mt-6 space-y-0.5">
          <p>3Maps © {new Date().getFullYear()}</p>
          <p>v{APP_VERSION}</p>
        </div>
      </div>
    </div>
  );
}
