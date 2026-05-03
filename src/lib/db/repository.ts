/**
 * 双模式存储层
 * Electron 模式：走 SQLite IPC
 * 浏览器开发模式：走 localStorage fallback
 */
import { generateId } from './schema'
import type { OperatingLoopRecord, OperatingLoopRecordDraft } from '../operating-loop'

const OPERATING_EVENTS_KEY = 'gop_operating_events'

// ─── 模式检测 ─────────────────────────────────────────────
// 注意：不能在模块顶层固定为 const，因为 Vite dev 模式下
// 渲染进程 JS 可能在 preload 注入 window.electronAPI 之前就加载了。
// 必须在每次调用时动态检查。
function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.dbQuery
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function loadLocalOperatingEvents(): OperatingEventRow[] {
  if (!canUseLocalStorage()) return []
  try {
    const rows = JSON.parse(localStorage.getItem(OPERATING_EVENTS_KEY) || '[]') as OperatingEventRow[]
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

function saveLocalOperatingEvents(rows: OperatingEventRow[]) {
  if (!canUseLocalStorage()) return
  localStorage.setItem(OPERATING_EVENTS_KEY, JSON.stringify(rows.slice(0, 250)))
}

// ─── 底层查询接口 ─────────────────────────────────────────

/** SELECT 查询 */
export async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (isElectron() && window.electronAPI) {
    return window.electronAPI.dbQuery(sql, params) as Promise<T[]>
  }
  // localStorage fallback：不支持的查询返回空数组
  console.warn('[repository] localStorage mode does not support SQL queries:', sql)
  return []
}

/** INSERT / UPDATE / DELETE */
export async function run(sql: string, params: unknown[] = []): Promise<void> {
  if (isElectron() && window.electronAPI) {
    return window.electronAPI.dbRun(sql, params)
  }
  console.warn('[repository] localStorage mode does not support SQL run:', sql)
}

// ─── Operating Loop Event Ledger ───────────────────────────

export interface OperatingEventRow {
  id: string
  type: OperatingLoopRecord['type']
  stage: OperatingLoopRecord['stage']
  title: string
  summary: string
  source_kind: string
  source_id: string
  source_title: string
  confidence: number | null
  entities_json: string
  project_ids_json: string
  payload_json: string
  created_at: string
  updated_at: string
}

function normalizeCreatedAt(value?: string): string {
  return value || new Date().toISOString()
}

function operatingEventTitle(record: OperatingLoopRecord): string {
  switch (record.type) {
    case 'input_event':
    case 'knowledge_source':
    case 'project_signal':
    case 'agent_action':
      return record.title
    case 'memory_candidate':
      return record.content.slice(0, 42) || record.category
    case 'boss_signal':
      return record.summary.slice(0, 42) || record.signalKind
  }
}

function operatingEventSummary(record: OperatingLoopRecord): string {
  switch (record.type) {
    case 'input_event':
      return record.contentPreview
    case 'memory_candidate':
      return record.archiveReason || record.content
    case 'boss_signal':
      return record.summary
    case 'knowledge_source':
      return `${record.status}${record.scope ? ` · ${record.scope}` : ''}`
    case 'project_signal':
      return record.nextStep || record.signalKind
    case 'agent_action':
      return record.resultPreview || record.status
  }
}

function toOperatingEventRow(record: OperatingLoopRecord): OperatingEventRow {
  return {
    id: record.id,
    type: record.type,
    stage: record.stage,
    title: operatingEventTitle(record),
    summary: operatingEventSummary(record),
    source_kind: record.source?.kind || '',
    source_id: record.source?.sourceId || '',
    source_title: record.source?.title || '',
    confidence: record.confidence ?? null,
    entities_json: JSON.stringify(record.entities || []),
    project_ids_json: JSON.stringify(record.projectIds || []),
    payload_json: JSON.stringify(record),
    created_at: record.createdAt,
    updated_at: new Date().toISOString(),
  }
}

export async function dbSaveOperatingEvent(draft: OperatingLoopRecordDraft): Promise<string> {
  const record = {
    ...draft,
    id: draft.id || generateId(),
    createdAt: normalizeCreatedAt(draft.createdAt),
  } as OperatingLoopRecord
  const row = toOperatingEventRow(record)

  if (isElectron()) {
    await run(
      `INSERT OR REPLACE INTO operating_events
       (id, type, stage, title, summary, source_kind, source_id, source_title, confidence,
        entities_json, project_ids_json, payload_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.type,
        row.stage,
        row.title,
        row.summary,
        row.source_kind,
        row.source_id,
        row.source_title,
        row.confidence,
        row.entities_json,
        row.project_ids_json,
        row.payload_json,
        row.created_at,
        row.updated_at,
      ],
    )
    return row.id
  }

  const rows = loadLocalOperatingEvents()
  const withoutCurrent = rows.filter((item) => item.id !== row.id)
  saveLocalOperatingEvents([row, ...withoutCurrent].sort((a, b) => b.created_at.localeCompare(a.created_at)))
  return row.id
}

export async function dbListOperatingEvents(limit = 30): Promise<OperatingEventRow[]> {
  if (isElectron()) {
    return query<OperatingEventRow>('SELECT * FROM operating_events ORDER BY created_at DESC LIMIT ?', [limit])
  }
  return loadLocalOperatingEvents()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
}

// ─── 项目 CRUD ─────────────────────────────────────────────

export interface ProjectRow {
  id: string
  title: string
  one_liner: string
  tags: string
  radar_json: string
  survival_rate: number
  survival_grade: string
  summary: string
  recommendation: string
  war_logs_json: string
  raw_content: string
  is_pinned: number
  is_starred: number
  priority_level: string
  created_at: string
  updated_at: string
}

export async function dbSaveProject(project: {
  id?: string
  title: string
  oneLiner: string
  tags: string[]
  radar: unknown
  survivalRate: number
  survivalGrade: string
  summary: string
  recommendation: string
  warLogs: unknown[]
  rawContent: string
  isPinned?: boolean
  isStarred?: boolean
  priorityLevel?: string
}): Promise<string> {
  const id = project.id || generateId()
  const now = new Date().toISOString()

  await run(
    `INSERT OR REPLACE INTO projects
     (id, title, one_liner, tags, radar_json, survival_rate, survival_grade,
      summary, recommendation, war_logs_json, raw_content, is_pinned, is_starred, priority_level, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      project.title,
      project.oneLiner,
      JSON.stringify(project.tags),
      JSON.stringify(project.radar),
      project.survivalRate,
      project.survivalGrade,
      project.summary,
      project.recommendation,
      JSON.stringify(project.warLogs),
      project.rawContent,
      project.isPinned ? 1 : 0,
      project.isStarred ? 1 : 0,
      project.priorityLevel || 'normal',
      now,
      now,
    ],
  )
  try {
    await dbSaveOperatingEvent({
      id: `op_project_${id}`,
      type: 'project_signal',
      stage: 'simulate',
      projectId: id,
      projectIds: [id],
      title: project.title,
      signalKind: 'decision',
      nextStep: project.recommendation || project.summary || project.oneLiner,
      confidence: project.survivalRate ? Math.max(0, Math.min(1, project.survivalRate / 100)) : undefined,
      source: { kind: 'project', sourceId: id, title: project.title },
    })
  } catch {
    // Event ledger should not block the primary write path.
  }
  return id
}

export async function dbGetAllProjects(): Promise<ProjectRow[]> {
  return query<ProjectRow>(
    `SELECT * FROM projects
     ORDER BY is_pinned DESC,
       CASE priority_level WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'normal' THEN 2 WHEN 'low' THEN 1 ELSE 2 END DESC,
       is_starred DESC,
       updated_at DESC`,
  )
}

export async function dbGetProject(id: string): Promise<ProjectRow | undefined> {
  const rows = await query<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id])
  return rows[0]
}

export async function dbDeleteProject(id: string): Promise<void> {
  await run('DELETE FROM projects WHERE id = ?', [id])
}

export async function dbUpdateProject(
  id: string,
  updates: Partial<
    Pick<
      import('./store').StoredProject,
      'title' | 'oneLiner' | 'tags' | 'summary' | 'recommendation' | 'isPinned' | 'isStarred' | 'priorityLevel'
    >
  >,
): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = []

  if (updates.title !== undefined) {
    sets.push('title = ?')
    params.push(updates.title)
  }
  if (updates.oneLiner !== undefined) {
    sets.push('one_liner = ?')
    params.push(updates.oneLiner)
  }
  if (updates.tags !== undefined) {
    sets.push('tags = ?')
    params.push(JSON.stringify(updates.tags))
  }
  if (updates.summary !== undefined) {
    sets.push('summary = ?')
    params.push(updates.summary)
  }
  if (updates.recommendation !== undefined) {
    sets.push('recommendation = ?')
    params.push(updates.recommendation)
  }
  if (updates.isPinned !== undefined) {
    sets.push('is_pinned = ?')
    params.push(updates.isPinned ? 1 : 0)
  }
  if (updates.isStarred !== undefined) {
    sets.push('is_starred = ?')
    params.push(updates.isStarred ? 1 : 0)
  }
  if (updates.priorityLevel !== undefined) {
    sets.push('priority_level = ?')
    params.push(updates.priorityLevel)
  }

  if (sets.length === 0) return
  sets.push("updated_at = datetime('now','localtime')")
  params.push(id)
  await run(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, params)
}

// ─── Boss Profile ───────────────────────────────────────────

export async function dbGetBossProfile(): Promise<Record<string, string>> {
  const rows = await query<{ key: string; value: string }>('SELECT key, value FROM boss_profile')
  const profile: Record<string, string> = {}
  for (const row of rows) {
    profile[row.key] = row.value
  }
  return profile
}

export async function dbSetBossProfile(profile: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(profile)) {
    await run('INSERT OR REPLACE INTO boss_profile (key, value) VALUES (?, ?)', [key, value])
  }
}

// ─── Settings ───────────────────────────────────────────────

export async function dbGetSetting(key: string, fallback = ''): Promise<string> {
  const rows = await query<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
  return rows[0]?.value ?? fallback
}

export async function dbSetSetting(key: string, value: string): Promise<void> {
  await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value])
}

// ─── Conversations ──────────────────────────────────────────

export interface ConversationRow {
  id: string
  title: string
  messages_json: string
  context_type: string
  created_at: string
  updated_at: string
}

export async function dbSaveConversation(
  id: string,
  messages: unknown[],
  contextType = 'openbasaka',
  title = '',
): Promise<void> {
  const now = new Date().toISOString()
  await run(
    `INSERT OR REPLACE INTO conversations (id, title, messages_json, context_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, title, JSON.stringify(messages), contextType, now, now],
  )
  try {
    const latest = messages[messages.length - 1] as { content?: unknown; role?: unknown } | undefined
    const latestContent = typeof latest?.content === 'string' ? latest.content : ''
    await dbSaveOperatingEvent({
      id: `op_conversation_${id}`,
      type: 'input_event',
      stage: 'capture',
      inputKind: contextType === 'openbasaka' ? 'conversation' : 'manual_note',
      title: title || `Openbasaka 对话 ${messages.length} 条`,
      contentPreview: latestContent.slice(0, 180) || `${messages.length} 条消息已进入捕获层`,
      source: { kind: 'conversation', sourceId: id, title: title || contextType },
      confidence: 0.8,
    })
  } catch {
    // Event ledger should not block the primary write path.
  }
}

export async function dbLoadConversation(id: string): Promise<unknown[]> {
  const rows = await query<ConversationRow>('SELECT messages_json FROM conversations WHERE id = ?', [id])
  if (rows[0]?.messages_json) {
    try {
      return JSON.parse(rows[0].messages_json)
    } catch {
      return []
    }
  }
  return []
}

export async function dbListConversations(): Promise<ConversationRow[]> {
  return query<ConversationRow>('SELECT * FROM conversations ORDER BY updated_at DESC')
}

// ─── Boss Decisions ─────────────────────────────────────────

export async function dbSaveDecision(
  projectId: string,
  decisionType: 'pursue' | 'pivot' | 'abandon' | 'archive',
  reasoning = '',
): Promise<string> {
  const id = generateId()
  await run('INSERT INTO boss_decisions (id, project_id, decision_type, reasoning) VALUES (?, ?, ?, ?)', [
    id,
    projectId,
    decisionType,
    reasoning,
  ])
  try {
    await dbSaveOperatingEvent({
      id: `op_decision_${id}`,
      type: 'project_signal',
      stage: 'simulate',
      projectId,
      projectIds: projectId ? [projectId] : [],
      title: `Boss 决策：${decisionType}`,
      signalKind: 'decision',
      nextStep: reasoning,
      source: { kind: 'project', sourceId: projectId, title: 'Boss decision' },
      confidence: 0.86,
    })
  } catch {
    // Event ledger should not block the primary write path.
  }
  return id
}

export async function dbGetDecisions(projectId?: string): Promise<unknown[]> {
  if (projectId) {
    return query('SELECT * FROM boss_decisions WHERE project_id = ? ORDER BY created_at DESC', [projectId])
  }
  return query('SELECT * FROM boss_decisions ORDER BY created_at DESC')
}

// ─── Boss Memory ────────────────────────────────────────────

export async function dbSaveMemory(
  category: 'preference' | 'pattern' | 'insight' | 'correction' | 'goal' | 'emotion',
  content: string,
  source = '',
  confidence = 0.5,
): Promise<string> {
  const id = generateId()
  await run('INSERT INTO boss_memory (id, category, content, source, confidence) VALUES (?, ?, ?, ?, ?)', [
    id,
    category,
    content,
    source,
    confidence,
  ])
  try {
    await dbSaveOperatingEvent({
      id: `op_memory_${id}`,
      type: 'memory_candidate',
      stage: 'remember',
      category: category === 'goal' ? 'preference' : category === 'emotion' ? 'preference' : 'boss',
      content,
      archiveReason: source || `Boss ${category} 记忆已沉淀`,
      status: 'confirmed',
      source: { kind: 'manual', sourceId: id, title: source || 'boss_memory' },
      confidence,
    })
  } catch {
    // Event ledger should not block the primary write path.
  }
  return id
}

export async function dbGetMemories(category?: string, limit = 50): Promise<unknown[]> {
  if (category) {
    return query('SELECT * FROM boss_memory WHERE category = ? ORDER BY confidence DESC, updated_at DESC LIMIT ?', [
      category,
      limit,
    ])
  }
  return query('SELECT * FROM boss_memory ORDER BY confidence DESC, updated_at DESC LIMIT ?', [limit])
}

// ─── Boss Profiling ────────────────────────────────────────

export interface BossAssessmentRunRow {
  id: string
  source: string
  profile_version: string
  mode: 'quick' | 'deep' | 'dialogue'
  status: 'draft' | 'running' | 'completed' | 'failed'
  title: string
  raw_result_json: string
  normalized_result_json: string
  summary_json: string
  confidence: number
  created_at: string
  updated_at: string
}

export interface BossProfileSnapshotRow {
  id: string
  run_id: string | null
  profile_json: string
  diff_json: string
  source: string
  created_at: string
}

export async function dbSaveBossAssessmentRun(runData: {
  id?: string
  source?: string
  profileVersion?: string
  mode: 'quick' | 'deep' | 'dialogue'
  status?: 'draft' | 'running' | 'completed' | 'failed'
  title?: string
  rawResult: unknown
  normalizedResult: unknown
  summary: unknown
  confidence?: number
}): Promise<string> {
  const id = runData.id || generateId()
  const now = new Date().toISOString()
  await run(
    `INSERT OR REPLACE INTO boss_assessment_runs
     (id, source, profile_version, mode, status, title, raw_result_json, normalized_result_json, summary_json, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      runData.source || 'multi_dimension_profiling',
      runData.profileVersion || 'v1',
      runData.mode,
      runData.status || 'completed',
      runData.title || '',
      JSON.stringify(runData.rawResult),
      JSON.stringify(runData.normalizedResult),
      JSON.stringify(runData.summary),
      runData.confidence ?? 0.7,
      now,
      now,
    ],
  )
  try {
    await dbSaveOperatingEvent({
      id: `op_assessment_${id}`,
      type: 'boss_signal',
      stage: 'understand',
      signalKind: 'cognitive_style',
      summary: runData.title || `${runData.mode} 画像测评已记录`,
      profileImpact: 'medium',
      source: { kind: 'manual', sourceId: id, title: runData.source || 'boss_assessment_run' },
      confidence: runData.confidence ?? 0.7,
    })
  } catch {
    // Event ledger should not block the primary write path.
  }
  return id
}

export async function dbGetBossAssessmentRun(id: string): Promise<BossAssessmentRunRow | undefined> {
  const rows = await query<BossAssessmentRunRow>('SELECT * FROM boss_assessment_runs WHERE id = ? LIMIT 1', [id])
  return rows[0]
}

export async function dbGetLatestBossAssessmentRun(): Promise<BossAssessmentRunRow | undefined> {
  const rows = await query<BossAssessmentRunRow>('SELECT * FROM boss_assessment_runs ORDER BY created_at DESC LIMIT 1')
  return rows[0]
}

export async function dbListBossAssessmentRuns(limit = 20): Promise<BossAssessmentRunRow[]> {
  return query<BossAssessmentRunRow>('SELECT * FROM boss_assessment_runs ORDER BY created_at DESC LIMIT ?', [limit])
}

export async function dbSaveBossProfileSnapshot(snapshot: {
  id?: string
  runId?: string | null
  profile: unknown
  diff: unknown
  source?: string
}): Promise<string> {
  const id = snapshot.id || generateId()
  await run(
    `INSERT OR REPLACE INTO boss_profile_snapshots
     (id, run_id, profile_json, diff_json, source)
     VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      snapshot.runId || null,
      JSON.stringify(snapshot.profile),
      JSON.stringify(snapshot.diff),
      snapshot.source || 'profiling_apply',
    ],
  )
  try {
    await dbSaveOperatingEvent({
      id: `op_profile_snapshot_${id}`,
      type: 'boss_signal',
      stage: 'understand',
      signalKind: 'cognitive_style',
      summary: 'Boss 生效画像快照已更新',
      profileImpact: 'high',
      source: { kind: 'manual', sourceId: id, title: snapshot.source || 'profiling_apply' },
      confidence: 0.82,
    })
  } catch {
    // Event ledger should not block the primary write path.
  }
  return id
}

export async function dbGetLatestBossProfileSnapshot(): Promise<BossProfileSnapshotRow | undefined> {
  const rows = await query<BossProfileSnapshotRow>(
    'SELECT * FROM boss_profile_snapshots ORDER BY created_at DESC LIMIT 1',
  )
  return rows[0]
}

export async function dbListBossProfileSnapshots(limit = 12): Promise<BossProfileSnapshotRow[]> {
  return query<BossProfileSnapshotRow>('SELECT * FROM boss_profile_snapshots ORDER BY created_at DESC LIMIT ?', [limit])
}

// ─── Project Taxonomy ───────────────────────────────────────

export interface TaxonomyRow {
  id: string
  project_id: string
  taxonomy_json: string
  analysis_json: string
  industry: string
  sub_industry: string
  innovation_type: string
  era_relevance: number
  breakthrough_potential: number
  created_at: string
}

export async function dbSaveTaxonomy(
  projectId: string,
  taxonomy: unknown,
  analysis: unknown,
  industry: string,
  subIndustry: string,
  innovationType: string,
  eraRelevance: number,
  breakthroughPotential: number,
): Promise<string> {
  const id = generateId()
  await run(
    `INSERT OR REPLACE INTO project_taxonomy
     (id, project_id, taxonomy_json, analysis_json, industry, sub_industry, innovation_type, era_relevance, breakthrough_potential)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      projectId,
      JSON.stringify(taxonomy),
      JSON.stringify(analysis),
      industry,
      subIndustry,
      innovationType,
      eraRelevance,
      breakthroughPotential,
    ],
  )
  return id
}

export async function dbGetTaxonomy(projectId: string): Promise<TaxonomyRow | undefined> {
  const rows = await query<TaxonomyRow>('SELECT * FROM project_taxonomy WHERE project_id = ?', [projectId])
  return rows[0]
}

export async function dbGetAllTaxonomies(): Promise<TaxonomyRow[]> {
  return query<TaxonomyRow>('SELECT t.* FROM project_taxonomy t ORDER BY t.created_at DESC')
}

// ─── Synapses ────────────────────────────────────────────────

export interface SynapseRow {
  id: string
  source_id: string
  target_id: string
  type: string
  strength: number
  reason: string
  action_items_json: string
  created_at: string
}

export async function dbSaveSynapse(
  sourceId: string,
  targetId: string,
  type: string,
  strength: number,
  reason: string,
  actionItems: string[],
): Promise<string> {
  const id = generateId()
  await run(
    `INSERT OR REPLACE INTO synapses (id, source_id, target_id, type, strength, reason, action_items_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, sourceId, targetId, type, strength, reason, JSON.stringify(actionItems)],
  )
  try {
    await dbSaveOperatingEvent({
      id: `op_synapse_${id}`,
      type: 'project_signal',
      stage: 'simulate',
      projectId: sourceId,
      projectIds: [sourceId, targetId],
      title: `项目突触：${type}`,
      signalKind: 'synapse',
      nextStep: reason || actionItems[0] || '',
      source: { kind: 'project', sourceId, title: 'synapse' },
      confidence: Math.max(0, Math.min(1, strength / 100)),
    })
  } catch {
    // Event ledger should not block the primary write path.
  }
  return id
}

export async function dbGetAllSynapses(): Promise<SynapseRow[]> {
  return query<SynapseRow>('SELECT * FROM synapses ORDER BY strength DESC')
}

export async function dbGetSynapsesForProject(projectId: string): Promise<SynapseRow[]> {
  return query<SynapseRow>('SELECT * FROM synapses WHERE source_id = ? OR target_id = ? ORDER BY strength DESC', [
    projectId,
    projectId,
  ])
}

export async function dbDeleteAllSynapses(): Promise<void> {
  await run('DELETE FROM synapses')
}

// ─── Migration ──────────────────────────────────────────────

/** 检查是否已迁移 */
export async function isMigrated(): Promise<boolean> {
  const val = await dbGetSetting('migrated_from_localstorage')
  return val === 'true'
}

/** 标记已迁移 */
export async function markMigrated(): Promise<void> {
  await dbSetSetting('migrated_from_localstorage', 'true')
}

/** 将 localStorage 数据迁移到 SQLite */
export async function migrateFromLocalStorage(): Promise<boolean> {
  if (!isElectron()) return false

  const already = await isMigrated()
  if (already) return true

  try {
    // 迁移项目
    const projectsRaw = localStorage.getItem('gop_projects')
    if (projectsRaw) {
      const projects = JSON.parse(projectsRaw) as Array<{
        id: string
        title: string
        oneLiner: string
        tags: string[]
        radar: unknown
        survivalRate: number
        survivalGrade: string
        summary: string
        recommendation: string
        warLogs: unknown[]
        rawContent: string
        createdAt: string
      }>
      for (const p of projects) {
        await dbSaveProject({
          id: p.id,
          title: p.title,
          oneLiner: p.oneLiner,
          tags: p.tags,
          radar: p.radar,
          survivalRate: p.survivalRate,
          survivalGrade: p.survivalGrade,
          summary: p.summary,
          recommendation: p.recommendation,
          warLogs: p.warLogs,
          rawContent: p.rawContent,
        })
      }
    }

    // 迁移设置
    const settingsRaw = localStorage.getItem('gop_settings')
    if (settingsRaw) {
      const settings = JSON.parse(settingsRaw) as Record<string, string>
      for (const [key, value] of Object.entries(settings)) {
        if (key !== 'migrated_from_localstorage') {
          await dbSetSetting(key, value)
        }
      }
    }

    // 迁移 Boss Profile
    const bossRaw = localStorage.getItem('gop_boss_profile')
    if (bossRaw) {
      const profile = JSON.parse(bossRaw) as Record<string, string>
      await dbSetBossProfile(profile)
    }

    await markMigrated()
    return true
  } catch (err) {
    console.error('[repository] Migration failed:', err)
    return false
  }
}
