import { Suspense, lazy, useEffect, useCallback, memo, type ComponentType, type ReactElement } from 'react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useAssessmentStore } from './store'
import { useAuthStore } from './store/auth'
import CursorGlow from './components/CursorGlow'
import ProfilingTestGate from './components/ProfilingTestGate'
import type {
  GameResult,
  StroopResult,
  NBackResult,
  GoNoGoResult,
  UltimatumResult,
  TrustResult,
  PublicGoodsResult,
} from './types'
import './index.css'

const HomePage = lazy(() => import('./pages/HomePage'))
const AssessmentSelectPage = lazy(() => import('./pages/AssessmentSelectPage'))
const AssessmentPage = lazy(() => import('./pages/AssessmentPage'))
const ReportPage = lazy(() => import('./pages/ReportPage'))
const TrackingPage = lazy(() => import('./pages/TrackingPage'))
const HumanMapIntakePage = lazy(() => import('./pages/HumanMapIntakePage'))
const AVGPage = lazy(() => import('./pages/AVGPage'))
const AVGPreQuestionnaire = lazy(() => import('./pages/AVGPreQuestionnaire'))
const GamesHubPage = lazy(() => import('./pages/GamesHubPage'))
const StroopGame = lazy(() => import('./games/StroopGame'))
const NBackGame = lazy(() => import('./games/NBackGame'))
const GoNoGoGame = lazy(() => import('./games/GoNoGoGame'))
const UltimatumGame = lazy(() => import('./games/UltimatumGame'))
const TrustGame = lazy(() => import('./games/TrustGame'))
const PublicGoodsGame = lazy(() => import('./games/PublicGoodsGame'))
const CATAssessmentPage = lazy(() => import('./pages/CATAssessmentPage'))
const SocraticDialoguePage = lazy(() => import('./pages/SocraticDialoguePage'))
const SharePosterPage = lazy(() => import('./pages/SharePosterPage'))
const MethodologyPage = lazy(() => import('./pages/MethodologyPage'))
const ForgePage = lazy(() => import('./pages/ForgePage'))
const AuthPage = lazy(() => import('./pages/AuthPage'))

function PageLoader() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary, #0a0a1a)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 36,
          height: 36,
          border: '2px solid rgba(100,255,218,0.15)',
          borderTopColor: 'var(--accent-cyan, #64ffda)',
          borderRadius: '50%',
          animation: 'page-loader-spin 0.6s linear infinite',
          margin: '0 auto 14px',
        }} />
        <p style={{ fontSize: 13, color: 'var(--text-tertiary, #666)', letterSpacing: '0.04em' }}>画像工坊加载中</p>
      </div>
      <style>{`@keyframes page-loader-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function GameWrapper({
  gameType,
  Component,
}: {
  gameType: GameResult['gameType']
  Component: ComponentType<{ onComplete: (r: any) => void }>
}) {
  const { saveGameResult } = useAssessmentStore()
  const handleComplete = useCallback((data: StroopResult | NBackResult | GoNoGoResult | UltimatumResult | TrustResult | PublicGoodsResult) => {
    saveGameResult({ gameType, data, completedAt: new Date().toISOString() })
  }, [gameType, saveGameResult])
  return <Component onComplete={handleComplete} />
}

const StudioHeader = memo(function StudioHeader() {
  const location = useLocation()

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1200,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 20px',
      background: 'linear-gradient(180deg, rgba(10,14,26,0.92), rgba(10,14,26,0.58))',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={() => { window.location.hash = '#/' }}
          style={{
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--text-secondary)',
            borderRadius: 999,
            padding: '8px 14px',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          返回 Openbasaka
        </button>
        <button
          type="button"
          onClick={() => { window.location.hash = '#/sandbox' }}
          style={{
            border: '1px solid rgba(100,255,218,0.18)',
            background: 'rgba(100,255,218,0.06)',
            color: 'var(--accent-cyan)',
            borderRadius: 999,
            padding: '8px 14px',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          查看沙盘
        </button>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Multi-Dimension Profiling
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
          {location.pathname === '/report' ? '画像结果与系统接入' : '画像工坊'}
        </div>
      </div>
    </div>
  )
})

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.getElementById('profiling-studio-scroll-root')?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])
  return null
}

function StudioRoutes() {
  const initialize = useAuthStore(state => state.initialize)
  const withTestGate = useCallback((element: ReactElement) => (
    <ProfilingTestGate>{element}</ProfilingTestGate>
  ), [])

  useEffect(() => {
    initialize()
    import('./engine/data-collection').then(module => module.flushSyncQueue()).catch(() => {})
  }, [initialize])

  return (
    <>
      <ScrollToTop />
      <StudioHeader />
      <Suspense fallback={<PageLoader />}>
        <div
          id="profiling-studio-scroll-root"
          className="profiling-studio-shell-root"
          style={{
            minHeight: '100vh',
            height: '100vh',
            paddingTop: 64,
            overflowY: 'auto',
            overflowX: 'hidden',
            overscrollBehavior: 'contain',
          }}
        >
          <Routes>
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
    </>
  )
}

export default function IntegratedProfilingApp() {
  return (
    <MemoryRouter initialEntries={['/']}>
      <CursorGlow />
      <StudioRoutes />
    </MemoryRouter>
  )
}
