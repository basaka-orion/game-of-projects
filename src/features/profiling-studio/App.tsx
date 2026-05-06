import { Suspense, lazy, useEffect, useCallback, memo, type ReactElement } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useAssessmentStore } from './store';
import { useAuthStore } from './store/auth';
import CursorGlow from './components/CursorGlow';
import ProfilingTestGate from './components/ProfilingTestGate';
import type { GameResult, StroopResult, NBackResult, GoNoGoResult, UltimatumResult, TrustResult, PublicGoodsResult } from './types';

/* ═══════════════════════════════════════
   Lazy-load ALL pages — only HomePage is eager
   ═══════════════════════════════════════ */
const HomePage = lazy(() => import('./pages/HomePage'));
const AssessmentSelectPage = lazy(() => import('./pages/AssessmentSelectPage'));
const AssessmentPage = lazy(() => import('./pages/AssessmentPage'));
const HumanMapIntakePage = lazy(() => import('./pages/HumanMapIntakePage'));
const ReportPage = lazy(() => import('./pages/ReportPage'));
const TrackingPage = lazy(() => import('./pages/TrackingPage'));
const AVGPage = lazy(() => import('./pages/AVGPage'));
const AVGPreQuestionnaire = lazy(() => import('./pages/AVGPreQuestionnaire'));
const GamesHubPage = lazy(() => import('./pages/GamesHubPage'));
const MatrixReasoningPage = lazy(() => import('./pages/MatrixReasoningPage'));
const StroopGame = lazy(() => import('./games/StroopGame'));
const NBackGame = lazy(() => import('./games/NBackGame'));
const GoNoGoGame = lazy(() => import('./games/GoNoGoGame'));
const UltimatumGame = lazy(() => import('./games/UltimatumGame'));
const TrustGame = lazy(() => import('./games/TrustGame'));
const PublicGoodsGame = lazy(() => import('./games/PublicGoodsGame'));
const CATAssessmentPage = lazy(() => import('./pages/CATAssessmentPage'));
const SocraticDialoguePage = lazy(() => import('./pages/SocraticDialoguePage'));
const SharePosterPage = lazy(() => import('./pages/SharePosterPage'));
const MethodologyPage = lazy(() => import('./pages/MethodologyPage'));
const ForgePage = lazy(() => import('./pages/ForgePage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));

/* ═══ Loading Spinner ═══ */
function PageLoader() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary, #0a0a1a)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 36, height: 36, border: '2px solid rgba(100,255,218,0.15)',
          borderTopColor: 'var(--accent-cyan, #64ffda)',
          borderRadius: '50%',
          animation: 'page-loader-spin 0.6s linear infinite',
          margin: '0 auto 14px',
        }} />
        <p style={{ fontSize: 13, color: 'var(--text-tertiary, #666)', letterSpacing: '0.04em' }}>加载中</p>
      </div>
      <style>{`@keyframes page-loader-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ═══ Game Wrapper ═══ */
function GameWrapper({ gameType, Component }: { gameType: GameResult['gameType']; Component: React.ComponentType<{ onComplete: (r: any) => void }> }) {
  const { saveGameResult } = useAssessmentStore();
  const handleComplete = useCallback((data: StroopResult | NBackResult | GoNoGoResult | UltimatumResult | TrustResult | PublicGoodsResult) => {
    saveGameResult({ gameType, data, completedAt: new Date().toISOString() });
  }, [gameType, saveGameResult]);
  return <Component onComplete={handleComplete} />;
}

/* ═══ User Header ═══ */
const UserHeader = memo(function UserHeader() {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();

  if (!user) return (
    <div style={{ position: 'fixed', top: 14, right: 20, zIndex: 1000 }}>
      <button
        onClick={() => navigate('/auth')}
        style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10, padding: '6px 16px', fontSize: 12,
          color: 'var(--text-tertiary)', cursor: 'pointer',
        }}
      >
        登录
      </button>
    </div>
  );

  return (
    <div style={{
      position: 'fixed', top: 14, right: 20, zIndex: 1000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'rgba(0,0,0,0.5)',
      borderRadius: 12, padding: '6px 14px',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 8,
        background: 'linear-gradient(135deg, #7C4DFF, #E040FB)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, color: '#fff',
      }}>
        {(user.name || user.email || '?')[0].toUpperCase()}
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {user.name || user.email?.split('@')[0] || '用户'}
      </span>
      <button
        onClick={async () => { await signOut(); navigate('/auth'); }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 11, color: 'var(--text-tertiary)',
        }}
      >退出</button>
    </div>
  );
});

/* ═══ Auth Guard ═══ */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user && location.pathname !== '/auth') {
      navigate('/auth', { replace: true });
    }
  }, [loading, user, location.pathname, navigate]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(180deg, #0a0a1a 0%, #0f0c29 100%)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>🔮</div>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>加载中…</p>
        </div>
      </div>
    );
  }

  if (!user && location.pathname !== '/auth') return null;

  return <>{children}</>;
}

/* ═══ Scroll to Top ═══ */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

/* ═══ Animated Routes — No AnimatePresence, pure CSS transitions ═══ */
function AnimatedRoutes() {
  const location = useLocation();
  const initialize = useAuthStore(s => s.initialize);
  const withTestGate = useCallback((element: ReactElement) => (
    <ProfilingTestGate>{element}</ProfilingTestGate>
  ), []);

  useEffect(() => {
    initialize();
    import('./engine/data-collection').then(m => m.flushSyncQueue());
  }, [initialize]);

  return (
    <>
    <ScrollToTop />
    <AuthGuard>
    <UserHeader />
    <Suspense fallback={<PageLoader />}>
      <div
        key={location.pathname}
        className="page-transition"
        style={{ minHeight: '100vh' }}
      >
        <Routes location={location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/assessment" element={<AssessmentSelectPage />} />
          <Route path="/assessment/:dimensionId" element={withTestGate(<AssessmentPage />)} />
          <Route path="/intake/:mode" element={<HumanMapIntakePage />} />
          <Route path="/cat" element={withTestGate(<CATAssessmentPage />)} />
          <Route path="/cat/:dimensionId" element={withTestGate(<CATAssessmentPage />)} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/dialogue" element={<SocraticDialoguePage />} />
          <Route path="/tracking" element={<TrackingPage />} />
          <Route path="/avg" element={withTestGate(<AVGPage />)} />
          <Route path="/avg/intro" element={withTestGate(<AVGPreQuestionnaire />)} />
          <Route path="/games" element={withTestGate(<GamesHubPage />)} />
          <Route path="/matrix" element={withTestGate(<MatrixReasoningPage />)} />
          <Route path="/games/stroop" element={withTestGate(<GameWrapper gameType="stroop" Component={StroopGame} />)} />
          <Route path="/games/nback" element={withTestGate(<GameWrapper gameType="nback" Component={NBackGame} />)} />
          <Route path="/games/gonogo" element={withTestGate(<GameWrapper gameType="gonogo" Component={GoNoGoGame} />)} />
          <Route path="/games/ultimatum" element={withTestGate(<GameWrapper gameType="ultimatum" Component={UltimatumGame} />)} />
          <Route path="/games/trust" element={withTestGate(<GameWrapper gameType="trust" Component={TrustGame} />)} />
          <Route path="/games/publicgoods" element={withTestGate(<GameWrapper gameType="publicgoods" Component={PublicGoodsGame} />)} />
          <Route path="/poster" element={<SharePosterPage />} />
          <Route path="/forge" element={<ForgePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/methodology" element={<MethodologyPage />} />
        </Routes>
      </div>
    </Suspense>
    </AuthGuard>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <CursorGlow />
      <AnimatedRoutes />
    </BrowserRouter>
  );
}

export default App;
