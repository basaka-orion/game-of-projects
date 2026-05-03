import { useState, useEffect, useCallback } from 'react'
import StatusBadge from '../../../components/StatusBadge'
import CollapsibleSection from '../../../components/CollapsibleSection'
import WarningBanner from '../../../components/WarningBanner'
import { getSetting, setSetting } from '../../../lib/db/store'
import { getDefaultConfig, LLMConfig, verifyLLMConfig } from '../../../lib/ai/provider'
import { getModelRoleConfig, initializeLocalFastModelRoles, MODEL_ROLE_DEFINITIONS } from '../../../lib/ai/model-roles'
import { getAllExperts, ExpertRole } from '../../../lib/chat/router'
import {
  listAllAgents,
  AgentDefinition,
  getBuiltInAgentIMConfig,
  saveBuiltInAgentIMConfig,
} from '../../../lib/agents/registry'
import {
  loadSkills,
  saveSkillsState,
  getSkillStats,
  getSkillsByCategory,
  SKILL_CATEGORIES,
  Skill,
  SkillCategory,
} from '../../../lib/skills/registry'
import { loadMCPServers, saveMCPServers, getMCPStats, MCPServer, MCPServerStatus } from '../../../lib/mcp/registry'
import './ControlPanelTab.css'

const PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-v4-flash',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    models: ['minimax-M2.7', 'MiniMax-Text-01', 'abab6.5s-chat'],
    defaultModel: 'minimax-M2.7',
  },
  { id: 'glm', name: 'GLM (智谱)', models: ['glm-5.1', 'glm-4-plus', 'glm-4-flash'], defaultModel: 'glm-5.1' },
  {
    id: 'ollama',
    name: 'Ollama (本地)',
    models: ['gemma3:4b', 'gemma3:1b', 'qwen2.5:14b', 'llama3.2:3b'],
    defaultModel: 'gemma3:4b',
  },
  { id: 'custom', name: '自定义', models: [], defaultModel: '' },
]

interface Alert {
  id: string
  type: 'warning' | 'error' | 'success' | 'info'
  message: string
}

type AgentModelTier = 'fast' | 'heavy'

function readAgentModelConfig(role: string, tier: AgentModelTier): LLMConfig | null {
  const prefix = `agent_${role}_${tier}`
  const provider = getSetting(`${prefix}_provider`, '')
  if (!provider) return null
  const defaults = getDefaultConfig(provider)
  return {
    provider: provider as LLMConfig['provider'],
    apiKey: getSetting(`${prefix}_api_key`, ''),
    baseUrl: getSetting(`${prefix}_base_url`, defaults.baseUrl),
    model: getSetting(`${prefix}_model`, defaults.model),
  }
}

function readLegacyAgentModelConfig(role: string): LLMConfig | null {
  const provider = getSetting(`agent_${role}_provider`, '')
  if (!provider) return null
  const defaults = getDefaultConfig(provider)
  return {
    provider: provider as LLMConfig['provider'],
    apiKey: getSetting(`agent_${role}_api_key`, ''),
    baseUrl: getSetting(`agent_${role}_base_url`, defaults.baseUrl),
    model: getSetting(`agent_${role}_model`, defaults.model),
  }
}

function hasAgentModelOverride(role: string): boolean {
  return !!(
    getSetting(`agent_${role}_fast_provider`, '') ||
    getSetting(`agent_${role}_heavy_provider`, '') ||
    getSetting(`agent_${role}_provider`, '')
  )
}

function saveAgentModelConfig(role: string, tier: AgentModelTier, config: LLMConfig): void {
  const prefix = `agent_${role}_${tier}`
  const defaults = getDefaultConfig(config.provider)
  setSetting(`${prefix}_provider`, config.provider)
  setSetting(`${prefix}_api_key`, config.apiKey)
  setSetting(`${prefix}_base_url`, config.baseUrl || defaults.baseUrl)
  setSetting(`${prefix}_model`, config.model || defaults.model)
}

function clearAgentModelConfig(role: string, tier: AgentModelTier): void {
  const prefix = `agent_${role}_${tier}`
  setSetting(`${prefix}_provider`, '')
  setSetting(`${prefix}_api_key`, '')
  setSetting(`${prefix}_base_url`, '')
  setSetting(`${prefix}_model`, '')
}

export default function ControlPanelTab() {
  // AI 配置
  const [provider, setProvider] = useState(getSetting('llm_provider', 'deepseek'))
  const [apiKey, setApiKey] = useState(getSetting('llm_api_key', ''))
  const [baseUrl, setBaseUrl] = useState(getSetting('llm_base_url', ''))
  const [model, setModel] = useState(getSetting('llm_model', ''))

  // 引擎 & 网关状态
  const [engineStatus, setEngineStatus] = useState<'checking' | 'online' | 'offline' | 'error'>('checking')
  const [gatewayStatus, setGatewayStatus] = useState<'stopped' | 'starting' | 'running' | 'error'>('stopped')

  // 告警
  const [alerts, setAlerts] = useState<Alert[]>([])

  // Skills
  const [skills, setSkills] = useState<Skill[]>(loadSkills)
  const skillStats = getSkillStats(skills)
  const skillsByCategory = getSkillsByCategory(skills)

  // MCP
  const [mcpServers, setMcpServers] = useState<MCPServer[]>(loadMCPServers)
  const mcpStats = getMCPStats(mcpServers)

  // IM 渠道 — Telegram Bot
  const [tgBotToken, setTgBotToken] = useState(() => getSetting('telegram_bot_token', ''))
  const [tgStatus, setTgStatus] = useState<'disconnected' | 'connected'>('disconnected')
  const [tgConnecting, setTgConnecting] = useState(false)
  const [botStatusList, setBotStatusList] = useState<Array<{ agentId: string; name: string; running: boolean }>>([])
  const [verifyingBot, setVerifyingBot] = useState<string | null>(null)
  const [botVerifyResults, setBotVerifyResults] = useState<Record<string, { ok: boolean; msg: string }>>({})
  const [tgUserApiId, setTgUserApiId] = useState(() => getSetting('telegram_user_api_id', ''))
  const [tgUserApiHash, setTgUserApiHash] = useState(() => getSetting('telegram_user_api_hash', ''))
  const [tgUserPhone, setTgUserPhone] = useState(() => getSetting('telegram_user_phone', ''))
  const [tgUserCode, setTgUserCode] = useState('')
  const [tgUserPassword, setTgUserPassword] = useState('')
  const [tgUserSyncEnabled, setTgUserSyncEnabled] = useState(() => getSetting('telegram_user_sync_enabled', 'false') === 'true')
  const [tgUserSyncBusy, setTgUserSyncBusy] = useState(false)
  const [tgUserSyncStatus, setTgUserSyncStatus] = useState<{
    enabled: boolean
    configured: boolean
    authorized: boolean
    phone: string
    needsCode: boolean
    error?: string
  } | null>(null)

  const refreshTgStatus = useCallback(async () => {
    try {
      const electronAPI = (window as any)?.electronAPI
      if (electronAPI?.telegramStatus) {
        const status = (await electronAPI.telegramStatus()) as { running: boolean; chatIds: number[] }
        setTgStatus(status.running ? 'connected' : 'disconnected')
      }
      if (electronAPI?.telegramBotList) {
        const bots = (await electronAPI.telegramBotList()) as Array<{ agentId: string; name: string; running: boolean }>
        setBotStatusList(bots)
      }
      if (electronAPI?.telegramUserSyncStatus) {
        const userStatus = await electronAPI.telegramUserSyncStatus()
        setTgUserSyncStatus(userStatus)
        setTgUserSyncEnabled(userStatus.enabled)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    refreshTgStatus()
  }, [refreshTgStatus])

  // 加载自定义 Agent
  useEffect(() => {
    listAllAgents().then((all) => {
      setCustomAgents(all.filter((a) => a.isCustom))
    })
  }, [])

  // UI
  const [saved, setSaved] = useState<string | null>(null)
  const [showAddMcp, setShowAddMcp] = useState(false)
  const [newMcp, setNewMcp] = useState({ name: '', command: 'npx', args: '', env: '', description: '' })
  const [dataOpsStatus, setDataOpsStatus] = useState<'idle' | 'exporting' | 'importing'>('idle')

  // 自定义 Agent
  const [customAgents, setCustomAgents] = useState<AgentDefinition[]>([])

  // 内置专家 IM 配置（从 settings 读取）
  const [builtInBotTokens, setBuiltInBotTokens] = useState<Record<string, string>>(() => {
    const tokens: Record<string, string> = {}
    for (const { role } of getAllExperts()) {
      tokens[role] = getSetting(`agent_${role}_bot_token`, '')
    }
    return tokens
  })

  // 角色模型配置
  const allExperts = getAllExperts()

  // 统一角色列表（内置专家 + 自定义 Agent）
  const allAgentEntries = [
    ...allExperts.map(({ role, config }) => ({
      id: role,
      name: config.name,
      emoji: config.emoji,
      isCustom: false,
    })),
    ...customAgents.map((a) => ({
      id: a.id,
      name: a.name,
      emoji: a.icon,
      isCustom: true,
    })),
  ]

  const [selectedAgent, setSelectedAgent] = useState<string>('__global__')
  const [agentHasOverride, setAgentHasOverride] = useState<Record<string, boolean>>({})
  const [agentFastProvider, setAgentFastProvider] = useState('')
  const [agentFastApiKey, setAgentFastApiKey] = useState('')
  const [agentFastBaseUrl, setAgentFastBaseUrl] = useState('')
  const [agentFastModel, setAgentFastModel] = useState('')
  const [agentHeavyProvider, setAgentHeavyProvider] = useState('')
  const [agentHeavyApiKey, setAgentHeavyApiKey] = useState('')
  const [agentHeavyBaseUrl, setAgentHeavyBaseUrl] = useState('')
  const [agentHeavyModel, setAgentHeavyModel] = useState('')
  const [verifyState, setVerifyState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [verifyMsg, setVerifyMsg] = useState('')
  const [verifyingTier, setVerifyingTier] = useState<'global' | AgentModelTier | null>(null)
  const [, setModelRoleRefreshKey] = useState(0)

  const currentProviderInfo = PROVIDERS.find((p) => p.id === provider)
  const modelRoleConfigs = MODEL_ROLE_DEFINITIONS.map((definition) => ({
    definition,
    config: getModelRoleConfig(definition.id),
  }))

  // ─── AI 引擎检测 ───
  const checkEngine = useCallback(async () => {
    setEngineStatus('checking')
    if (!apiKey && provider !== 'ollama') {
      setEngineStatus('offline')
      setGatewayStatus('stopped')
      return
    }
    try {
      const config = getLLMConfig()
      const res = await fetch(`${config.baseUrl}/models`, {
        method: 'GET',
        headers:
          config.provider === 'glm'
            ? { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }
            : { Authorization: `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        setEngineStatus('online')
        setGatewayStatus('running')
      } else {
        setEngineStatus('error')
        setGatewayStatus('error')
      }
    } catch {
      setEngineStatus('error')
      setGatewayStatus('error')
    }
  }, [apiKey, provider, baseUrl])

  useEffect(() => {
    checkEngine()
  }, [checkEngine])

  // ─── 告警生成 ───
  useEffect(() => {
    const newAlerts: Alert[] = []

    if (!apiKey && provider !== 'ollama') {
      newAlerts.push({
        id: 'no-apikey',
        type: 'warning',
        message: 'API Key 未配置，AI 引擎无法启动。请在下方"模型与 API"中配置。',
      })
    }

    const badPlugins = mcpServers.filter((s) => s.status === 'error')
    if (badPlugins.length > 0) {
      newAlerts.push({
        id: 'bad-plugins',
        type: 'warning',
        message: `已自动隔离 ${badPlugins.length} 个坏插件并清理相关配置。`,
      })
    }

    if (engineStatus === 'error') {
      newAlerts.push({
        id: 'model-refresh-fail',
        type: 'error',
        message: '模型目录刷新失败，已回退到上游目录快照。',
      })
    }

    if (engineStatus === 'online') {
      newAlerts.push({
        id: 'env-captured',
        type: 'info',
        message: `已自动捕获 1 个环境并允许调用相关引擎。`,
      })
    }

    setAlerts((prev) => {
      // 保留未被自动替换的手动关闭项
      const manuallyDismissed = prev.filter((a) => !newAlerts.some((na) => na.id === a.id))
      return [...newAlerts, ...manuallyDismissed]
    })
  }, [engineStatus, apiKey, provider, mcpServers])

  function getLLMConfig(): LLMConfig {
    const defaults = getDefaultConfig(provider)
    return {
      provider: provider as LLMConfig['provider'],
      apiKey,
      baseUrl: baseUrl || defaults.baseUrl,
      model: model || defaults.model,
    }
  }

  // ─── 角色配置初始化 ───
  useEffect(() => {
    // 检测所有角色是否有独立配置（内置 + 自定义）
    const overrides: Record<string, boolean> = {}
    for (const { role } of allExperts) {
      overrides[role] = hasAgentModelOverride(role)
    }
    // 检测自定义 Agent 是否有独立 LLM 配置
    for (const agent of customAgents) {
      overrides[agent.id] = hasAgentModelOverride(agent.id)
    }
    setAgentHasOverride(overrides)
  }, [customAgents])

  // 切换选中角色时加载对应配置
  useEffect(() => {
    setVerifyState('idle')
    setVerifyMsg('')
    if (selectedAgent === '__global__') {
      // 全局配置已由现有 state 管理
      return
    }
    const role = selectedAgent
    const hasOverride = hasAgentModelOverride(role)
    if (hasOverride) {
      const fastConfig = readAgentModelConfig(role, 'fast') || getModelRoleConfig('local_fast')
      const heavyConfig = readAgentModelConfig(role, 'heavy') || readLegacyAgentModelConfig(role) || getLLMConfig()
      setAgentFastProvider(fastConfig.provider)
      setAgentFastApiKey(fastConfig.apiKey)
      setAgentFastBaseUrl(fastConfig.baseUrl)
      setAgentFastModel(fastConfig.model)
      setAgentHeavyProvider(heavyConfig.provider)
      setAgentHeavyApiKey(heavyConfig.apiKey)
      setAgentHeavyBaseUrl(heavyConfig.baseUrl)
      setAgentHeavyModel(heavyConfig.model)
    } else {
      setAgentFastProvider('')
      setAgentFastApiKey('')
      setAgentFastBaseUrl('')
      setAgentFastModel('')
      setAgentHeavyProvider('')
      setAgentHeavyApiKey('')
      setAgentHeavyBaseUrl('')
      setAgentHeavyModel('')
    }
  }, [selectedAgent])

  // 角色配置验证
  const handleAgentVerify = useCallback(async (tier: 'global' | AgentModelTier = 'global') => {
    setVerifyState('testing')
    setVerifyingTier(tier)
    setVerifyMsg('正在验证连接...')
    let config: LLMConfig
    if (selectedAgent === '__global__' || tier === 'global') {
      config = getLLMConfig()
    } else if (tier === 'fast') {
      const p = agentFastProvider || 'ollama'
      const defaults = getDefaultConfig(p)
      config = {
        provider: p as LLMConfig['provider'],
        apiKey: agentFastApiKey,
        baseUrl: agentFastBaseUrl || defaults.baseUrl,
        model: agentFastModel || defaults.model,
      }
    } else {
      const p = agentHeavyProvider || provider
      const defaults = getDefaultConfig(p)
      config = {
        provider: p as LLMConfig['provider'],
        apiKey: agentHeavyApiKey || apiKey,
        baseUrl: agentHeavyBaseUrl || defaults.baseUrl,
        model: agentHeavyModel || defaults.model,
      }
    }
    const result = await verifyLLMConfig(config)
    setVerifyState(result.ok ? 'success' : 'error')
    setVerifyMsg(result.message)
  }, [
    selectedAgent,
    agentFastProvider,
    agentFastApiKey,
    agentFastBaseUrl,
    agentFastModel,
    agentHeavyProvider,
    agentHeavyApiKey,
    agentHeavyBaseUrl,
    agentHeavyModel,
    provider,
    apiKey,
    baseUrl,
    model,
  ])

  // 保存角色独立配置
  const handleSaveAgentConfig = useCallback(() => {
    if (selectedAgent === '__global__') {
      // 保存全局配置
      const defaults = getDefaultConfig(provider)
      setSetting('llm_provider', provider)
      setSetting('llm_api_key', apiKey)
      setSetting('llm_base_url', baseUrl || defaults.baseUrl)
      setSetting('llm_model', model || defaults.model)
      flashSaved('全局配置已保存')
      return
    }
    const role = selectedAgent
    if (!agentFastProvider || !agentHeavyProvider) return

    const fastDefaults = getDefaultConfig(agentFastProvider)
    const heavyDefaults = getDefaultConfig(agentHeavyProvider)
    const fastConfig: LLMConfig = {
      provider: agentFastProvider as LLMConfig['provider'],
      apiKey: agentFastApiKey,
      baseUrl: agentFastBaseUrl || fastDefaults.baseUrl,
      model: agentFastModel || fastDefaults.model,
    }
    const heavyConfig: LLMConfig = {
      provider: agentHeavyProvider as LLMConfig['provider'],
      apiKey: agentHeavyApiKey,
      baseUrl: agentHeavyBaseUrl || heavyDefaults.baseUrl,
      model: agentHeavyModel || heavyDefaults.model,
    }
    saveAgentModelConfig(role, 'fast', fastConfig)
    saveAgentModelConfig(role, 'heavy', heavyConfig)
    setSetting(`agent_${role}_provider`, heavyConfig.provider)
    setSetting(`agent_${role}_api_key`, heavyConfig.apiKey)
    setSetting(`agent_${role}_base_url`, heavyConfig.baseUrl)
    setSetting(`agent_${role}_model`, heavyConfig.model)
    setAgentHasOverride((prev) => ({ ...prev, [role]: true }))
    flashSaved(`${allAgentEntries.find((e) => e.id === role)?.name || role} 快慢模型已保存`)
  }, [
    selectedAgent,
    agentFastProvider,
    agentFastApiKey,
    agentFastBaseUrl,
    agentFastModel,
    agentHeavyProvider,
    agentHeavyApiKey,
    agentHeavyBaseUrl,
    agentHeavyModel,
    provider,
    apiKey,
    baseUrl,
    model,
    allAgentEntries,
  ])

  // 清除角色独立配置
  const handleClearAgentConfig = useCallback(() => {
    if (selectedAgent === '__global__') return
    const role = selectedAgent
    clearAgentModelConfig(role, 'fast')
    clearAgentModelConfig(role, 'heavy')
    setSetting(`agent_${role}_provider`, '')
    setSetting(`agent_${role}_api_key`, '')
    setSetting(`agent_${role}_base_url`, '')
    setSetting(`agent_${role}_model`, '')
    setAgentHasOverride((prev) => ({ ...prev, [role]: false }))
    setAgentFastProvider('')
    setAgentFastApiKey('')
    setAgentFastBaseUrl('')
    setAgentFastModel('')
    setAgentHeavyProvider('')
    setAgentHeavyApiKey('')
    setAgentHeavyBaseUrl('')
    setAgentHeavyModel('')
    setVerifyState('idle')
    setVerifyMsg('')
    setVerifyingTier(null)
    flashSaved(`${allAgentEntries.find((e) => e.id === role)?.name || role} 已恢复全局快慢模型默认`)
  }, [selectedAgent, allAgentEntries])

  const flashSaved = (msg: string) => {
    setSaved(msg)
    setTimeout(() => setSaved(null), 2000)
  }

  // ─── 网关操作 ───
  const handleStartGateway = useCallback(async () => {
    setGatewayStatus('starting')
    await checkEngine()
  }, [checkEngine])

  const handleForceRestart = useCallback(async () => {
    setGatewayStatus('starting')
    // 停止所有 MCP 服务器
    for (const server of mcpServers) {
      if (server.status === 'online') {
        try {
          await window.electronAPI?.mcpStop?.(server.id)
        } catch {
          /* ignore */
        }
      }
    }
    // 重置 MCP 状态
    setMcpServers((prev) => {
      const next = prev.map((s) => ({ ...s, status: 'not-installed' as MCPServerStatus, tools: 0 }))
      saveMCPServers(next)
      return next
    })
    // 重新检测引擎
    await checkEngine()
  }, [checkEngine, mcpServers])

  const handleSelfRepair = useCallback(async () => {
    // 尝试启动所有失败的 MCP 服务器
    const failedServers = mcpServers.filter((s) => s.status === 'error' || s.status === 'offline')
    for (const server of failedServers) {
      try {
        const success = await window.electronAPI?.mcpSpawn?.(server.id, server.command, server.args, server.env || {})
        if (success) {
          setMcpServers((prev) => {
            const next = prev.map((s) => (s.id === server.id ? { ...s, status: 'online' as MCPServerStatus } : s))
            saveMCPServers(next)
            return next
          })
        }
      } catch {
        /* ignore */
      }
    }
    await checkEngine()
    flashSaved('自检修复完成')
  }, [checkEngine, mcpServers])

  const handleRepairPlugins = useCallback(async () => {
    flashSaved('正在修复插件环境...')
    try {
      const result = await window.electronAPI?.executeCommand?.('npm install', 60000)
      if (result?.success) {
        flashSaved('插件环境修复成功')
      } else {
        flashSaved('插件环境修复失败')
      }
    } catch {
      flashSaved('插件环境修复出错')
    }
  }, [])

  const handleExportDatabase = useCallback(async () => {
    setDataOpsStatus('exporting')
    try {
      const ok = await window.electronAPI?.exportDatabase?.()
      flashSaved(ok ? '数据库备份已导出' : '已取消导出')
    } catch {
      flashSaved('数据库备份导出失败')
    } finally {
      setDataOpsStatus('idle')
    }
  }, [])

  const handleImportDatabase = useCallback(async () => {
    const confirmed = window.confirm(
      '导入数据库会用备份文件覆盖当前本地数据。请确认你已经导出过当前数据库备份，再继续恢复。',
    )
    if (!confirmed) return

    setDataOpsStatus('importing')
    try {
      const ok = await window.electronAPI?.importDatabase?.()
      flashSaved(ok ? '数据库已从备份恢复，请刷新沙盘' : '已取消或恢复失败')
    } catch {
      flashSaved('数据库恢复失败')
    } finally {
      setDataOpsStatus('idle')
    }
  }, [])

  const handleStopAndExit = useCallback(() => {
    setGatewayStatus('stopped')
    setEngineStatus('offline')
    flashSaved('网关已停止')
  }, [])

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id))
  }

  // ─── AI 配置保存 ───
  const saveAI = () => {
    setSetting('llm_provider', provider)
    setSetting('llm_api_key', apiKey)
    setSetting('llm_base_url', baseUrl)
    setSetting('llm_model', model)
    flashSaved('AI 配置已保存')
    checkEngine()
  }

  // ─── Skills 操作 ───
  const toggleSkill = (id: string) => {
    setSkills((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
      saveSkillsState(next)
      return next
    })
  }

  const toggleCategory = (category: SkillCategory) => {
    setSkills((prev) => {
      const categorySkills = prev.filter((s) => s.category === category)
      const allEnabled = categorySkills.every((s) => s.enabled)
      const next = prev.map((s) => (s.category === category ? { ...s, enabled: !allEnabled } : s))
      saveSkillsState(next)
      return next
    })
  }

  // ─── MCP 操作 ───
  const updateMCPStatus = (id: string, status: MCPServerStatus) => {
    setMcpServers((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, status } : s))
      saveMCPServers(next)
      return next
    })
  }

  const handleMCPStart = async (server: MCPServer) => {
    updateMCPStatus(server.id, 'pending' as MCPServerStatus)
    try {
      const success = await window.electronAPI?.mcpSpawn?.(server.id, server.command, server.args, server.env || {})
      if (success) {
        let toolCount = server.tools
        try {
          const tools = await window.electronAPI?.mcpListTools?.(server.id)
          toolCount = tools?.length ?? server.tools
        } catch {
          /* ignore */
        }
        setMcpServers((prev) => {
          const next = prev.map((s) =>
            s.id === server.id ? { ...s, status: 'online' as MCPServerStatus, tools: toolCount } : s,
          )
          saveMCPServers(next)
          return next
        })
        flashSaved(`${server.name} 已启动`)
      } else {
        updateMCPStatus(server.id, 'error' as MCPServerStatus)
        flashSaved(`${server.name} 启动失败`)
      }
    } catch {
      updateMCPStatus(server.id, 'error' as MCPServerStatus)
      flashSaved(`${server.name} 启动出错`)
    }
  }

  const handleMCPStop = async (server: MCPServer) => {
    try {
      await window.electronAPI?.mcpStop?.(server.id)
      setMcpServers((prev) => {
        const next = prev.map((s) =>
          s.id === server.id ? { ...s, status: 'offline' as MCPServerStatus, tools: 0 } : s,
        )
        saveMCPServers(next)
        return next
      })
      flashSaved(`${server.name} 已停止`)
    } catch {
      updateMCPStatus(server.id, 'error' as MCPServerStatus)
    }
  }

  const addCustomMCPServer = () => {
    if (!newMcp.name.trim()) return
    const server: MCPServer = {
      id: 'mcp_custom_' + Date.now().toString(36),
      name: newMcp.name.trim(),
      description: newMcp.description.trim(),
      command: newMcp.command || 'npx',
      args: newMcp.args ? newMcp.args.split(' ') : [],
      env: {},
      status: 'not-installed',
      tools: 0,
      category: '自定义',
      icon: '🔌',
      installHint: newMcp.command + ' ' + newMcp.args,
    }
    const updated = [...mcpServers, server]
    setMcpServers(updated)
    saveMCPServers(updated)
    setNewMcp({ name: '', command: 'npx', args: '', env: '', description: '' })
    setShowAddMcp(false)
    flashSaved(`MCP 服务器 "${server.name}" 已添加`)
  }

  const removeMCPServer = (id: string) => {
    const updated = mcpServers.filter((s) => s.id !== id)
    setMcpServers(updated)
    saveMCPServers(updated)
    flashSaved('已移除')
  }

  // 统计
  const onlineMcpTools = mcpServers.filter((s) => s.status === 'online').reduce((sum, s) => sum + s.tools, 0)
  const totalCapabilities = skillStats.enabled + onlineMcpTools

  // 网关状态映射
  const gatewayStatusMap = {
    stopped: { status: 'error' as const, label: '已停止' },
    starting: { status: 'warning' as const, label: '启动中...' },
    running: { status: 'active' as const, label: '运行中' },
    error: { status: 'error' as const, label: '异常' },
  }
  const gw = gatewayStatusMap[gatewayStatus]

  return (
    <div className="cp">
      {saved && <div className="cp__toast hd-fade-in">✓ {saved}</div>}

      {/* ═══ 告警横幅 ═══ */}
      {alerts.length > 0 && (
        <div className="cp__alerts">
          {alerts.map((alert) => (
            <WarningBanner
              key={alert.id}
              type={alert.type}
              message={alert.message}
              dismissible
              onDismiss={() => dismissAlert(alert.id)}
            />
          ))}
        </div>
      )}

      {/* ═══ 网关状态 ═══ */}
      <CollapsibleSection title="网关状态" defaultOpen={true} badge={{ status: gw.status, label: gw.label }}>
        <div className="cp__gateway-status">
          <div className="cp__gateway-header">
            <StatusBadge
              status={gatewayStatus === 'running' ? 'active' : gatewayStatus === 'starting' ? 'warning' : 'error'}
              label={gatewayStatus === 'running' ? '在线' : gatewayStatus === 'starting' ? '启动中...' : '已停止'}
            />
            <span className="cp__gateway-model">
              {model || currentProviderInfo?.defaultModel || '未设置'} · via {currentProviderInfo?.name || provider}
            </span>
          </div>
          <div className="cp__gateway-btns">
            <button className="cp__g-btn" onClick={handleStartGateway} disabled={gatewayStatus === 'starting'}>
              启动网关
            </button>
            <button className="cp__g-btn" onClick={handleForceRestart} disabled={gatewayStatus === 'starting'}>
              强制重启
            </button>
            <button className="cp__g-btn cp__g-btn--success" onClick={handleSelfRepair}>
              自检修复
            </button>
            <button className="cp__g-btn" onClick={handleRepairPlugins}>
              修复插件环境
            </button>
            {gatewayStatus === 'running' && (
              <button className="cp__g-btn cp__g-btn--danger" onClick={handleStopAndExit}>
                停止网关
              </button>
            )}
          </div>
          {/* 状态明细 */}
          <div
            style={{ display: 'flex', gap: 'var(--hd-space-lg)', flexWrap: 'wrap', paddingTop: 'var(--hd-space-xs)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="cp__label">引擎</span>
              <StatusBadge
                status={engineStatus === 'online' ? 'active' : engineStatus === 'checking' ? 'warning' : 'error'}
                label={engineStatus === 'online' ? '在线' : engineStatus === 'checking' ? '检测中...' : '离线'}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="cp__label">能力</span>
              <span
                style={{
                  fontFamily: 'var(--hd-font-display)',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  color: 'var(--hd-accent-cyan)',
                }}
              >
                {totalCapabilities}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="cp__label">MCP</span>
              <span style={{ fontFamily: 'var(--hd-font-mono)', fontSize: '0.7rem', color: 'var(--hd-text-muted)' }}>
                {mcpStats.online}/{mcpStats.total} 在线
              </span>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* ═══ 开发者面板 ═══ */}
      <CollapsibleSection title="开发者面板" defaultOpen={true}>
        <div className="cp__dev">
          <button className="cp__dev-primary" onClick={() => window.electronAPI?.openDevTools?.()}>
            打开 OpenBasaka 开发者面板
          </button>
          <button
            className="cp__dev-secondary"
            onClick={async () => {
              const appData = await window.electronAPI?.getAppData?.()
              if (appData) {
                window.electronAPI?.executeCommand?.(`open "${appData}"`, 5000)
                flashSaved('已打开工作区文件夹')
              }
            }}
          >
            打开工作区文件夹
          </button>
          <div className="cp__dev-path">~/.openbasaka (Electron userData)</div>
        </div>
      </CollapsibleSection>

      {/* ═══ 数据备份与恢复 ═══ */}
      <CollapsibleSection title="数据备份与恢复" defaultOpen={true}>
        <div className="cp__data-ops">
          <div className="cp__data-ops-copy">
            <div className="cp__data-ops-title">本地优先的最后保险</div>
            <div className="cp__data-ops-desc">
              导出会把 SQLite 数据库保存为 JSON 备份；恢复会覆盖当前本地库，适合迁移设备或回滚严重故障。
            </div>
          </div>
          <div className="cp__data-ops-actions">
            <button
              className="cp__g-btn cp__g-btn--success"
              onClick={handleExportDatabase}
              disabled={dataOpsStatus !== 'idle'}
            >
              {dataOpsStatus === 'exporting' ? '导出中...' : '导出 JSON 备份'}
            </button>
            <button
              className="cp__g-btn cp__g-btn--danger"
              onClick={handleImportDatabase}
              disabled={dataOpsStatus !== 'idle'}
            >
              {dataOpsStatus === 'importing' ? '恢复中...' : '从备份恢复'}
            </button>
          </div>
          <div className="cp__data-ops-risk">恢复会先清空备份内对应表再写入，请只导入你信任的本机 JSON 备份。</div>
        </div>
      </CollapsibleSection>

      {/* ═══ 模型岗位配置 ═══ */}
      <CollapsibleSection title="模型岗位" defaultOpen={true} count={MODEL_ROLE_DEFINITIONS.length}>
        <div className="cp__model-roles">
          <div className="cp__model-roles-head">
            <div>
              <div className="cp__model-roles-title">主脑 + 本地小模型分工</div>
              <div className="cp__model-roles-copy">
                小任务默认交给 Ollama 本地模型 gemma3:4b；复杂推理继续走主模型，保证速度和韧性。
              </div>
            </div>
            <button
              className="cp__g-btn cp__g-btn--success"
              onClick={() => {
                initializeLocalFastModelRoles()
                setModelRoleRefreshKey((value) => value + 1)
                flashSaved('已把归档、打标、进化复盘接到本地小模型岗位')
              }}
            >
              初始化本地小任务岗位
            </button>
          </div>
          <div className="cp__model-role-grid">
            {modelRoleConfigs.map(({ definition, config }) => (
              <div key={definition.id} className="cp__model-role-card">
                <div className="cp__model-role-top">
                  <span>{definition.label}</span>
                  <StatusBadge status={config.provider === 'ollama' ? 'active' : 'inactive'} label={config.provider} />
                </div>
                <div className="cp__model-role-model">{config.model}</div>
                <div className="cp__model-role-copy">{definition.taskHint}</div>
                {definition.fallbackRoleId && (
                  <div className="cp__model-role-fallback">fallback: {definition.fallbackRoleId}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* ═══ 角色 × 模型配置 ═══ */}
      <CollapsibleSection title="角色 × 模型配置" defaultOpen={true} count={allAgentEntries.length + 1}>
        <div className="cp__agent-config">
          {/* 角色 Chip 选择器 */}
          <div className="cp__agent-chips">
            <button
              className={`cp__agent-chip ${selectedAgent === '__global__' ? 'cp__agent-chip--active' : ''}`}
              onClick={() => setSelectedAgent('__global__')}
            >
              <span className="cp__agent-chip-emoji">⚙️</span>
              <span className="cp__agent-chip-name">全局默认</span>
            </button>
            {allAgentEntries.map((entry) => (
              <button
                key={entry.id}
                className={`cp__agent-chip ${selectedAgent === entry.id ? 'cp__agent-chip--active' : ''} ${agentHasOverride[entry.id] ? 'cp__agent-chip--override' : ''}`}
                onClick={() => setSelectedAgent(entry.id)}
              >
                <span className="cp__agent-chip-emoji">{entry.emoji}</span>
                <span className="cp__agent-chip-name">{entry.name}</span>
                {agentHasOverride[entry.id] && <span className="cp__agent-chip-badge">✱</span>}
                {entry.isCustom && (
                  <span
                    className="cp__agent-chip-badge"
                    style={{ color: 'var(--hd-accent-cyan)', fontSize: '0.55rem' }}
                  >
                    ★
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 配置表单 */}
          {selectedAgent === '__global__' ? (
            /* 全局默认配置 */
            <div className="cp__agent-form">
              <div className="cp__agent-form-header">
                <span>⚙️ 全局默认配置</span>
                <span className="cp__agent-form-hint">所有角色默认使用此配置</span>
              </div>
              <div className="cp__provider-grid">
                {PROVIDERS.map((p) => {
                  const isActive = provider === p.id
                  return (
                    <div
                      key={p.id}
                      className={`cp__provider-card ${isActive ? 'cp__provider-card--active' : ''}`}
                      onClick={() => {
                        setProvider(p.id)
                        const defaults = getDefaultConfig(p.id)
                        setBaseUrl(defaults.baseUrl)
                        setModel(defaults.model)
                      }}
                    >
                      <span className="cp__provider-name">{p.name}</span>
                      {isActive && <StatusBadge status="active" label="✓" />}
                    </div>
                  )
                })}
              </div>
              <div className="cp__model-form">
                <div className="cp__field">
                  <label className="cp__label">API Key</label>
                  <input
                    className="cp__input"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={provider === 'ollama' ? '本地无需 Key' : 'sk-...'}
                  />
                </div>
                <div className="cp__field">
                  <label className="cp__label">Base URL</label>
                  <input
                    className="cp__input"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={getDefaultConfig(provider).baseUrl}
                  />
                </div>
                <div className="cp__field">
                  <label className="cp__label">Model</label>
                  {currentProviderInfo && currentProviderInfo.models.length > 0 ? (
                    <select className="cp__select" value={model} onChange={(e) => setModel(e.target.value)}>
                      {currentProviderInfo.models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="cp__input"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={currentProviderInfo?.defaultModel || 'model-name'}
                    />
                  )}
                </div>
                <div className="cp__form-actions">
                  <button
                    className="cp__verify-btn"
                    onClick={() => handleAgentVerify('global')}
                    disabled={verifyState === 'testing'}
                  >
                    {verifyState === 'testing' && verifyingTier === 'global' ? '⚙️ 验证中...' : '🔍 验证连接'}
                  </button>
                  <button className="cp__save-btn" onClick={handleSaveAgentConfig}>
                    💾 保存
                  </button>
                </div>
                {verifyMsg && (
                  <div
                    className={`cp__verify-result ${verifyState === 'success' ? 'cp__verify-result--ok' : verifyState === 'error' ? 'cp__verify-result--fail' : ''}`}
                  >
                    {verifyMsg}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* 角色专属配置 */
            <div className="cp__agent-form">
              <div className="cp__agent-form-header">
                <span>
                  {allAgentEntries.find((e) => e.id === selectedAgent)?.emoji}{' '}
                  {allAgentEntries.find((e) => e.id === selectedAgent)?.name}
                </span>
                <span className="cp__agent-form-hint">
                  {agentHasOverride[selectedAgent] ? '✱ 使用独立配置' : '⚙️ 使用全局默认'}
                </span>
              </div>

              {!agentHasOverride[selectedAgent] && (
                <div className="cp__agent-global-info">
                  <p>
                    当前复杂任务使用全局配置：<strong>{currentProviderInfo?.name || provider}</strong> /{' '}
                    <strong>{model || '未设置'}</strong>；轻量任务继承模型岗位里的本地小任务配置。
                  </p>
                  <button
                    className="cp__override-btn"
                    onClick={() => {
                      const fastConfig = getModelRoleConfig('local_fast')
                      setAgentFastProvider(fastConfig.provider)
                      setAgentFastApiKey(fastConfig.apiKey)
                      setAgentFastBaseUrl(fastConfig.baseUrl)
                      setAgentFastModel(fastConfig.model)
                      setAgentHeavyProvider(provider)
                      setAgentHeavyApiKey(apiKey)
                      setAgentHeavyBaseUrl(baseUrl)
                      setAgentHeavyModel(model)
                      setAgentHasOverride((prev) => ({ ...prev, [selectedAgent]: true }))
                    }}
                  >
                    ✱ 为此角色设置快慢模型
                  </button>
                </div>
              )}

              {agentHasOverride[selectedAgent] && (
                <>
                  <div className="cp__agent-tier-grid">
                    <div className="cp__agent-tier-card">
                      <div className="cp__agent-tier-head">
                        <span>轻量模型</span>
                        <span>短回应 / 回忆 / 状态 / 低风险草稿</span>
                      </div>
                      <div className="cp__provider-grid cp__provider-grid--compact">
                        {PROVIDERS.map((p) => {
                          const isActive = agentFastProvider === p.id
                          return (
                            <div
                              key={p.id}
                              className={`cp__provider-card ${isActive ? 'cp__provider-card--active' : ''}`}
                              onClick={() => {
                                setAgentFastProvider(p.id)
                                const defaults = getDefaultConfig(p.id)
                                setAgentFastBaseUrl(defaults.baseUrl)
                                setAgentFastModel(defaults.model)
                              }}
                            >
                              <span className="cp__provider-name">{p.name}</span>
                              {isActive && <StatusBadge status="active" label="✓" />}
                            </div>
                          )
                        })}
                      </div>
                      <div className="cp__model-form">
                        <div className="cp__field">
                          <label className="cp__label">API Key</label>
                          <input
                            className="cp__input"
                            type="password"
                            value={agentFastApiKey}
                            onChange={(e) => setAgentFastApiKey(e.target.value)}
                            placeholder={agentFastProvider === 'ollama' ? '本地无需 Key' : 'sk-...'}
                          />
                        </div>
                        <div className="cp__field">
                          <label className="cp__label">Base URL</label>
                          <input
                            className="cp__input"
                            value={agentFastBaseUrl}
                            onChange={(e) => setAgentFastBaseUrl(e.target.value)}
                            placeholder={getDefaultConfig(agentFastProvider || 'ollama').baseUrl}
                          />
                        </div>
                        <div className="cp__field">
                          <label className="cp__label">Model</label>
                          {(() => {
                            const agentProviderInfo = PROVIDERS.find((p) => p.id === agentFastProvider)
                            return agentProviderInfo && agentProviderInfo.models.length > 0 ? (
                              <select
                                className="cp__select"
                                value={agentFastModel}
                                onChange={(e) => setAgentFastModel(e.target.value)}
                              >
                                {agentProviderInfo.models.map((m) => (
                                  <option key={m} value={m}>
                                    {m}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                className="cp__input"
                                value={agentFastModel}
                                onChange={(e) => setAgentFastModel(e.target.value)}
                                placeholder={PROVIDERS.find((p) => p.id === agentFastProvider)?.defaultModel || 'model-name'}
                              />
                            )
                          })()}
                        </div>
                        <button
                          className="cp__verify-btn"
                          onClick={() => handleAgentVerify('fast')}
                          disabled={verifyState === 'testing'}
                        >
                          {verifyState === 'testing' && verifyingTier === 'fast' ? '⚙️ 验证中...' : '🔍 验证轻量模型'}
                        </button>
                      </div>
                    </div>

                    <div className="cp__agent-tier-card">
                      <div className="cp__agent-tier-head">
                        <span>复杂模型</span>
                        <span>产品 / 项目 / APP / PRD / 架构 / 深度分析</span>
                      </div>
                      <div className="cp__provider-grid cp__provider-grid--compact">
                        {PROVIDERS.map((p) => {
                          const isActive = agentHeavyProvider === p.id
                          return (
                            <div
                              key={p.id}
                              className={`cp__provider-card ${isActive ? 'cp__provider-card--active' : ''}`}
                              onClick={() => {
                                setAgentHeavyProvider(p.id)
                                const defaults = getDefaultConfig(p.id)
                                setAgentHeavyBaseUrl(defaults.baseUrl)
                                setAgentHeavyModel(defaults.model)
                              }}
                            >
                              <span className="cp__provider-name">{p.name}</span>
                              {isActive && <StatusBadge status="active" label="✓" />}
                            </div>
                          )
                        })}
                      </div>
                      <div className="cp__model-form">
                        <div className="cp__field">
                          <label className="cp__label">API Key</label>
                          <input
                            className="cp__input"
                            type="password"
                            value={agentHeavyApiKey}
                            onChange={(e) => setAgentHeavyApiKey(e.target.value)}
                            placeholder={agentHeavyProvider === 'ollama' ? '本地无需 Key' : 'sk-...'}
                          />
                        </div>
                        <div className="cp__field">
                          <label className="cp__label">Base URL</label>
                          <input
                            className="cp__input"
                            value={agentHeavyBaseUrl}
                            onChange={(e) => setAgentHeavyBaseUrl(e.target.value)}
                            placeholder={getDefaultConfig(agentHeavyProvider || 'deepseek').baseUrl}
                          />
                        </div>
                        <div className="cp__field">
                          <label className="cp__label">Model</label>
                          {(() => {
                            const agentProviderInfo = PROVIDERS.find((p) => p.id === agentHeavyProvider)
                            return agentProviderInfo && agentProviderInfo.models.length > 0 ? (
                              <select
                                className="cp__select"
                                value={agentHeavyModel}
                                onChange={(e) => setAgentHeavyModel(e.target.value)}
                              >
                                {agentProviderInfo.models.map((m) => (
                                  <option key={m} value={m}>
                                    {m}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                className="cp__input"
                                value={agentHeavyModel}
                                onChange={(e) => setAgentHeavyModel(e.target.value)}
                                placeholder={PROVIDERS.find((p) => p.id === agentHeavyProvider)?.defaultModel || 'model-name'}
                              />
                            )
                          })()}
                        </div>
                        <button
                          className="cp__verify-btn"
                          onClick={() => handleAgentVerify('heavy')}
                          disabled={verifyState === 'testing'}
                        >
                          {verifyState === 'testing' && verifyingTier === 'heavy' ? '⚙️ 验证中...' : '🔍 验证复杂模型'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="cp__form-actions">
                    <button className="cp__save-btn" onClick={handleSaveAgentConfig}>
                      💾 保存快慢模型
                    </button>
                    <button className="cp__clear-btn" onClick={handleClearAgentConfig}>
                      🗑 清除独立配置
                    </button>
                  </div>
                  {verifyMsg && (
                    <div
                      className={`cp__verify-result ${verifyState === 'success' ? 'cp__verify-result--ok' : verifyState === 'error' ? 'cp__verify-result--fail' : ''}`}
                    >
                      {verifyMsg}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* ═══ IM 渠道 — Telegram Bot ═══ */}
      <CollapsibleSection
        title="IM 渠道 — Telegram"
        defaultOpen={true}
        count={1 + customAgents.filter((a) => a.botToken).length + allExperts.length}
      >
        <div className="cp__channels">
          {/* 全局 Bot */}
          <div className="cp__channel-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="cp__channel-icon">✈️</span>
                <span className="cp__channel-name">全局 BOT</span>
                <StatusBadge
                  status={tgStatus === 'connected' ? 'active' : 'inactive'}
                  label={tgStatus === 'connected' ? '已连接' : '未连接'}
                />
              </div>
              <button
                className="cp__btn"
                disabled={tgConnecting || !tgBotToken.trim()}
                onClick={async () => {
                  setTgConnecting(true)
                  try {
                    setSetting('telegram_bot_token', tgBotToken.trim())
                    const electronAPI = (window as any)?.electronAPI
                    if (tgStatus === 'connected') {
                      await electronAPI?.telegramStop()
                      setTgStatus('disconnected')
                    } else {
                      await electronAPI?.telegramStart()
                      await refreshTgStatus()
                    }
                  } catch {
                    /* ignore */
                  }
                  setTgConnecting(false)
                }}
              >
                {tgConnecting ? '⏳' : tgStatus === 'connected' ? '断开' : '连接'}
              </button>
            </div>
            <input
              className="cp__input"
              type="password"
              placeholder="全局 Bot Token (从 @BotFather 获取)"
              value={tgBotToken}
              onChange={(e) => setTgBotToken(e.target.value)}
              onBlur={() => setSetting('telegram_bot_token', tgBotToken)}
            />
            <div style={{ fontSize: '0.7rem', color: 'var(--hd-text-muted)' }}>
              命令: /ask 关键词 → 知识库 | /search → 网络搜索 | /status → 系统状态 | 其他 → AI 对话
            </div>
          </div>

          <div className="cp__channel-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="cp__channel-icon">👤</span>
                <span className="cp__channel-name">Telegram User Sync</span>
                <StatusBadge
                  status={tgUserSyncStatus?.authorized && tgUserSyncEnabled ? 'active' : 'inactive'}
                  label={tgUserSyncStatus?.authorized && tgUserSyncEnabled ? '用户侧已同步' : '未登录用户侧'}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={tgUserSyncEnabled}
                  onChange={(event) => {
                    const enabled = event.target.checked
                    setTgUserSyncEnabled(enabled)
                    setSetting('telegram_user_sync_enabled', enabled ? 'true' : 'false')
                  }}
                />
                启用用户气泡同步
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input
                className="cp__input"
                placeholder="Telegram API ID"
                value={tgUserApiId}
                onChange={(e) => setTgUserApiId(e.target.value)}
                onBlur={() => setSetting('telegram_user_api_id', tgUserApiId)}
              />
              <input
                className="cp__input"
                type="password"
                placeholder="Telegram API Hash"
                value={tgUserApiHash}
                onChange={(e) => setTgUserApiHash(e.target.value)}
                onBlur={() => setSetting('telegram_user_api_hash', tgUserApiHash)}
              />
              <input
                className="cp__input"
                placeholder="手机号，如 +8613800000000"
                value={tgUserPhone}
                onChange={(e) => setTgUserPhone(e.target.value)}
                onBlur={() => setSetting('telegram_user_phone', tgUserPhone)}
              />
              <button
                className="cp__btn"
                disabled={tgUserSyncBusy || !tgUserApiId.trim() || !tgUserApiHash.trim() || !tgUserPhone.trim()}
                onClick={async () => {
                  setTgUserSyncBusy(true)
                  try {
                    const status = await window.electronAPI?.telegramUserSyncRequestCode?.({
                      apiId: tgUserApiId.trim(),
                      apiHash: tgUserApiHash.trim(),
                      phone: tgUserPhone.trim(),
                      enabled: tgUserSyncEnabled,
                    })
                    if (status) setTgUserSyncStatus(status)
                  } finally {
                    setTgUserSyncBusy(false)
                  }
                }}
              >
                {tgUserSyncBusy ? '发送中...' : '发送登录码'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
              <input
                className="cp__input"
                placeholder="Telegram 登录码"
                value={tgUserCode}
                onChange={(e) => setTgUserCode(e.target.value)}
              />
              <input
                className="cp__input"
                type="password"
                placeholder="2FA 密码（如有）"
                value={tgUserPassword}
                onChange={(e) => setTgUserPassword(e.target.value)}
              />
              <button
                className="cp__btn"
                disabled={tgUserSyncBusy || !tgUserCode.trim()}
                onClick={async () => {
                  setTgUserSyncBusy(true)
                  try {
                    const status = await window.electronAPI?.telegramUserSyncConfirmCode?.({
                      code: tgUserCode.trim(),
                      password: tgUserPassword,
                    })
                    if (status) {
                      setTgUserSyncStatus(status)
                      if (status.authorized) {
                        setTgUserCode('')
                        setTgUserPassword('')
                      }
                    }
                  } finally {
                    setTgUserSyncBusy(false)
                  }
                }}
              >
                确认登录
              </button>
            </div>
            <div style={{ fontSize: '0.7rem', color: tgUserSyncStatus?.error ? 'var(--hd-danger)' : 'var(--hd-text-muted)' }}>
              {tgUserSyncStatus?.error
                ? `用户侧同步错误: ${tgUserSyncStatus.error}`
                : '用途：Openbasaka 的 Boss 输入会用你的 Telegram 用户账号发给对应 bot，Telegram 里就会出现真实用户气泡。'}
            </div>
            <div className="cp__telegram-guide">
              <strong>小白找这些参数：</strong>
              <ol>
                <li>
                  打开 <a href="https://my.telegram.org" target="_blank" rel="noreferrer">my.telegram.org</a>，用你的 Telegram 手机号登录。
                </li>
                <li>进入 API development tools；没有应用就新建一个，App title 和 Short name 随便取一个你能认出的名字。</li>
                <li>页面生成后，把 api_id 填到 Telegram API ID，把 api_hash 填到 Telegram API Hash。</li>
                <li>手机号要带国家区号，例如 +8613800000000；登录码会发到你的 Telegram 官方聊天里，不是短信。</li>
                <li>如果你的 Telegram 开了两步验证，再把那个 2FA 密码填到最后一格。</li>
              </ol>
              <span>Bot Token 是 @BotFather 给 bot 用的；这里的 API ID / Hash 是你的用户账号授权用的，两者不是同一个东西。</span>
            </div>
          </div>

          {/* Agent Bot 管理 */}
          {customAgents.filter((a) => a.botToken).length > 0 && (
            <div style={{ marginTop: 'var(--hd-space-md)' }}>
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--hd-text-secondary)',
                  marginBottom: 'var(--hd-space-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>🤖</span> 自定义 Agent Bot 管理
              </div>
              {customAgents
                .filter((a) => a.botToken)
                .map((agent) => {
                  const botStatus = botStatusList.find((b) => b.agentId === agent.id)
                  const isOnline = botStatus?.running || false
                  const isVerifying = verifyingBot === agent.id
                  const verifyResult = botVerifyResults[agent.id]
                  return (
                    <div
                      key={agent.id}
                      className="cp__channel-card"
                      style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '1.1rem' }}>{agent.icon}</span>
                          <span style={{ fontWeight: 600, color: agent.color }}>{agent.name}</span>
                          <StatusBadge status={isOnline ? 'active' : 'inactive'} label={isOnline ? '在线' : '离线'} />
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="cp__btn"
                            style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                            disabled={isVerifying}
                            onClick={async () => {
                              setVerifyingBot(agent.id)
                              setBotVerifyResults((prev) => {
                                const n = { ...prev }
                                delete n[agent.id]
                                return n
                              })
                              try {
                                const electronAPI = (window as any)?.electronAPI
                                const result = (await electronAPI?.telegramAgentVerify?.(agent.botToken)) as {
                                  ok: boolean
                                  botName?: string
                                  error?: string
                                }
                                setBotVerifyResults((prev) => ({
                                  ...prev,
                                  [agent.id]: result?.ok
                                    ? { ok: true, msg: `验证成功: @${result.botName}` }
                                    : { ok: false, msg: result?.error || '验证失败' },
                                }))
                              } catch (err) {
                                setBotVerifyResults((prev) => ({
                                  ...prev,
                                  [agent.id]: { ok: false, msg: String(err) },
                                }))
                              }
                              setVerifyingBot(null)
                            }}
                          >
                            {isVerifying ? '⏳' : '🔍 验证'}
                          </button>
                          <button
                            className="cp__btn"
                            style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                            onClick={async () => {
                              const electronAPI = (window as any)?.electronAPI
                              if (isOnline) {
                                await electronAPI?.telegramAgentStop?.(agent.id)
                              } else {
                                await electronAPI?.telegramAgentStart?.(agent.id, agent.botToken!, agent.name)
                              }
                              await refreshTgStatus()
                            }}
                          >
                            {isOnline ? '断开' : '连接'}
                          </button>
                        </div>
                      </div>
                      <div
                        style={{ fontFamily: 'var(--hd-font-mono)', fontSize: '0.7rem', color: 'var(--hd-text-muted)' }}
                      >
                        {agent.botToken!.slice(0, 8)}...{agent.botToken!.slice(-4)}
                      </div>
                      {verifyResult && (
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: verifyResult.ok ? 'var(--hd-success)' : 'var(--hd-error)',
                            fontWeight: 600,
                          }}
                        >
                          {verifyResult.ok ? '✓' : '✕'} {verifyResult.msg}
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          )}

          {customAgents.filter((a) => a.botToken).length === 0 && (
            <div style={{ fontSize: '0.75rem', color: 'var(--hd-text-muted)', marginTop: 'var(--hd-space-sm)' }}>
              提示: 在「群策 → 我的 Agent」中为 Agent 配置 Bot Token 后，可在此管理
            </div>
          )}

          {/* ═══ 默认角色 IM 渠道配置 ═══ */}
          <div style={{ marginTop: 'var(--hd-space-md)' }}>
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--hd-text-secondary)',
                marginBottom: 'var(--hd-space-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>◈</span> 默认角色 IM 渠道
            </div>
            {allExperts.map(({ role, config }) => {
              const token = builtInBotTokens[role] || ''
              const hasToken = token.trim().length > 0
              const botStatus = botStatusList.find((b) => b.agentId === role)
              const isOnline = botStatus?.running || false
              const isVerifying = verifyingBot === `builtin_${role}`
              const verifyResult = botVerifyResults[`builtin_${role}`]
              return (
                <div
                  key={role}
                  className="cp__channel-card"
                  style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.1rem' }}>{config.emoji}</span>
                      <span style={{ fontWeight: 600, color: '#00d4aa' }}>{config.name}</span>
                      {hasToken && (
                        <StatusBadge status={isOnline ? 'active' : 'inactive'} label={isOnline ? '在线' : '离线'} />
                      )}
                    </div>
                    {hasToken && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="cp__btn"
                          style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                          disabled={isVerifying}
                          onClick={async () => {
                            setVerifyingBot(`builtin_${role}`)
                            setBotVerifyResults((prev) => {
                              const n = { ...prev }
                              delete n[`builtin_${role}`]
                              return n
                            })
                            try {
                              const electronAPI = (window as any)?.electronAPI
                              const result = (await electronAPI?.telegramAgentVerify?.(token)) as {
                                ok: boolean
                                botName?: string
                                error?: string
                              }
                              setBotVerifyResults((prev) => ({
                                ...prev,
                                [`builtin_${role}`]: result?.ok
                                  ? { ok: true, msg: `验证成功: @${result.botName}` }
                                  : { ok: false, msg: result?.error || '验证失败' },
                              }))
                            } catch (err) {
                              setBotVerifyResults((prev) => ({
                                ...prev,
                                [`builtin_${role}`]: { ok: false, msg: String(err) },
                              }))
                            }
                            setVerifyingBot(null)
                          }}
                        >
                          {isVerifying ? '⏳' : '🔍 验证'}
                        </button>
                        <button
                          className="cp__btn"
                          style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                          onClick={async () => {
                            const electronAPI = (window as any)?.electronAPI
                            if (isOnline) {
                              await electronAPI?.telegramAgentStop?.(role)
                            } else {
                              await electronAPI?.telegramAgentStart?.(role, token, config.name)
                            }
                            await refreshTgStatus()
                          }}
                        >
                          {isOnline ? '断开' : '连接'}
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    className="cp__input"
                    type="password"
                    placeholder={`可选 — 为 ${config.name} 绑定独立 Bot Token`}
                    value={token}
                    onChange={(e) => {
                      setBuiltInBotTokens((prev) => ({ ...prev, [role]: e.target.value }))
                    }}
                    onBlur={() => {
                      saveBuiltInAgentIMConfig(role, token)
                    }}
                  />
                  {hasToken && (
                    <div
                      style={{ fontFamily: 'var(--hd-font-mono)', fontSize: '0.7rem', color: 'var(--hd-text-muted)' }}
                    >
                      {token.slice(0, 8)}...{token.slice(-4)}
                    </div>
                  )}
                  {verifyResult && (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: verifyResult.ok ? 'var(--hd-success)' : 'var(--hd-error)',
                        fontWeight: 600,
                      }}
                    >
                      {verifyResult.ok ? '✓' : '✕'} {verifyResult.msg}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </CollapsibleSection>

      {/* ═══ Skills 管理 ═══ */}
      <CollapsibleSection title={`Skills — ${skillStats.enabled}/${skillStats.total} 启用`} defaultOpen={false}>
        <div className="cp__skills">
          {SKILL_CATEGORIES.map((catMeta) => {
            const catSkills = skillsByCategory.get(catMeta.id)
            if (!catSkills || catSkills.length === 0) return null
            const enabledInCat = catSkills.filter((s) => s.enabled).length
            return (
              <div key={catMeta.id} className="cp__skill-cat">
                <div className="cp__skill-cat-header" onClick={() => toggleCategory(catMeta.id)}>
                  <span className="cp__skill-cat-icon">{catMeta.icon}</span>
                  <span className="cp__skill-cat-name">{catMeta.label}</span>
                  <span className="cp__skill-cat-count">
                    {enabledInCat}/{catSkills.length}
                  </span>
                  <button className="cp__skill-cat-toggle">
                    {enabledInCat === catSkills.length ? '全部禁用' : '全部启用'}
                  </button>
                </div>
                <div className="cp__skill-list">
                  {catSkills.map((skill) => (
                    <div key={skill.id} className={`cp__skill-item ${skill.enabled ? '' : 'cp__skill-item--disabled'}`}>
                      <div className="cp__skill-icon">{skill.icon}</div>
                      <div className="cp__skill-info">
                        <div className="cp__skill-name">
                          {skill.name}
                          <span className={`cp__skill-source cp__skill-source--${skill.source}`}>{skill.source}</span>
                        </div>
                        <div className="cp__skill-desc">{skill.description}</div>
                        {skill.module && <div className="cp__skill-module">{skill.module}</div>}
                        {skill.mcpDeps && skill.mcpDeps.length > 0 && (
                          <div className="cp__skill-deps">
                            需要: {skill.mcpDeps.map((d) => d.replace('mcp-', '')).join(', ')}
                          </div>
                        )}
                      </div>
                      <button
                        className={`cp__toggle ${skill.enabled ? 'cp__toggle--on' : 'cp__toggle--off'}`}
                        onClick={() => toggleSkill(skill.id)}
                      >
                        {skill.enabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </CollapsibleSection>

      {/* ═══ MCP 服务器 ═══ */}
      <CollapsibleSection
        title={`MCP 服务器 — ${mcpStats.online}/${mcpStats.total} 在线 · ${mcpStats.totalTools} 工具可用`}
        defaultOpen={false}
      >
        <div className="cp__mcp">
          <div className="cp__mcp-list">
            {mcpServers.map((server) => (
              <div key={server.id} className={`cp__mcp-card ${server.recommended ? 'cp__mcp-card--recommended' : ''}`}>
                <div className="cp__mcp-header">
                  <div className="cp__mcp-title">
                    <span className="cp__mcp-icon">{server.icon}</span>
                    <span className="cp__mcp-name">{server.name}</span>
                    {server.recommended && <span className="cp__mcp-recommend">推荐</span>}
                  </div>
                  <StatusBadge
                    status={
                      server.status === 'online'
                        ? 'active'
                        : server.status === 'pending'
                          ? 'warning'
                          : server.status === 'error'
                            ? 'error'
                            : 'inactive'
                    }
                    label={
                      server.status === 'online'
                        ? '在线'
                        : server.status === 'pending'
                          ? '启动中'
                          : server.status === 'error'
                            ? '错误'
                            : server.status === 'not-installed'
                              ? '未安装'
                              : '离线'
                    }
                  />
                </div>
                <div className="cp__mcp-desc">{server.description}</div>
                <div className="cp__mcp-meta">
                  <span className="cp__mcp-category">{server.category}</span>
                  <span className="cp__mcp-tools-count">{server.tools} 工具</span>
                  <span className="cp__mcp-command">
                    {server.command} {server.args.join(' ')}
                  </span>
                </div>
                <div className="cp__mcp-install-hint">{server.installHint}</div>
                {Object.keys(server.env).length > 0 && (
                  <div className="cp__mcp-env">
                    {Object.entries(server.env).map(([key, val]) => (
                      <div key={key} className="cp__mcp-env-field">
                        <label className="cp__label">{key}</label>
                        <input
                          className="cp__input"
                          type="password"
                          value={val}
                          placeholder={`输入 ${key}...`}
                          onChange={(e) => {
                            const next = mcpServers.map((s) =>
                              s.id === server.id ? { ...s, env: { ...s.env, [key]: e.target.value } } : s,
                            )
                            setMcpServers(next)
                            saveMCPServers(next)
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className="cp__mcp-actions">
                  {server.status !== 'online' ? (
                    <button
                      className="cp__action-btn"
                      onClick={() => handleMCPStart(server)}
                      disabled={server.status === 'pending'}
                    >
                      {server.status === 'pending' ? '启动中...' : '启动'}
                    </button>
                  ) : (
                    <button className="cp__action-btn" onClick={() => handleMCPStop(server)}>
                      停止
                    </button>
                  )}
                  {![
                    'mcp-fetch',
                    'mcp-filesystem',
                    'mcp-sqlite',
                    'mcp-memory',
                    'mcp-brave-search',
                    'mcp-sequential-thinking',
                    'mcp-context7',
                    'mcp-markitdown',
                    'mcp-exa',
                    'mcp-playwright',
                  ].includes(server.id) && (
                    <button
                      className="cp__action-btn cp__action-btn--danger"
                      onClick={() => removeMCPServer(server.id)}
                    >
                      移除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {showAddMcp ? (
            <div className="cp__mcp-add">
              <div className="cp__field">
                <label className="cp__label">名称</label>
                <input
                  className="cp__input"
                  value={newMcp.name}
                  onChange={(e) => setNewMcp((p) => ({ ...p, name: e.target.value }))}
                  placeholder="My Custom MCP"
                />
              </div>
              <div className="cp__field">
                <label className="cp__label">命令</label>
                <input
                  className="cp__input"
                  value={newMcp.command}
                  onChange={(e) => setNewMcp((p) => ({ ...p, command: e.target.value }))}
                  placeholder="npx"
                />
              </div>
              <div className="cp__field">
                <label className="cp__label">参数</label>
                <input
                  className="cp__input"
                  value={newMcp.args}
                  onChange={(e) => setNewMcp((p) => ({ ...p, args: e.target.value }))}
                  placeholder="-y @anthropic/mcp-server-fetch"
                />
              </div>
              <div className="cp__field">
                <label className="cp__label">描述</label>
                <input
                  className="cp__input"
                  value={newMcp.description}
                  onChange={(e) => setNewMcp((p) => ({ ...p, description: e.target.value }))}
                  placeholder="该服务器提供的功能..."
                />
              </div>
              <div className="cp__mcp-add-actions">
                <button className="cp__save-btn" onClick={addCustomMCPServer}>
                  添加
                </button>
                <button className="cp__action-btn" onClick={() => setShowAddMcp(false)}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button className="cp__add-mcp-btn" onClick={() => setShowAddMcp(true)}>
              + 添加自定义 MCP 服务器
            </button>
          )}
        </div>
      </CollapsibleSection>
    </div>
  )
}
