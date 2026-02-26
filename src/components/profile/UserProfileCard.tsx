/**
 * UserProfileCard — perfil do usuário (avatar, email, senha, uso)
 */

import { useState, useEffect, useRef } from 'react';
import { Mail, Lock, Camera, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { useUsageStore } from '@/stores/usage-store';
import {
  getUserProfile,
  updateUserProfile,
  changeUserPassword,
  uploadAvatar,
  type UserProfile,
} from '@/services/api/authApi';

interface UserProfileCardProps {
  onLogout?: () => void;
}

function getInitials(username: string): string {
  const parts = username.split(/[\s_-]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}

export function UserProfileCard({ onLogout }: UserProfileCardProps) {
  const { token, user } = useAuthStore();
  const usage = useUsageStore((s) => s.usage);
  const limits = useUsageStore((s) => s.limits);
  const fetchUsage = useUsageStore((s) => s.fetchUsage);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [avatarBlobUrl, setAvatarBlobUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token || !user) return;
    (async () => {
      setLoading(true);
      try {
        const { profile: p } = await getUserProfile(token);
        setProfile(p);
        setEmail(p.email ?? '');
        if (p.avatarUrl) {
          try {
            const r = await fetch('/api/user/avatar', { headers: { authorization: `Bearer ${token}` } });
            if (r.ok) {
              const blob = await r.blob();
              setAvatarBlobUrl(URL.createObjectURL(blob));
            }
          } catch {
            // ignore
          }
        }
      } catch {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, user?.username]);

  useEffect(() => {
    void fetchUsage();
  }, [fetchUsage]);

  async function handleSaveEmail() {
    if (!token) return;
    setEmailSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateUserProfile(token, { email: email.trim() || null });
      setProfile((p) => (p ? { ...p, email: updated.email } : p));
      setSuccess('E-mail atualizado.');
      useAuthStore.setState((s) => ({
        user: s.user ? { ...s.user, email: updated.email } : s.user,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!token || newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setPasswordSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await changeUserPassword(token, currentPassword, newPassword);
      setSuccess('Senha alterada com sucesso.');
      setShowPassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao alterar senha');
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setAvatarLoading(true);
      setError(null);
      try {
        await uploadAvatar(token, dataUrl);
        if (avatarBlobUrl) URL.revokeObjectURL(avatarBlobUrl);
        const r = await fetch('/api/user/avatar', { headers: { authorization: `Bearer ${token}` } });
        if (r.ok) {
          const blob = await r.blob();
          setAvatarBlobUrl(URL.createObjectURL(blob));
        }
        setSuccess('Foto atualizada.');
        useAuthStore.setState((s) => ({
          user: s.user ? { ...s.user, avatarUrl: '/api/user/avatar' } : s.user,
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao enviar foto');
      } finally {
        setAvatarLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  }

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const mapsUsed = usage?.mapsCreatedThisMonth ?? 0;
  const mapsLimit = limits?.mapsPerMonth ?? 5;
  const mapsLabel = mapsLimit === -1 ? `${mapsUsed} este mês` : `${mapsUsed} / ${mapsLimit} mapas`;
  const advancedUsed = usage?.advancedCallsUsed ?? 0;
  const advancedLimit = limits?.advancedCallsLimit ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Avatar + username */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-indigo-100 flex items-center justify-center shrink-0">
            {avatarBlobUrl ? (
              <img src={avatarBlobUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xl font-semibold text-indigo-600">{getInitials(user.username)}</span>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={handleAvatarSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarLoading}
            className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors"
          >
            {avatarLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
          </button>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-lg truncate">{user.username}</span>
          <span className="text-sm text-muted-foreground capitalize">Plano: {limits?.name ?? 'Gratuito'}</span>
        </div>
      </div>

      {/* Usage summary */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Uso este mês</h3>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span>Mapas criados: {mapsLabel}</span>
          {advancedLimit > 0 && (
            <span>
              Chamadas avançadas: {advancedUsed} / {advancedLimit}
            </span>
          )}
        </div>
      </div>

      {/* Email */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Mail className="w-4 h-4" />
          E-mail
        </label>
        <div className="flex gap-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
          />
          <Button variant="outline" size="sm" onClick={handleSaveEmail} disabled={emailSaving}>
            {emailSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
          </Button>
        </div>
      </div>

      {/* Password change (Firebase users will get error from backend) */}
      {profile && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Alterar senha
          </label>
          {!showPassword ? (
            <Button variant="outline" size="sm" onClick={() => setShowPassword(true)}>
              Alterar senha
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <Input
                type="password"
                placeholder="Senha atual"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Nova senha"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Confirmar nova senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleChangePassword} disabled={passwordSaving}>
                  {passwordSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Alterar senha'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowPassword(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{success}</p>}

      {onLogout && (
        <Button
          variant="outline"
          className="w-full gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
          onClick={onLogout}
        >
          Sair da conta
        </Button>
      )}
    </div>
  );
}
