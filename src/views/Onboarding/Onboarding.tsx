import { useState, useCallback } from 'react'
import { setSetting, setBossProfile, markOnboarded } from '../../lib/db/store'
import { getDefaultConfig } from '../../lib/ai/provider'
import { saveAnchor } from '../../lib/boss/anchor'
import './Onboarding.css'

interface OnboardingProps {
  onComplete: () => void
}

const PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', desc: 'V4 Flash · 快速轻量' },
  { id: 'minimax', name: 'MiniMax', desc: '多模态长文本' },
  { id: 'glm', name: '智谱 GLM', desc: 'GLM-5.1 · 最新旗舰模型' },
  { id: 'ollama', name: 'Ollama', desc: '本地私有 · 零成本' },
  { id: 'custom', name: '自定义', desc: 'OpenAI 兼容 API' },
]

const INTEREST_TAGS = [
  'AI/ML', '区块链', 'SaaS', '硬件', '游戏', '教育',
  '健康', '电商', '社交', '工具', '创意', '金融',
]

type VerifyState = 'idle' | 'testing' | 'success' | 'error'

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1)
  const [provider, setProvider] = useState('deepseek')
  const [apiKey, setApiKey] = useState('')
  const [customUrl, setCustomUrl] = useState('')
  const [bossName, setBossName] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [hates, setHates] = useState('')
  const [verifyState, setVerifyState] = useState<VerifyState>('idle')
  const [verifyMsg, setVerifyMsg] = useState('')

  const toggleInterest = useCallback((tag: string) => {
    setInterests(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }, [])

  // API Key 验证
  const handleVerify = useCallback(async () => {
    if (!apiKey && provider !== 'ollama') {
      setVerifyState('error')
      setVerifyMsg('请先输入 API Key')
      return
    }
    setVerifyState('testing')
    setVerifyMsg('正在连接...')

    try {
      const defaults = getDefaultConfig(provider)
      const baseUrl = customUrl || defaults.baseUrl
      const model = defaults.model

      if (provider === 'ollama') {
        // Ollama 检测
        const res = await fetch('http://localhost:11434/api/tags', {
          signal: AbortSignal.timeout(3000),
        })
        if (res.ok) {
          const data = await res.json()
          const models = data.models?.map((m: { name: string }) => m.name).join(', ') || '无模型'
          setVerifyState('success')
          setVerifyMsg(`✓ Ollama 已连通 · 可用模型: ${models}`)
        } else {
          throw new Error('Ollama 服务返回错误')
        }
        return
      }

      // GLM (Z.AI) 使用 OpenAI 兼容端点
      const isAnthropic = baseUrl.includes('/api/anthropic')

      const res = isAnthropic
        ? await fetch(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: '你好，请回复"连接成功"' }],
              max_tokens: 20,
            }),
            signal: AbortSignal.timeout(15000),
          })
        : await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: '你好，请回复"连接成功"' }],
              max_tokens: 20,
            }),
            signal: AbortSignal.timeout(15000),
          })

      if (res.ok) {
        const data = await res.json()
        // Anthropic 格式: content 是数组；OpenAI 格式: choices[0].message.content
        const reply = isAnthropic
          ? (Array.isArray(data.content) ? data.content.filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('') : '')
          : (data.choices?.[0]?.message?.content || '')
        setVerifyState('success')
        setVerifyMsg(`✓ 连接成功 · ${model} 回复: "${reply.slice(0, 30)}"`)
      } else {
        const errText = await res.text()
        // 尝试解析 API 返回的具体错误信息
        let apiMsg = ''
        try {
          const errJson = JSON.parse(errText)
          apiMsg = errJson?.error?.message || ''
        } catch { /* ignore */ }
        // 常见错误解读
        if (res.status === 401) {
          throw new Error('API Key 无效或已过期')
        } else if (res.status === 402) {
          throw new Error('账户余额不足')
        } else if (res.status === 429) {
          throw new Error(apiMsg || '请求频率超限，稍后重试')
        } else {
          throw new Error(apiMsg || `${res.status}: ${errText.slice(0, 100)}`)
        }
      }
    } catch (err) {
      const msg = (err as Error).message
      setVerifyState('error')
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setVerifyMsg('✗ 网络连接失败 — CORS 限制，将在桌面端自动绕过')
      } else if (msg.includes('timeout') || msg.includes('AbortError')) {
        setVerifyMsg('✗ 连接超时 — 检查网络或 API 地址')
      } else {
        setVerifyMsg(`✗ ${msg}`)
      }
    }
  }, [apiKey, provider, customUrl])

  const handleComplete = useCallback(() => {
    // 保存 LLM 配置
    const defaultCfg = getDefaultConfig(provider)
    setSetting('llm_provider', provider)
    setSetting('llm_api_key', apiKey)
    setSetting('llm_base_url', customUrl || defaultCfg.baseUrl)
    setSetting('llm_model', defaultCfg.model)

    // 保存 Boss 画像
    setBossProfile({
      name: bossName || 'Boss',
      interests: interests.join(','),
      hates: hates,
    })

    markOnboarded()
    onComplete()

    // 异步写入 Boss 身份锚点（不阻塞启动）
    saveAnchor().catch(() => {})
  }, [provider, apiKey, customUrl, bossName, interests, hates, onComplete])

  return (
    <div className="onboarding">
      <div className="onboarding__card">
        {/* Header */}
        <div className="onboarding__header">
          <span className="onboarding__title">系统初始化</span>
          <span className="onboarding__step">{step}/3</span>
        </div>

        {/* Body */}
        <div className="onboarding__body">
          {/* Step 1: 欢迎 + AI 服务商 */}
          {step === 1 && (
            <div className="hd-fade-in">
              <div className="onboarding__welcome-icon">🧬</div>
              <div className="onboarding__welcome-text">
                欢迎来到 <strong>项目的游戏</strong> × <strong>Openbasaka</strong><br/>
                你的每一个创意都将在这里接受<br/>
                <strong>红蓝军推演</strong> 与 <strong>现实存活性检验</strong>
              </div>

              <label className="onboarding__label">选择 AI 引擎</label>
              <div className="onboarding__provider-grid">
                {PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    className={`onboarding__provider-btn ${
                      provider === p.id ? 'onboarding__provider-btn--active' : ''
                    }`}
                    onClick={() => { setProvider(p.id); setVerifyState('idle'); setVerifyMsg('') }}
                  >
                    <span className="onboarding__provider-name">{p.name}</span>
                    <span className="onboarding__provider-desc">{p.desc}</span>
                  </button>
                ))}
              </div>

              {provider !== 'ollama' && (
                <>
                  <label className="onboarding__label">API Key</label>
                  <div className="onboarding__input-row">
                    <input
                      className="onboarding__input onboarding__input--flex"
                      type="password"
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={e => { setApiKey(e.target.value); setVerifyState('idle') }}
                    />
                    <button
                      className={`onboarding__verify-btn ${
                        verifyState === 'testing' ? 'onboarding__verify-btn--testing' :
                        verifyState === 'success' ? 'onboarding__verify-btn--success' :
                        verifyState === 'error' ? 'onboarding__verify-btn--error' : ''
                      }`}
                      onClick={handleVerify}
                      disabled={verifyState === 'testing'}
                    >
                      {verifyState === 'testing' ? '验证中...' :
                       verifyState === 'success' ? '✓ 已验证' :
                       verifyState === 'error' ? '重试' : '验证连接'}
                    </button>
                  </div>
                </>
              )}

              {provider === 'custom' && (
                <>
                  <label className="onboarding__label">API Base URL</label>
                  <input
                    className="onboarding__input"
                    placeholder="https://api.example.com/v1"
                    value={customUrl}
                    onChange={e => setCustomUrl(e.target.value)}
                  />
                </>
              )}

              {provider === 'ollama' && (
                <div className="onboarding__ollama-section">
                  <div className="onboarding__hint">
                    确保已安装 Ollama 并运行 · http://localhost:11434
                  </div>
                  <button
                    className={`onboarding__verify-btn onboarding__verify-btn--full ${
                      verifyState === 'testing' ? 'onboarding__verify-btn--testing' :
                      verifyState === 'success' ? 'onboarding__verify-btn--success' :
                      verifyState === 'error' ? 'onboarding__verify-btn--error' : ''
                    }`}
                    onClick={handleVerify}
                    disabled={verifyState === 'testing'}
                  >
                    {verifyState === 'testing' ? '检测中...' :
                     verifyState === 'success' ? '✓ 已连通' :
                     verifyState === 'error' ? '重试检测' : '检测 Ollama'}
                  </button>
                </div>
              )}

              {/* 验证结果提示 */}
              {verifyMsg && (
                <div className={`onboarding__verify-msg ${
                  verifyState === 'success' ? 'onboarding__verify-msg--success' :
                  verifyState === 'error' ? 'onboarding__verify-msg--error' : ''
                }`}>
                  {verifyMsg}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Boss 画像初始化 */}
          {step === 2 && (
            <div className="hd-fade-in">
              <label className="onboarding__label">你的称呼</label>
              <input
                className="onboarding__input"
                placeholder="Boss / 造物主 / 你的名字"
                value={bossName}
                onChange={e => setBossName(e.target.value)}
              />

              <label className="onboarding__label">感兴趣的领域（可多选）</label>
              <div className="onboarding__tags">
                {INTEREST_TAGS.map(tag => (
                  <button
                    key={tag}
                    className={`onboarding__tag ${
                      interests.includes(tag) ? 'onboarding__tag--active' : ''
                    }`}
                    onClick={() => toggleInterest(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <label className="onboarding__label">当前厌恶 / 讨厌的事</label>
              <input
                className="onboarding__input"
                placeholder="例如：B端应酬, 重复会议, PPT..."
                value={hates}
                onChange={e => setHates(e.target.value)}
              />
              <div className="onboarding__hint">
                这些信息将帮助 AI 更精准地评估 Boss 内核匹配度
              </div>
            </div>
          )}

          {/* Step 3: 确认启动 */}
          {step === 3 && (
            <div className="hd-fade-in">
              <div className="onboarding__welcome-icon">⚡</div>
              <div className="onboarding__welcome-text">
                系统配置完成<br/><br/>
                引擎: <strong>{PROVIDERS.find(p => p.id === provider)?.name}</strong><br/>
                操作者: <strong>{bossName || 'Boss'}</strong><br/>
                关注领域: <strong>{interests.length ? interests.join(' · ') : '全领域'}</strong><br/>
                {verifyState === 'success' && (
                  <><br/><span style={{ color: 'var(--hd-success)', fontSize: '0.75rem' }}>✓ AI 引擎已验证连通</span></>
                )}
                <br/><br/>
                准备好将你的下一个想法<br/>
                扔进 <strong>红蓝军推演引擎</strong> 了吗？
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="onboarding__footer">
          {step > 1 ? (
            <button className="onboarding__btn" onClick={() => setStep(s => s - 1)}>
              ← 上一步
            </button>
          ) : (
            <div />
          )}
          {step < 3 ? (
            <button className="onboarding__btn onboarding__btn--primary" onClick={() => setStep(s => s + 1)}>
              继续 →
            </button>
          ) : (
            <button className="onboarding__btn onboarding__btn--primary" onClick={handleComplete}>
              启动系统 🚀
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
