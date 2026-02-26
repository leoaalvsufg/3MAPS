import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { HomePage } from '@/pages/HomePage';
import { OnboardingProvider } from '@/components/onboarding/OnboardingProvider';
import { useAuthStore } from '@/stores/auth-store';

// Route-level code splitting — keep HomePage eager (landing page)
const MapPage = lazy(() => import('@/pages/MapPage').then((m) => ({ default: m.MapPage })));
const AllMapsPage = lazy(() => import('@/pages/AllMapsPage').then((m) => ({ default: m.AllMapsPage })));
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const TagsPage = lazy(() => import('@/pages/TagsPage').then((m) => ({ default: m.TagsPage })));
const AuthPage = lazy(() => import('@/pages/AuthPage').then((m) => ({ default: m.AuthPage })));
const AdminPage = lazy(() => import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const ReleaseNotesPage = lazy(() => import('@/pages/ReleaseNotesPage').then((m) => ({ default: m.ReleaseNotesPage })));

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <span className="text-sm text-muted-foreground">Carregando...</span>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <OnboardingProvider>
      <Routes>
        {/* Auth page — no AppShell wrapper */}
        <Route
          path="/auth"
          element={
            <Suspense fallback={<PageLoader />}>
              <AuthPage />
            </Suspense>
          }
        />

        {/* Admin page — no AppShell wrapper */}
        <Route
          path="/admin"
          element={
            <Suspense fallback={<PageLoader />}>
              <RequireAuth>
                <AdminPage />
              </RequireAuth>
            </Suspense>
          }
        />

        {/* Main app routes — wrapped in AppShell */}
        <Route
          element={(
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          )}
        >
          <Route path="/" element={<HomePage />} />
          <Route
            path="/map/:id"
            element={
              <Suspense fallback={<PageLoader />}>
                <MapPage />
              </Suspense>
            }
          />
          <Route
            path="/maps"
            element={
              <Suspense fallback={<PageLoader />}>
                <AllMapsPage />
              </Suspense>
            }
          />
          <Route
            path="/tags"
            element={
              <Suspense fallback={<PageLoader />}>
                <TagsPage />
              </Suspense>
            }
          />
          <Route
            path="/profile"
            element={
              <Suspense fallback={<PageLoader />}>
                <ProfilePage />
              </Suspense>
            }
          />
          <Route path="/settings" element={<Navigate to="/profile" replace />} />
          <Route
            path="/release-notes"
            element={
              <Suspense fallback={<PageLoader />}>
                <ReleaseNotesPage />
              </Suspense>
            }
          />
        </Route>
      </Routes>
      </OnboardingProvider>
    </BrowserRouter>
  );
}

export default App;
