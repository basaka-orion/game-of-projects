import { useState, useCallback, useMemo, useEffect } from 'react'
import DropZone from './DropZone'
import StatusBar from './StatusBar'
import HexRadar, { RadarData } from '../../components/HexRadar'
import TerminalBlock from '../../components/TerminalBlock'
import GridCard from '../../components/GridCard'
import WarningBanner from '../../components/WarningBanner'
import { parsePRD, ParsedPRD } from '../../lib/ai/prd-parser'
import { runWarRoom, WarRoomLog } from '../../lib/ai/war-room'
import { classifyProject } from '../../lib/ai/classifier'
import { LLMConfig, getDefaultConfig } from '../../lib/ai/provider'
import { getSetting, saveProject, getAllProjects } from '../../lib/db/store'
import { dbSaveTaxonomy, dbSaveDecision } from '../../lib/db/repository'
import { recordDecision } from '../../lib/boss/profile'
import { recordEvaluationXP, addXP } from '../../lib/game/progression'
import { extractFromEvaluation, extractFromDecision } from '../../lib/memory/extractor'
import './GhostWidget.css'

type WidgetState = 'idle' | 'ingesting' | 'analyzing' | 'reporting'

const EMPTY_RADAR: RadarData[] = [
  { label: '时代契合', value: 0 },
  { label: 'Boss匹配', value: 0 },
  { label: '商业变现', value: 0 },
  { label: '技术突破', value: 0 },
  { label: '资源消耗', value: 0 },
  { label: '风险指数', value: 0 },
]

function getLLMConfig(): LLMConfig {
  const provider = getSetting('llm_provider', 'deepseek')
  const defaults = getDefaultConfig(provider)
  return {
    provider: provider as LLMConfig['provider'],
    apiKey: getSetting('llm_api_key', ''),
    baseUrl: getSetting('llm_base_url', defaults.baseUrl),
    model: getSetting('llm_model', defaults.model),
  }
}

interface GhostWidgetProps {
  onSwitchToOpenbasaka: () => void
}

export default function GhostWidget({ onSwitchToOpenbasaka }: GhostWidgetProps) {
  const llmConfig = useMemo(() => getLLMConfig(), [])
  const [state, setState] = useState<WidgetState>('idle')
  const [radarData, setRadarData] = useState<RadarData[]>(EMPTY_RADAR)
  const [survivalRate, setSurvivalRate] = useState<number | null>(null)
  const [survivalGrade, setSurvivalGrade] = useState('')
  const [summary, setSummary] = useState('')
  const [analysisLog, setAnalysisLog] = useState<string[]>([])
  const [projectTitle, setProjectTitle] = useState('')
  const [projects, setProjects] = useState<Awaited<ReturnType<typeof getAllProjects>>>([])
  const [xpCounter, setXpCounter] = useState(0)

  // 加载项目历史
  useEffect(() => {
    getAllProjects().then(setProjects)
  }, [state]) // 每次状态回到 idle 时刷新

  const addLog = useCallback((msg: string) => {
    setAnalysisLog(prev => [...prev, msg])
  }, [])

  const handleFileDrop = useCallback(async (content: string, fileName: string) => {
    setState('ingesting')
    const fileTitle = fileName.replace(/\.[^.]+$/, '')
    setProjectTitle(fileTitle)
    setAnalysisLog([])
    addLog(`文件: ${fileName}`)
    addLog('正在解构文档...')

    let prd: ParsedPRD | null = null

    try {
      // Step 1: 解析 PRD
      addLog('调用 PRD 解析引擎...')
      prd = await parsePRD(llmConfig, content)
      // 用解析出的标题替换文件名
      if (prd.title && prd.title !== '未命名项目') {
        setProjectTitle(prd.title)
      }
      addLog(`✓ 项目识别: ${prd.title}`)
      addLog(`  定位: ${prd.oneLiner}`)
      addLog(`  标签: ${prd.tags.join(', ')}`)

      // Step 2: 启动推演
      setState('analyzing')
      addLog('启动红蓝军推演引擎...')

      const result = await runWarRoom(llmConfig, prd, (log: WarRoomLog) => {
        addLog(`[${log.role}] ${log.verdict}`)
      })

      // Step 3: 渲染结果
      const radar: RadarData[] = [
        { label: '时代契合', value: result.radar.era_fit },
        { label: 'Boss匹配', value: result.radar.boss_match },
        { label: '商业变现', value: result.radar.monetization },
        { label: '技术突破', value: result.radar.tech_breakthrough },
        { label: '资源消耗', value: result.radar.resource_cost },
        { label: '风险指数', value: result.radar.risk_index },
      ]
      setRadarData(radar)
      setSurvivalRate(result.survivalRate)
      setSurvivalGrade(result.survivalGrade)
      setSummary(result.summary)
      addLog(`✦ 推演完成 — 存活率 ${result.survivalRate}% [${result.survivalGrade}]`)

      // 持久化存储
      const saved = await saveProject(prd, result.radar, result.survivalRate, result.survivalGrade,
        result.summary, result.recommendation, result.logs, content)
      addLog('✓ 已存档')

      // 提取记忆到记忆宫殿
      extractFromEvaluation(prd.title, result.survivalRate, result.survivalGrade, result.summary, result.recommendation).catch(() => {})

      // 自动触发项目分类
      addLog('正在进行多维分类...')
      try {
        const classification = await classifyProject(llmConfig, prd, result)
        await dbSaveTaxonomy(
          saved.id,
          classification.taxonomy,
          classification.analysis,
          classification.taxonomy.industry,
          classification.taxonomy.subIndustry,
          classification.taxonomy.innovationType,
          classification.analysis.eraRelevance,
          classification.analysis.breakthroughPotential
        )
        addLog(`✓ 分类完成：${classification.taxonomy.industry} / ${classification.taxonomy.subIndustry}`)
        addLog(`  创新类型：${classification.taxonomy.innovationType} | 时代相关性：${classification.analysis.eraRelevance}`)
      } catch {
        addLog('⚠ 分类跳过（可在沙盘中手动补充分类）')
      }

      // 游戏经验值奖励
      try {
        const xpResult = await recordEvaluationXP(result.survivalRate)
        if (xpResult.xpGained > 0) addLog(`★ +${xpResult.xpGained} XP`)
        for (const a of xpResult.newAchievements) addLog(`🏆 成就解锁: ${a}`)
        setXpCounter(c => c + 1)
      } catch { /* 静默 */ }

      setState('reporting')
    } catch (err) {
      addLog(`✗ 错误: ${(err as Error).message}`)
      addLog('降级到本地模拟推演...')

      // 使用已解析的 PRD 数据（如果有）来决定分数
      const hasRealData = prd && prd.title !== '未命名项目'
      const base = hasRealData ? 10 : 0
      const mockRadar: RadarData[] = [
        { label: '时代契合', value: 72 + base + Math.floor(Math.random() * 15) },
        { label: 'Boss匹配', value: 65 + Math.floor(Math.random() * 25) },
        { label: '商业变现', value: 55 + Math.floor(Math.random() * 25) },
        { label: '技术突破', value: 60 + Math.floor(Math.random() * 25) },
        { label: '资源消耗', value: 40 + Math.floor(Math.random() * 30) },
        { label: '风险指数', value: 30 + Math.floor(Math.random() * 35) },
      ]
      setRadarData(mockRadar)
      const avg = Math.floor(mockRadar.reduce((s, d) => s + d.value, 0) / 6)
      setSurvivalRate(avg)
      setSurvivalGrade(avg >= 80 ? 'A' : avg >= 65 ? 'B' : avg >= 50 ? 'C' : 'D')
      setSummary(hasRealData
        ? `本地模拟推演：「${prd!.title}」定位为"${prd!.oneLiner}"，目标用户"${prd!.targetAudience}"，存在${prd!.risks.length}项风险。建议接入 AI 引擎获取深度评估。`
        : '本地模拟推演结果，仅供参考')

      // 如果有解析数据也做持久化
      if (prd) {
        const mockScores = {
          era_fit: mockRadar[0].value, boss_match: mockRadar[1].value,
          monetization: mockRadar[2].value, tech_breakthrough: mockRadar[3].value,
          resource_cost: mockRadar[4].value, risk_index: mockRadar[5].value,
        }
        await saveProject(prd, mockScores, avg,
          avg >= 80 ? 'A' : avg >= 65 ? 'B' : avg >= 50 ? 'C' : 'D',
          '本地模拟推演', '建议接入AI引擎', [], content)
        addLog('✓ 模拟结果已存档')
      }

      setState('reporting')
    }
  }, [addLog, llmConfig])

  const handleReset = useCallback(() => {
    setState('idle')
    setRadarData(EMPTY_RADAR)
    setSurvivalRate(null)
    setSurvivalGrade('')
    setSummary('')
    setAnalysisLog([])
    setProjectTitle('')
  }, [])

  return (
    <div className="ghost-widget">
      <div className="ghost-widget__drag-handle" />

      {/* 顶部导航栏 — Hermes 风格 */}
      <div className="hd-nav">
        <div className="hd-nav__item hd-nav__item--active">
          <span className="ghost-widget__logo">🔮 战争推演室</span>
        </div>
        <div className="hd-nav__item hd-nav__item--clickable" onClick={onSwitchToOpenbasaka}>
          ◈ Openbasaka
        </div>
        <div className="hd-nav__item hd-nav__item--clickable" onClick={() => window.electronAPI?.openSandbox()}>
          沙盘
        </div>
        <div className="hd-nav__item hd-nav__item--clickable" onClick={() => window.electronAPI?.minimizeToTray()}>
          收起
        </div>
      </div>

      {/* AI 未配置警告 */}
      {!llmConfig.apiKey && state === 'idle' && (
        <WarningBanner
          type="warning"
          message="AI 引擎未配置 — 当前为本地模拟模式，请在设置中配置 API Key"
          dismissible
          onDismiss={() => {}}
        />
      )}

      {/* 主体内容 */}
      <div className="ghost-widget__body">
        {state === 'idle' && (
          <div className="ghost-widget__idle hd-fade-in">
            <DropZone onDrop={handleFileDrop} />
            <div className="ghost-widget__hint">
              拖入 PRD / 痛点 / 代码包<br/>
              <span className="hd-label">触发神经元体检</span>
            </div>

            {/* 历史推演记录 */}
            {projects.length > 0 && (
                <div className="ghost-widget__history">
                  <div className="ghost-widget__history-title">推演存档 ({projects.length})</div>
                  <div className="ghost-widget__history-list hd-stagger-in">
                    {projects.slice(0, 5).map(p => (
                      <button key={p.id} className="ghost-widget__history-item" onClick={() => {
                        /* 加载历史记录 */
                        const radar: RadarData[] = [
                          { label: '时代契合', value: p.radar.era_fit },
                          { label: 'Boss匹配', value: p.radar.boss_match },
                          { label: '商业变现', value: p.radar.monetization },
                          { label: '技术突破', value: p.radar.tech_breakthrough },
                          { label: '资源消耗', value: p.radar.resource_cost },
                          { label: '风险指数', value: p.radar.risk_index },
                        ]
                        setRadarData(radar)
                        setSurvivalRate(p.survivalRate)
                        setSurvivalGrade(p.survivalGrade)
                        setSummary(p.summary)
                        setProjectTitle(p.title)
                        setState('reporting')
                      }}>
                        <span className="ghost-widget__history-name">{p.title}</span>
                        <span className="ghost-widget__history-meta">
                          <span className={`ghost-widget__history-rate ${
                            p.survivalRate >= 75 ? 'ghost-widget__history-rate--high' :
                            p.survivalRate >= 50 ? 'ghost-widget__history-rate--mid' :
                            'ghost-widget__history-rate--low'
                          }`}>{p.survivalRate}%</span>
                          <span className="ghost-widget__history-grade">{p.survivalGrade}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
            )}
          </div>
        )}

        {(state === 'ingesting' || state === 'analyzing') && (
          <div className="ghost-widget__processing hd-fade-in">
            <TerminalBlock title={projectTitle || 'ANALYSIS'}>
              {analysisLog.map((log, i) => (
                <div key={i}>
                  <span className="terminal-prompt">{log}</span>
                </div>
              ))}
              {state === 'analyzing' && (
                <>
                  <div className="hd-progress-bar" style={{ marginTop: 12 }} />
                  <div className="ghost-widget__spinner">
                    <div className="hd-pulse" style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: 'var(--hd-accent-cyan)', display: 'inline-block'
                    }} />
                    <span style={{ marginLeft: 8, color: 'var(--hd-text-muted)' }}>推演中...</span>
                  </div>
                </>
              )}
            </TerminalBlock>
          </div>
        )}

        {state === 'reporting' && (
          <div className="ghost-widget__report hd-fade-in">
            <GridCard title={`神经元体检 — ${projectTitle}`} accent>
              <div className="hd-radar-enter">
                <HexRadar data={radarData} size={220} />
              </div>
            </GridCard>

            {survivalRate !== null && (
              <div className="ghost-widget__survival hd-number-pop">
                <span className="hd-label">现实存活率</span>
                <span className={`ghost-widget__rate ${
                  survivalRate >= 75 ? 'ghost-widget__rate--high' :
                  survivalRate >= 50 ? 'ghost-widget__rate--mid' :
                  'ghost-widget__rate--low'
                }`}>
                  {survivalRate}%
                </span>
                <span className="ghost-widget__grade">{survivalGrade}</span>
              </div>
            )}

            {summary && (
              <GridCard title="推演总结">
                <p style={{ fontSize: '0.8rem', lineHeight: 1.8, color: 'var(--hd-text-secondary)' }}>
                  {summary}
                </p>
              </GridCard>
            )}

            <button className="ghost-widget__reset" onClick={handleReset}>
              ← 继续投喂
            </button>

            {/* 决策按钮 */}
            {survivalRate !== null && (
              <div className="ghost-widget__decisions hd-stagger-in">
                <div className="hd-label" style={{ marginBottom: 'var(--hd-space-sm)' }}>你的决策</div>
                <div className="ghost-widget__decision-btns">
                  <button
                    className="ghost-widget__decision-btn ghost-widget__decision-btn--pursue"
                    onClick={async () => {
                      await dbSaveDecision(projectTitle, 'pursue', `存活率 ${survivalRate}%`)
                      await recordDecision('pursue', projectTitle, survivalRate)
                      extractFromDecision(projectTitle, 'pursue', survivalRate).catch(() => {})
                      const xp = await addXP('makeDecision')
                      if (xp.xpGained > 0) addLog(`★ +${xp.xpGained} XP`)
                      for (const a of xp.newAchievements) addLog(`🏆 成就解锁: ${a}`)
                      setXpCounter(c => c + 1)
                      addLog('✓ 决策已记录：Pursue')
                      handleReset()
                    }}
                  >
                    Pursue
                  </button>
                  <button
                    className="ghost-widget__decision-btn ghost-widget__decision-btn--pivot"
                    onClick={async () => {
                      await dbSaveDecision(projectTitle, 'pivot', `存活率 ${survivalRate}%`)
                      await recordDecision('pivot', projectTitle, survivalRate)
                      extractFromDecision(projectTitle, 'pivot', survivalRate).catch(() => {})
                      const xp = await addXP('makeDecision')
                      if (xp.xpGained > 0) addLog(`★ +${xp.xpGained} XP`)
                      for (const a of xp.newAchievements) addLog(`🏆 成就解锁: ${a}`)
                      setXpCounter(c => c + 1)
                      addLog('✓ 决策已记录：Pivot')
                      handleReset()
                    }}
                  >
                    Pivot
                  </button>
                  <button
                    className="ghost-widget__decision-btn ghost-widget__decision-btn--abandon"
                    onClick={async () => {
                      await dbSaveDecision(projectTitle, 'abandon', `存活率 ${survivalRate}%`)
                      await recordDecision('abandon', projectTitle, survivalRate)
                      extractFromDecision(projectTitle, 'abandon', survivalRate).catch(() => {})
                      const xp = await addXP('abandonProject')
                      if (xp.xpGained > 0) addLog(`★ +${xp.xpGained} XP`)
                      for (const a of xp.newAchievements) addLog(`🏆 成就解锁: ${a}`)
                      setXpCounter(c => c + 1)
                      addLog('✓ 决策已记录：Abandon')
                      handleReset()
                    }}
                  >
                    Abandon
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <StatusBar state={state} onXpGained={xpCounter} />
    </div>
  )
}
