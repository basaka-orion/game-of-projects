import { useState, useEffect, useCallback } from 'react'
import GhostWidget from './views/GhostWidget/GhostWidget'
import SandboxMap from './views/SandboxMap/SandboxMap'
import Onboarding from './views/Onboarding/Onboarding'
import Openbasaka from './views/Openbasaka/Openbasaka'
import ProfilingStudio from './views/ProfilingStudio/ProfilingStudio'
import Settings from './views/Settings/Settings'
import VignetteGlow from './components/VignetteGlow'
import { initStore, getSettingAsync } from './lib/db/store'
import { ensureBossIdentity } from './lib/boss/anchor'

/**
 * 路由结构：
 * - openbasaka: Openbasaka 数字副官（默认首页）
 * - ghost: 项目的游戏 — 推演引擎
 * - sandbox: 战略沙盘全景图
 * - settings: 设置面板
 */
type Route = 'openbasaka' | 'ghost' | 'sandbox' | 'profiling' | 'settings'

function getRoute(): Route {
  const hash = window.location.hash.replace('#/', '').split('?')[0]
  if (hash === 'sandbox') return 'sandbox'
  if (hash === 'profiling') return 'profiling'
  if (hash === 'ghost') return 'ghost'
  if (hash === 'settings') return 'settings'
  return 'openbasaka'
}

export default function App() {
  const [route, setRoute] = useState<Route>(getRoute)
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true

    const init = async () => {
      try {
        await initStore()
        const onboarded = await getSettingAsync('onboarded', 'false')
        if (!alive) return

        if (onboarded === 'true') {
          setShowOnboarding(false)
          return
        }

        // 检查 Boss 身份：如果数据库空但锚点存在，自动恢复
        const result = await ensureBossIdentity()
        if (!alive) return
        setShowOnboarding(!result.identityFound && !result.restored)
      } catch (error) {
        console.warn('[app] init failed, falling back to onboarding gate:', error)
        if (alive) {
          setShowOnboarding(true)
        }
      }
    }

    init()
    const handleHashChange = () => setRoute(getRoute())
    window.addEventListener('hashchange', handleHashChange)

    return () => {
      alive = false
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  const handleOnboardComplete = useCallback(() => {
    setShowOnboarding(false)
  }, [])

  const switchToWarRoom = useCallback(() => {
    window.location.hash = '#/ghost'
  }, [])

  const switchToOpenbasaka = useCallback(() => {
    window.location.hash = '#/'
  }, [])

  const switchToProfilingStudio = useCallback(() => {
    window.location.hash = '#/profiling'
  }, [])

  const switchToSettings = useCallback(() => {
    window.location.hash = '#/settings'
  }, [])

  return (
    <>
      <VignetteGlow />
      {showOnboarding === null ? (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(circle at top, rgba(18,78,72,0.22), transparent 42%), #071210',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 44,
              height: 44,
              margin: '0 auto 16px',
              borderRadius: '50%',
              border: '2px solid rgba(0,255,209,0.12)',
              borderTopColor: 'rgba(0,255,209,0.78)',
              animation: 'gop-app-boot-spin 0.9s linear infinite',
            }} />
            <div style={{ color: 'rgba(229,255,252,0.9)', fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              正在接入 Openbasaka
            </div>
            <div style={{ marginTop: 10, color: 'rgba(173,206,198,0.68)', fontSize: 12 }}>
              同步本地身份与系统状态…
            </div>
          </div>
          <style>{`
            @keyframes gop-app-boot-spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      ) : showOnboarding ? (
        <Onboarding onComplete={handleOnboardComplete} />
      ) : (
        <>
          {route === 'openbasaka' && <Openbasaka onSwitchToWarRoom={switchToWarRoom} onOpenProfilingStudio={switchToProfilingStudio} />}
          {route === 'ghost' && <GhostWidget onSwitchToOpenbasaka={switchToOpenbasaka} />}
          {route === 'sandbox' && <SandboxMap />}
          {route === 'profiling' && <ProfilingStudio />}
          {route === 'settings' && <Settings />}
        </>
      )}
    </>
  )
}
