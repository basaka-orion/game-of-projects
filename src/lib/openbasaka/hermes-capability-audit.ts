import type { OperatingEventRow } from '../db/repository'

export type HermesCapabilityStatus = 'native-strong' | 'native-partial' | 'missing' | 'sidecar'

export interface HermesCapabilityDimension {
  id: string
  label: string
  status: HermesCapabilityStatus
  score: number
  evidence: string[]
  gap: string
  nextAction: string
}

export interface HermesCapabilityAudit {
  verdict: 'partial/native-port' | 'strong/native-port' | 'sidecar-linked' | 'not-started'
  mode: 'openbasaka-native' | 'hermes-sidecar'
  score: number
  summary: string
  claimBoundary: string
  dimensions: HermesCapabilityDimension[]
  nextUpgrade: string
}

export interface HermesCapabilityAuditInput {
  bossMemoryCount: number
  wikiPageCount: number
  wikiSourceCount: number
  skillEvolutionCount: number
  scheduledTaskCount: number
  teamCount: number
  customAgentCount: number
  evolutionEventCount?: number
  openbasakaRuleCount?: number
  openbasakaRuleRunCount?: number
  operatingEvents: OperatingEventRow[]
  hermesSidecarDetected?: boolean
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function statusFor(score: number, sidecar = false): HermesCapabilityStatus {
  if (sidecar) return 'sidecar'
  if (score >= 75) return 'native-strong'
  if (score >= 35) return 'native-partial'
  return 'missing'
}

function hasEvent(events: OperatingEventRow[], signal: string): boolean {
  return events.some((event) =>
    `${event.title}\n${event.summary}\n${event.source_id}\n${event.entities_json}`.toLowerCase().includes(signal.toLowerCase()),
  )
}

function dimension(input: {
  id: string
  label: string
  score: number
  evidence: string[]
  gap: string
  nextAction: string
  sidecar?: boolean
}): HermesCapabilityDimension {
  return {
    id: input.id,
    label: input.label,
    score: clampScore(input.score),
    status: statusFor(input.score, input.sidecar),
    evidence: input.evidence,
    gap: input.gap,
    nextAction: input.nextAction,
  }
}

export function buildHermesCapabilityAudit(input: HermesCapabilityAuditInput): HermesCapabilityAudit {
  const eventCount = input.operatingEvents.length
  const hasTelegram = hasEvent(input.operatingEvents, 'telegram')
  const hasSelfAudit = hasEvent(input.operatingEvents, 'self-audit') || hasEvent(input.operatingEvents, 'nightly')
  const hasRuleRuns = (input.openbasakaRuleRunCount || 0) > 0
  const hasKernelRules = (input.openbasakaRuleCount || 0) > 0

  const dimensions: HermesCapabilityDimension[] = [
    dimension({
      id: 'gateway',
      label: 'Gateway / 多入口',
      score: hasTelegram ? 64 : 38,
      evidence: [hasTelegram ? 'Telegram 入口已有运行痕迹。' : '代码存在 Telegram/Control 入口，但当前证据不足。'],
      gap: '还没有 Hermes 那种统一 InputEvent gateway 把 Web、Telegram、Cron、API 全部归一。',
      nextAction: '所有入口先归一到 OpenbasakaInputEvent，再分发到模块。',
    }),
    dimension({
      id: 'memory',
      label: 'SOUL / MEMORY / Boss 模型',
      score: Math.min(86, 35 + Math.min(input.bossMemoryCount, 1800) / 36 + Math.min(input.wikiPageCount, 3000) / 120),
      evidence: [`${input.bossMemoryCount} 条 Boss memory。`, `${input.wikiPageCount}/${input.wikiSourceCount} Wiki 页面/来源。`],
      gap: '记忆量足够，但需要每次模块动作都把经验回写成可复用规则。',
      nextAction: '把 kernel receipt 与 agent_reflections / skill_evolution 连接。',
    }),
    dimension({
      id: 'skills',
      label: 'Skills / 自我改进',
      score: Math.min(82, 30 + input.skillEvolutionCount * 8 + (input.evolutionEventCount || 0) * 5),
      evidence: [`${input.skillEvolutionCount} 条 skill_evolution。`, `${input.evolutionEventCount || 0} 条 evolution_events。`],
      gap: '已有 skill 记录，但还不是所有功能都会自动沉淀成可调用规则。',
      nextAction: '把高复用 action 转为 openbasaka_rules 和 skill 候选。',
    }),
    dimension({
      id: 'automation',
      label: 'Cron / Routines',
      score: Math.min(84, 28 + input.scheduledTaskCount * 9 + (hasSelfAudit ? 18 : 0)),
      evidence: [`${input.scheduledTaskCount} 个启用定时任务。`, hasSelfAudit ? '系统自省/夜巡已有证据。' : '尚未看到自省夜巡证据。'],
      gap: 'Cron 有基础，但 Webhook/API trigger 与脚本预处理仍缺。',
      nextAction: '第二阶段补 webhook/API trigger 和脚本上下文注入。',
    }),
    dimension({
      id: 'tool-policy',
      label: 'Tool Policy / 安全审批',
      score: hasKernelRules ? 72 : 42,
      evidence: [hasKernelRules ? `${input.openbasakaRuleCount} 条 kernel rules。` : '当前主要依靠分散模块和自省安全策略。'],
      gap: '需要统一的风险分类和审批门，而不是每个模块各自判断。',
      nextAction: '所有模块动作都调用 intelligence-kernel 风险与审批策略。',
    }),
    dimension({
      id: 'receipts',
      label: 'Execution Receipts / 运行账本',
      score: Math.min(90, 34 + eventCount * 2 + (hasRuleRuns ? 18 : 0)),
      evidence: [`${eventCount} 条 operating_events 输入证据。`, hasRuleRuns ? `${input.openbasakaRuleRunCount} 条 rule run。` : 'rule run 尚未形成历史。'],
      gap: 'operating_events 已是正确总账，但 rule decision 也需要可追溯。',
      nextAction: '把 every action -> rule run -> receipt event 作为硬约束。',
    }),
    dimension({
      id: 'doctor',
      label: 'Doctor / 可验证诊断',
      score: hasSelfAudit ? 76 : 48,
      evidence: [hasSelfAudit ? 'System Self Audit 已承担 doctor 职责。' : '有 health/typecheck/build，但 UI doctor 证据不足。'],
      gap: 'Hermes doctor 覆盖配置、模型、gateway、工具连通性；OpenBasaka 需要继续收束到自省页。',
      nextAction: '把 Hermes parity、模型、MCP、cron、gateway、DB 状态放进同一诊断卡。',
    }),
  ]

  const score = clampScore(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length)
  const strongCount = dimensions.filter((item) => item.status === 'native-strong' || item.status === 'sidecar').length
  const verdict = input.hermesSidecarDetected
    ? 'sidecar-linked'
    : score >= 76 && strongCount >= 4
      ? 'strong/native-port'
      : score > 0
        ? 'partial/native-port'
        : 'not-started'

  return {
    verdict,
    mode: input.hermesSidecarDetected ? 'hermes-sidecar' : 'openbasaka-native',
    score,
    summary:
      verdict === 'strong/native-port'
        ? 'OpenBasaka 已经形成 Hermes-native 运行骨架，但仍按原生内核继续增强。'
        : 'OpenBasaka 是 Hermes-inspired / native-port，不应声称直接基于 hermes-agent 运行时。',
    claimBoundary: '不能声称已直接嵌入或 fork hermes-agent；当前目标是原生吸收并超越 Hermes 的主动性与学习闭环。',
    dimensions,
    nextUpgrade:
      verdict === 'strong/native-port'
        ? '补齐 webhook/API trigger、脚本预处理和跨入口连续会话。'
        : '先让全局规则内核覆盖所有模块动作，再补 gateway/webhook/API trigger。',
  }
}
