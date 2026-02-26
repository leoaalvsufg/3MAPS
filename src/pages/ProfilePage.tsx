/**
 * ProfilePage — Perfil do usuário (Conta e Persistência)
 * Contém: avatar, email, senha, créditos extras, plano, uso
 */

import { User } from 'lucide-react';
import { UserProfileCard } from '@/components/profile/UserProfileCard';
import { useAuthStore } from '@/stores/auth-store';
import { useNavigate } from 'react-router-dom';

export function ProfilePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  function handleLogout() {
    navigate('/');
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-6 py-8 flex flex-col gap-8">
        <div className="flex items-center gap-3">
          <User className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Meu Perfil</h1>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="text-base font-semibold border-b border-border pb-2">Conta e Persistência</h2>
          {isAuthenticated ? (
            <UserProfileCard onLogout={handleLogout} />
          ) : (
            <p className="text-muted-foreground">Faça login para acessar seu perfil.</p>
          )}
        </section>
      </div>
    </div>
  );
}
