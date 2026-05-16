import {
  dbListOperatingEvents,
  dbSaveOperatingEvent,
  query,
  run,
  type OperatingEventRow,
} from '../db/repository'

export type OpenbasakaDreamStageId = 'light' | 'rem' | 'deep'

export interface OpenbasakaDreamEvidence {
  id: string
  label: string
  sourceKind: string
  sourceId: string
  text: string
  createdAt?: string
}

export interface OpenbasakaDreamScoreSignals {
  frequency: number
  relevance: number
  diversity: number
  recency: number
  crossDay: number
  conceptRichness: number
}

export interface OpenbasakaDreamCandidate {
  id: string
  title: string
  learnedWhat: string
  score: number
  signals: OpenbasakaDreamScoreSignals
  evidence: OpenbasakaDreamEvidence[]
  nextAction: string
  reusableSteps: string[]
  safetyBoundary: string
}

export interface OpenbasakaDreamStage {
  id: OpenbasakaDreamStageId
  label: string
  score: number
  summary: string
  items: string[]
}

export interface OpenbasakaDreamAppliedWrite {
  kind: 'evolution_event' | 'memory_item' | 'master_skill_pattern' | 'operating_event'
  id: string
  title: string
}

export interface OpenbasakaDreamState {
  id: string
  generatedAt: string
  sourceAuditId: string
  title: string
  summary: string
  diary: string
  stages: OpenbasakaDreamStage[]
  candidates: OpenbasakaDreamCandidate[]
  appliedWrites: OpenbasakaDreamAppliedWrite[]
  nextDreamTopic: string
  safetyBoundary: string
  evidence: OpenbasakaDreamEvidence[]
}

export interface OpenbasakaDreamDiaryCard {
  title: string
  summary: string
  tone: 'good' | 'watch' | 'urgent'
  phaseLines: string[]
  appliedSummary: string
  nextDreamTopic: string
}

export interface OpenbasakaDreamReportContext {
  id: string
  generatedAt: string
  overallScore: number
  headline: string
  domains: Array<{
    id: string
    title: string
    score: number
    summary: string
    evidence: string[]
    risks: string[]
    nextActions: string[]
  }>
  selfRepairPlans: Array<{
    id: string
    title: string
    priority: string
    problem: string
    evidence: string[]
    ownerDomain: string
    targetSubsystem: string
    workflowSteps: string[]
    acceptance: string[]
    status: string
  }>
  learningProgress: {
    score: number
    summary: string
    signals: string[]
  }
  evolutionProgress: {
    score: number
    summary: string
    signals: string[]
  }
  modelRouteHealth: Array<{
    label: string
    status: string
    ok: boolean
    message: string
  }>
}

export interface OpenbasakaDreamCycleOptions {
  report: OpenbasakaDreamReportContext
  now?: Date
  operatingEvents?: OperatingEventRow[]
  evolutionEvents?: EvolutionEventRow[]
  persist?: boolean
}

interface EvolutionEventRow {
  id: string
  source_kind: string
  source_id: string
  event_type: string
  learned_what: string
  evidence_json: string
  confidence: number
  next_action: string
  status: string
  metadata_json: string
  created_at: string
  updated_at: string
}

const OPENBASAKA_DREAM_SOURCE = 'openbasaka-dreaming'
const OPENBASAKA_DREAM_MEMORY_ROOM_ID = 'room_innovation'
const OPENBASAKA_DREAM_SAFETY =
  '做梦只自动写入学习、记忆和进化账本；不自动改代码、不删数据、不改权限、不外发信息。真实修复继续走安全自启和 Boss 确认。'

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function compact(value: string, max = 180): string {
  const text = sanitizeDreamText(String(value || '')).replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function sanitizeDreamText(value: string): string {
  return String(value || '')
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')
    .replace(/[A-Za-z0-9_-]{32,}/g, '***')
    .replace(/api[_ -]?key\s*[:=]\s*[^;\s]+/gi, 'api_key=***')
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function hashText(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function safeParseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || '{}')
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function safeParseArray(value: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : []
  } catch {
    return []
  }
}

function evidenceFromEvent(event: OperatingEventRow, index: number): OpenbasakaDreamEvidence {
  return {
    id: `op-${event.id || index}`,
    label: event.title || event.source_title || '运行记录',
    sourceKind: event.source_kind || event.type || 'operating_event',
    sourceId: event.source_id || event.id,
    text: compact([event.title, event.summary].filter(Boolean).join('｜'), 220),
    createdAt: event.created_at,
  }
}

function evidenceFromEvolution(row: EvolutionEventRow, index: number): OpenbasakaDreamEvidence {
  return {
    id: `evo-${row.id || index}`,
    label: row.event_type || '进化事件',
    sourceKind: row.source_kind || 'evolution_event',
    sourceId: row.source_id || row.id,
    text: compact([row.learned_what, row.next_action].filter(Boolean).join('｜'), 220),
    createdAt: row.updated_at || row.created_at,
  }
}

function evidenceFromReport(report: OpenbasakaDreamReportContext): OpenbasakaDreamEvidence[] {
  const domainEvidence = report.domains.slice(0, 4).map((domain) => ({
    id: `domain-${domain.id}`,
    label: `${domain.title} ${domain.score}分`,
    sourceKind: 'self_audit_domain',
    sourceId: domain.id,
    text: compact([domain.summary, domain.risks[0], domain.nextActions[0]].filter(Boolean).join('｜'), 220),
    createdAt: report.generatedAt,
  }))
  const repairEvidence = report.selfRepairPlans.slice(0, 3).map((plan) => ({
    id: `repair-${plan.id}`,
    label: `${plan.priority} ${plan.title}`,
    sourceKind: 'self_repair_plan',
    sourceId: plan.id,
    text: compact([plan.problem, plan.workflowSteps[0], plan.acceptance[0]].filter(Boolean).join('｜'), 220),
    createdAt: report.generatedAt,
  }))
  return [...domainEvidence, ...repairEvidence]
}

function uniqueStrings(values: string[], limit = 8): string[] {
  return Array.from(new Set(values.map((value) => compact(value, 120)).filter(Boolean))).slice(0, limit)
}

function uniqueDays(evidence: OpenbasakaDreamEvidence[]): number {
  return new Set(evidence.map((item) => (item.createdAt || '').slice(0, 10)).filter(Boolean)).size
}

function recentScore(evidence: OpenbasakaDreamEvidence[], now: Date): number {
  if (evidence.length === 0) return 35
  const newest = evidence
    .map((item) => Date.parse(item.createdAt || ''))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0]
  if (!newest) return 48
  const ageHours = Math.max(0, (now.getTime() - newest) / 3_600_000)
  if (ageHours <= 24) return 95
  if (ageHours <= 72) return 78
  if (ageHours <= 168) return 62
  return 45
}

function conceptRichness(text: string): number {
  const matches = text.match(/Openbasaka|Boss|记忆|Wiki|Agent|自省|夜巡|证据|修复|进化|学习|模型|工作流|群策|安全|沙盘|Hermes|Dream/gi) || []
  return clamp(42 + new Set(matches.map((item) => item.toLowerCase())).size * 7)
}

function scoreCandidate(params: {
  title: string
  text: string
  evidence: OpenbasakaDreamEvidence[]
  relevanceBoost?: number
  now: Date
}): { score: number; signals: OpenbasakaDreamScoreSignals } {
  const sourceKinds = new Set(params.evidence.map((item) => item.sourceKind).filter(Boolean))
  const days = uniqueDays(params.evidence)
  const signals: OpenbasakaDreamScoreSignals = {
    frequency: clamp(42 + params.evidence.length * 8),
    relevance: clamp(68 + (params.relevanceBoost || 0)),
    diversity: clamp(40 + sourceKinds.size * 14),
    recency: recentScore(params.evidence, params.now),
    crossDay: clamp(36 + days * 18),
    conceptRichness: conceptRichness(`${params.title}\n${params.text}`),
  }
  const score = clamp(
    signals.frequency * 0.16 +
    signals.relevance * 0.24 +
    signals.diversity * 0.15 +
    signals.recency * 0.15 +
    signals.crossDay * 0.12 +
    signals.conceptRichness * 0.18,
  )
  return { score, signals }
}

function candidateFromWorstDomain(
  report: OpenbasakaDreamReportContext,
  evidence: OpenbasakaDreamEvidence[],
  now: Date,
): OpenbasakaDreamCandidate | null {
  const domain = [...report.domains].sort((a, b) => a.score - b.score)[0]
  if (!domain) return null
  const domainEvidence = evidence.filter((item) => item.sourceId === domain.id || item.text.includes(domain.title)).slice(0, 7)
  const text = [
    `${domain.title} 是昨夜最值得巩固的系统短板。`,
    domain.summary,
    domain.risks[0],
    domain.nextActions[0],
  ].filter(Boolean).join(' ')
  const { score, signals } = scoreCandidate({
    title: `${domain.title} 梦境巩固`,
    text,
    evidence: domainEvidence.length ? domainEvidence : evidence.slice(0, 6),
    relevanceBoost: domain.id === 'learning_evolution' || domain.id === 'memory_wiki' ? 14 : 8,
    now,
  })
  return {
    id: `dream-domain-${domain.id}`,
    title: `${domain.title} 梦境巩固`,
    learnedWhat: compact(text, 220),
    score,
    signals,
    evidence: domainEvidence.length ? domainEvidence : evidence.slice(0, 6),
    nextAction: compact(domain.nextActions[0] || '下次夜巡继续观察这块是否产生新的执行收据。', 160),
    reusableSteps: uniqueStrings([domain.nextActions[0], ...domain.evidence, ...domain.risks], 4),
    safetyBoundary: OPENBASAKA_DREAM_SAFETY,
  }
}

function candidateFromRepairQueue(
  report: OpenbasakaDreamReportContext,
  evidence: OpenbasakaDreamEvidence[],
  now: Date,
): OpenbasakaDreamCandidate | null {
  const plan = [...report.selfRepairPlans].sort((a, b) => {
    const rank: Record<string, number> = { P0: 0, P1: 1, P2: 2 }
    return (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3)
  })[0]
  if (!plan) return null
  const planEvidence = evidence.filter((item) => item.sourceId === plan.id || item.text.includes(plan.title)).slice(0, 7)
  const text = [
    `系统反复把「${plan.title}」推到修复队列前列。`,
    plan.problem,
    plan.workflowSteps[0],
    plan.acceptance[0],
  ].filter(Boolean).join(' ')
  const { score, signals } = scoreCandidate({
    title: '修复队列梦境巩固',
    text,
    evidence: planEvidence.length ? planEvidence : evidence.slice(0, 6),
    relevanceBoost: plan.priority === 'P0' ? 18 : 10,
    now,
  })
  return {
    id: `dream-repair-${hashText(plan.id).slice(0, 8)}`,
    title: '修复队列梦境巩固',
    learnedWhat: compact(text, 220),
    score,
    signals,
    evidence: planEvidence.length ? planEvidence : evidence.slice(0, 6),
    nextAction: compact(plan.workflowSteps[2] || plan.acceptance[0] || '保持安全边界，先让修复队列产生可验证收据。', 160),
    reusableSteps: uniqueStrings(plan.workflowSteps, 5),
    safetyBoundary: OPENBASAKA_DREAM_SAFETY,
  }
}

function candidateFromRepeatedHistory(
  operatingEvents: OperatingEventRow[],
  evidence: OpenbasakaDreamEvidence[],
  now: Date,
): OpenbasakaDreamCandidate | null {
  if (operatingEvents.length === 0) return null
  const sourceCounts = new Map<string, number>()
  for (const event of operatingEvents) {
    const key = event.source_id || event.source_kind || event.stage
    sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1)
  }
  const [sourceId, count] = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1])[0] || []
  if (!sourceId) return null
  const sourceEvidence = evidence.filter((item) => item.sourceId === sourceId || item.text.includes(sourceId)).slice(0, 8)
  const text = `最近 ${count} 条记录集中在「${sourceId}」，说明系统正在形成一个可被复盘的重复模式。这个模式应该被整理成下一轮操作习惯，而不是每次重新摸索。`
  const { score, signals } = scoreCandidate({
    title: '重复模式梦境巩固',
    text,
    evidence: sourceEvidence.length ? sourceEvidence : evidence.slice(0, 8),
    relevanceBoost: count >= 3 ? 16 : 8,
    now,
  })
  return {
    id: `dream-history-${hashText(sourceId).slice(0, 8)}`,
    title: '重复模式梦境巩固',
    learnedWhat: compact(text, 220),
    score,
    signals,
    evidence: sourceEvidence.length ? sourceEvidence : evidence.slice(0, 8),
    nextAction: '下一次遇到相同来源或阶段时，优先复用已经证明有效的路径，并记录是否减少了摩擦。',
    reusableSteps: [
      '先读取同来源的最近记录。',
      '复用已成功的工具和证据路径。',
      '执行后写回 operating_events，确认这条模式是否仍然有效。',
    ],
    safetyBoundary: OPENBASAKA_DREAM_SAFETY,
  }
}

function candidateFromModelHealth(
  report: OpenbasakaDreamReportContext,
  evidence: OpenbasakaDreamEvidence[],
  now: Date,
): OpenbasakaDreamCandidate | null {
  const badRoute = report.modelRouteHealth.find((item) => !item.ok && item.status !== 'not-checked')
  if (!badRoute) return null
  const text = `模型路由「${badRoute.label}」昨夜状态是 ${badRoute.status}：${badRoute.message}。系统要把“模型不通也不能假装成功”沉淀为长期安全习惯。`
  const { score, signals } = scoreCandidate({
    title: '模型诚实梦境巩固',
    text,
    evidence: evidence.slice(0, 6),
    relevanceBoost: 18,
    now,
  })
  return {
    id: `dream-model-${hashText(badRoute.label).slice(0, 8)}`,
    title: '模型诚实梦境巩固',
    learnedWhat: compact(text, 220),
    score,
    signals,
    evidence: evidence.slice(0, 6),
    nextAction: '以后夜巡必须明确区分深度模型成功、本地 fallback、局部失败和未验证状态。',
    reusableSteps: [
      '先试主模型，再试 fallback。',
      '把失败原因写成 Boss 能看懂的话。',
      '只有数据库收据存在时才声明夜巡成功。',
    ],
    safetyBoundary: OPENBASAKA_DREAM_SAFETY,
  }
}

function buildCandidates(params: {
  report: OpenbasakaDreamReportContext
  operatingEvents: OperatingEventRow[]
  evidence: OpenbasakaDreamEvidence[]
  now: Date
}): OpenbasakaDreamCandidate[] {
  return [
    candidateFromWorstDomain(params.report, params.evidence, params.now),
    candidateFromRepairQueue(params.report, params.evidence, params.now),
    candidateFromRepeatedHistory(params.operatingEvents, params.evidence, params.now),
    candidateFromModelHealth(params.report, params.evidence, params.now),
  ]
    .filter((item): item is OpenbasakaDreamCandidate => Boolean(item))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildStages(params: {
  report: OpenbasakaDreamReportContext
  operatingEvents: OperatingEventRow[]
  evolutionEvents: EvolutionEventRow[]
  candidates: OpenbasakaDreamCandidate[]
  evidence: OpenbasakaDreamEvidence[]
}): OpenbasakaDreamStage[] {
  const replayItems = [
    `${params.operatingEvents.length} 条运行历史被回放。`,
    `${params.evolutionEvents.length} 条进化事件被检查。`,
    `${params.report.selfRepairPlans.length} 条自我修复队列进入梦境。`,
    `模型状态：${params.report.modelRouteHealth.map((item) => `${item.label}=${item.status}`).join('；') || '等夜巡试连'}`,
  ]
  const remItems = params.candidates.length
    ? params.candidates.slice(0, 4).map((item) => `${item.title}｜${item.score}分`)
    : ['历史还不够厚，先把夜巡和执行收据继续攒起来。']
  const applied = params.candidates.filter((item) => item.score >= 72)
  return [
    {
      id: 'light',
      label: 'light｜事实回放',
      score: clamp(45 + Math.min(params.evidence.length, 12) * 4),
      summary: '先把昨夜系统真实发生过的事重新排一遍，不编故事。',
      items: replayItems,
    },
    {
      id: 'rem',
      label: 'REM｜模式联想',
      score: clamp(average(params.candidates.map((item) => item.signals.conceptRichness)) || 52),
      summary: '把重复失败、成功路径、模型诚实和修复摩擦抽成候选学习。',
      items: remItems,
    },
    {
      id: 'deep',
      label: 'deep｜自动巩固',
      score: clamp(average(params.candidates.map((item) => item.score)) || 48),
      summary: applied.length
        ? `有 ${applied.length} 条梦境学习达到深睡阈值，自动写入长期进化账本。`
        : '本轮没有候选达到深睡阈值，只留下梦境日记供下次比较。',
      items: applied.length
        ? applied.map((item) => `${item.title} 已自动生效：${item.learnedWhat}`)
        : ['没有自动生效项。'],
    },
  ]
}

export function createOpenbasakaDreamSeedState(input: {
  sourceAuditId: string
  generatedAt: string
  headline?: string
  nextDreamTopic?: string
}): OpenbasakaDreamState {
  const dateKey = input.generatedAt.slice(0, 10)
  return {
    id: `openbasaka-dream-${dateKey}`,
    generatedAt: input.generatedAt,
    sourceAuditId: input.sourceAuditId,
    title: '昨夜梦境还在等待夜巡',
    summary: input.headline || '等下一次夜巡完成后，系统会把运行历史整理成 light、REM、deep 三段梦境。',
    diary: '还没有新的梦境日记。下一次真实夜巡会自动回放历史、抽取模式，并把高置信学习写入进化账本。',
    stages: [
      {
        id: 'light',
        label: 'light｜事实回放',
        score: 0,
        summary: '等待夜巡收集事实。',
        items: ['还没有开始做梦。'],
      },
      {
        id: 'rem',
        label: 'REM｜模式联想',
        score: 0,
        summary: '等待从历史中抽取模式。',
        items: ['暂无候选学习。'],
      },
      {
        id: 'deep',
        label: 'deep｜自动巩固',
        score: 0,
        summary: '等待高置信梦境自动生效。',
        items: ['暂无自动生效项。'],
      },
    ],
    candidates: [],
    appliedWrites: [],
    nextDreamTopic: input.nextDreamTopic || '下一次夜巡先观察学习、进化和修复队列是否真的产生收据。',
    safetyBoundary: OPENBASAKA_DREAM_SAFETY,
    evidence: [],
  }
}

export function renderDreamDiaryCard(state: OpenbasakaDreamState): OpenbasakaDreamDiaryCard {
  const deepApplied = state.candidates.filter((item) => item.score >= 72).length
  return {
    title: state.title,
    summary: state.summary,
    tone: deepApplied > 0 ? 'good' : state.candidates.length > 0 ? 'watch' : 'urgent',
    phaseLines: state.stages.map((stage) => `${stage.label}：${stage.summary}`),
    appliedSummary: deepApplied > 0
      ? `${deepApplied} 条梦境学习已经自动写入长期进化账本。`
      : '本轮没有自动生效的深睡学习。',
    nextDreamTopic: state.nextDreamTopic,
  }
}

async function loadRecentEvolutionEvents(limit = 40): Promise<EvolutionEventRow[]> {
  try {
    return query<EvolutionEventRow>(
      `SELECT *
         FROM evolution_events
        ORDER BY updated_at DESC
        LIMIT ?`,
      [limit],
    )
  } catch {
    return []
  }
}

async function ensureDreamMemoryRoom(): Promise<void> {
  await run(
    `INSERT OR IGNORE INTO memory_rooms (id, name, description, icon, room_type, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [OPENBASAKA_DREAM_MEMORY_ROOM_ID, 'Innovation Lab', '混合创意和灵感', '*', 'innovation', 3],
  )
}

async function persistEvolutionEvent(
  dream: OpenbasakaDreamState,
  candidate: OpenbasakaDreamCandidate,
): Promise<OpenbasakaDreamAppliedWrite> {
  const id = `evo_dream_${hashText(`${dream.id}:${candidate.id}`)}`
  await run(
    `INSERT OR REPLACE INTO evolution_events
      (id, source_kind, source_id, event_type, learned_what, evidence_json,
       affected_neuron_ids_json, suggested_synapses_json, suggested_skill_pattern_ids_json,
       confidence, next_action, status, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'applied', ?, ?, ?)`,
    [
      id,
      'agent',
      OPENBASAKA_DREAM_SOURCE,
      'dream_consolidation',
      candidate.learnedWhat,
      JSON.stringify(candidate.evidence.map((item) => ({
        id: item.id,
        label: item.label,
        sourceKind: item.sourceKind,
        sourceId: item.sourceId,
        text: item.text,
        createdAt: item.createdAt,
      }))),
      JSON.stringify([]),
      JSON.stringify(candidate.evidence.map((item) => ({
        sourceId: item.sourceId,
        reason: item.label,
      })).slice(0, 6)),
      JSON.stringify([]),
      Math.min(0.95, Math.max(0.72, candidate.score / 100)),
      candidate.nextAction,
      JSON.stringify({
        dreamId: dream.id,
        sourceAuditId: dream.sourceAuditId,
        score: candidate.score,
        signals: candidate.signals,
        safetyBoundary: candidate.safetyBoundary,
      }),
      dream.generatedAt,
      dream.generatedAt,
    ],
  )
  return { kind: 'evolution_event', id, title: candidate.title }
}

async function persistMemoryItem(
  dream: OpenbasakaDreamState,
  candidate: OpenbasakaDreamCandidate,
): Promise<OpenbasakaDreamAppliedWrite> {
  await ensureDreamMemoryRoom()
  const id = `mem_dream_${hashText(`${dream.id}:${candidate.id}`)}`
  await run(
    `INSERT OR REPLACE INTO memory_items
      (id, room_id, type, content, source, importance, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      OPENBASAKA_DREAM_MEMORY_ROOM_ID,
      'openbasaka_dream',
      `${candidate.title}\n\n${candidate.learnedWhat}\n\n下一步：${candidate.nextAction}`,
      OPENBASAKA_DREAM_SOURCE,
      Math.max(60, candidate.score),
      JSON.stringify({
        dreamId: dream.id,
        sourceAuditId: dream.sourceAuditId,
        score: candidate.score,
        evidenceIds: candidate.evidence.map((item) => item.id),
      }),
      dream.generatedAt,
      dream.generatedAt,
    ],
  )
  return { kind: 'memory_item', id, title: candidate.title }
}

async function persistMasterSkillPattern(
  dream: OpenbasakaDreamState,
  candidate: OpenbasakaDreamCandidate,
): Promise<OpenbasakaDreamAppliedWrite> {
  const id = `msp_dream_${hashText(`${dream.id}:${candidate.id}`)}`
  await run(
    `INSERT OR REPLACE INTO master_skill_patterns
      (id, pattern_name, master_name, source_title, source_url, what_it_solves,
       steps_json, when_to_use_json, when_not_to_use_json, related_projects_json,
       related_agents_json, evidence_source_ids_json, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      candidate.title,
      'Openbasaka Dream Cycle',
      dream.title,
      candidate.learnedWhat,
      JSON.stringify(candidate.reusableSteps.slice(0, 6)),
      JSON.stringify(['当 Openbasaka 夜巡发现相同模式、修复队列或证据缺口时使用。']),
      JSON.stringify(['涉及代码、删除、权限、密钥或外发时不能自动执行，只能生成确认卡。']),
      JSON.stringify([]),
      JSON.stringify(['openbasaka-self-audit']),
      JSON.stringify(candidate.evidence.map((item) => item.sourceId).filter(Boolean).slice(0, 8)),
      JSON.stringify({
        dreamId: dream.id,
        sourceAuditId: dream.sourceAuditId,
        score: candidate.score,
        safetyBoundary: candidate.safetyBoundary,
      }),
      dream.generatedAt,
      dream.generatedAt,
    ],
  )
  return { kind: 'master_skill_pattern', id, title: candidate.title }
}

async function persistDreamOperatingEvent(dream: OpenbasakaDreamState): Promise<OpenbasakaDreamAppliedWrite> {
  const id = await dbSaveOperatingEvent({
    id: `op_openbasaka_dream_${dream.generatedAt.slice(0, 10)}`,
    type: 'agent_action',
    stage: 'remember',
    agentId: OPENBASAKA_DREAM_SOURCE,
    title: `梦境日记｜${dream.generatedAt.slice(0, 10)}`,
    status: 'completed',
    createdAt: dream.generatedAt,
    toolRefs: ['operating_events', 'evolution_events', 'memory_items', 'master_skill_patterns'],
    resultPreview: `${dream.title}｜${dream.summary}｜自动生效 ${dream.appliedWrites.filter((item) => item.kind !== 'operating_event').length} 条`,
    source: { kind: 'agent', sourceId: OPENBASAKA_DREAM_SOURCE, title: 'Openbasaka Dream Cycle' },
    confidence: 0.88,
    entities: ['openbasaka', 'dreaming', 'self-audit', 'evolution', 'memory'],
    dreamState: dream,
  } as Parameters<typeof dbSaveOperatingEvent>[0] & { dreamState: OpenbasakaDreamState })
  return { kind: 'operating_event', id, title: dream.title }
}

async function persistDreamState(dream: OpenbasakaDreamState): Promise<OpenbasakaDreamState> {
  const appliedWrites: OpenbasakaDreamAppliedWrite[] = []
  const deepCandidates = dream.candidates.filter((item) => item.score >= 72)
  const masterCandidates = deepCandidates
    .filter((item) => item.score >= 82 && item.reusableSteps.length >= 2)
    .slice(0, 2)

  for (const candidate of deepCandidates) {
    appliedWrites.push(await persistEvolutionEvent(dream, candidate))
    appliedWrites.push(await persistMemoryItem(dream, candidate))
  }
  for (const candidate of masterCandidates) {
    appliedWrites.push(await persistMasterSkillPattern(dream, candidate))
  }

  const withWrites = { ...dream, appliedWrites }
  const receipt = await persistDreamOperatingEvent(withWrites)
  return {
    ...withWrites,
    appliedWrites: [...appliedWrites, receipt],
  }
}

function composeDiary(params: {
  report: OpenbasakaDreamReportContext
  stages: OpenbasakaDreamStage[]
  candidates: OpenbasakaDreamCandidate[]
}): string {
  const strongest = params.candidates[0]
  return [
    `我先在 light 阶段回放了 Openbasaka 的运行历史，没有把未验证的事说成事实。`,
    `进入 REM 后，我把这些记录联想到 ${params.candidates.length} 个可学习模式。`,
    strongest
      ? `最清晰的梦是「${strongest.title}」：${strongest.learnedWhat}`
      : '这次历史还不够厚，所以我只留下观察，不强行写长期记忆。',
    `进入 deep 后，${params.stages.find((stage) => stage.id === 'deep')?.summary || '本轮没有自动生效项。'}`,
    `安全边界：${OPENBASAKA_DREAM_SAFETY}`,
  ].filter(Boolean).join('\n')
}

export async function runOpenbasakaDreamCycle(
  options: OpenbasakaDreamCycleOptions,
): Promise<OpenbasakaDreamState> {
  const now = options.now || new Date()
  const generatedAt = now.toISOString()
  const operatingEvents = options.operatingEvents || await dbListOperatingEvents(120).catch(() => [])
  const evolutionEvents = options.evolutionEvents || await loadRecentEvolutionEvents(40)
  const reportEvidence = evidenceFromReport(options.report)
  const eventEvidence = operatingEvents.slice(0, 24).map(evidenceFromEvent)
  const evolutionEvidence = evolutionEvents.slice(0, 8).map(evidenceFromEvolution)
  const evidence = [...reportEvidence, ...eventEvidence, ...evolutionEvidence]
  const candidates = buildCandidates({
    report: options.report,
    operatingEvents,
    evidence,
    now,
  })
  const stages = buildStages({
    report: options.report,
    operatingEvents,
    evolutionEvents,
    candidates,
    evidence,
  })
  const deepCandidates = candidates.filter((item) => item.score >= 72)
  const title = deepCandidates.length
    ? `昨夜做梦完成｜${deepCandidates.length} 条学习已生效`
    : '昨夜做梦完成｜先留下梦境日记'
  const summary = deepCandidates.length
    ? `light 回放 ${operatingEvents.length} 条历史，REM 找到 ${candidates.length} 个模式，deep 自动巩固 ${deepCandidates.length} 条。`
    : `light 回放 ${operatingEvents.length} 条历史，REM 找到 ${candidates.length} 个模式，本轮 deep 未自动生效。`
  const nextDreamTopic =
    candidates[0]?.nextAction ||
    options.report.selfRepairPlans[0]?.title ||
    '下一次夜巡继续观察学习、进化和修复队列是否真的产生收据。'
  const dream: OpenbasakaDreamState = {
    id: `openbasaka-dream-${localDateKey(now)}`,
    generatedAt,
    sourceAuditId: options.report.id,
    title,
    summary,
    diary: composeDiary({ report: options.report, stages, candidates }),
    stages,
    candidates,
    appliedWrites: [],
    nextDreamTopic,
    safetyBoundary: OPENBASAKA_DREAM_SAFETY,
    evidence,
  }

  if (options.persist === false) return dream
  return persistDreamState(dream)
}

export async function loadOpenbasakaDreamState(): Promise<OpenbasakaDreamState | null> {
  const rows = await query<OperatingEventRow>(
    `SELECT *
       FROM operating_events
      WHERE source_id = ?
      ORDER BY created_at DESC
      LIMIT 1`,
    [OPENBASAKA_DREAM_SOURCE],
  ).catch(() => [])
  const row = rows[0]
  if (!row) return null
  const payload = safeParseObject(row.payload_json)
  const state = payload.dreamState
  if (!state || typeof state !== 'object') return null
  const dream = state as OpenbasakaDreamState
  return {
    ...dream,
    title: compact(dream.title, 120),
    summary: compact(dream.summary, 220),
    diary: sanitizeDreamText(dream.diary || ''),
    candidates: Array.isArray(dream.candidates) ? dream.candidates : [],
    appliedWrites: Array.isArray(dream.appliedWrites) ? dream.appliedWrites : [],
    stages: Array.isArray(dream.stages) ? dream.stages : [],
    evidence: Array.isArray(dream.evidence) ? dream.evidence : [],
  }
}

export function countDreamDeepWrites(state: OpenbasakaDreamState | null | undefined): number {
  if (!state) return 0
  return state.appliedWrites.filter((item) => item.kind === 'evolution_event' || item.kind === 'memory_item').length
}

export function parseDreamEvidenceJson(value: string): Array<Record<string, unknown>> {
  return safeParseArray(value)
}
