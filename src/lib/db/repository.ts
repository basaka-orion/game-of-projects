/**
 * 双模式存储层
 * Electron 模式：走 SQLite IPC
 * 浏览器开发模式：走 localStorage fallback
 */
import { generateId } from './schema'
import type { OperatingLoopRecord, OperatingLoopRecordDraft } from '../operating-loop'

const OPERATING_EVENTS_KEY = 'gop_operating_events'
const LOCAL_SQL_TABLE_PREFIX = 'gop_sql_table_'
const LOCAL_SQL_ROW_LIMIT = 1200

type LocalSqlRow = Record<string, unknown>
const memoryLocalStorage = new Map<string, string>()

// ─── 模式检测 ─────────────────────────────────────────────
// 注意：不能在模块顶层固定为 const，因为 Vite dev 模式下
// 渲染进程 JS 可能在 preload 注入 window.electronAPI 之前就加载了。
// 必须在每次调用时动态检查。
function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.dbQuery
}

function canUseLocalStorage(): boolean {
  return true
}

function getLocalStorageApi(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  const storage =
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
      ? window.localStorage
      : typeof globalThis !== 'undefined' && typeof (globalThis as { localStorage?: Storage }).localStorage !== 'undefined'
        ? (globalThis as { localStorage?: Storage }).localStorage
        : null
  if (
    storage &&
    typeof storage.getItem === 'function' &&
    typeof storage.setItem === 'function'
  ) {
    return storage
  }
  return null
}

function localStorageGet(key: string): string | null {
  const storage = getLocalStorageApi()
  if (storage) {
    try {
      return storage.getItem(key)
    } catch {
      return memoryLocalStorage.get(key) ?? null
    }
  }
  return memoryLocalStorage.get(key) ?? null
}

function localStorageSet(key: string, value: string): void {
  const storage = getLocalStorageApi()
  if (storage) {
    try {
      storage.setItem(key, value)
      return
    } catch {
      // fall through to in-memory fallback
    }
  }
  memoryLocalStorage.set(key, value)
}

function loadLocalOperatingEvents(): OperatingEventRow[] {
  if (!canUseLocalStorage()) return []
  try {
    const rows = JSON.parse(localStorageGet(OPERATING_EVENTS_KEY) || '[]') as OperatingEventRow[]
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

function saveLocalOperatingEvents(rows: OperatingEventRow[]) {
  if (!canUseLocalStorage()) return
  localStorageSet(OPERATING_EVENTS_KEY, JSON.stringify(rows.slice(0, 250)))
}

function nowIso(): string {
  return new Date().toISOString()
}

function localSqlTableKey(table: string): string {
  return `${LOCAL_SQL_TABLE_PREFIX}${table}`
}

function safeParseArray<T>(raw: string | null, fallback: T[] = []): T[] {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : fallback
  } catch {
    return fallback
  }
}

function safeParseObject(raw: string | null): Record<string, string> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function projectRowsFromLocalStorage(): LocalSqlRow[] {
  return safeParseArray<{
    id: string
    title: string
    oneLiner?: string
    one_liner?: string
    tags?: string[]
    radar?: unknown
    radar_json?: string
    survivalRate?: number
    survival_rate?: number
    survivalGrade?: string
    survival_grade?: string
    summary?: string
    recommendation?: string
    warLogs?: unknown[]
    war_logs_json?: string
    rawContent?: string
    raw_content?: string
    isPinned?: boolean
    is_pinned?: number
    isStarred?: boolean
    is_starred?: number
    priorityLevel?: string
    priority_level?: string
    createdAt?: string
    created_at?: string
    updatedAt?: string
    updated_at?: string
  }>(localStorageGet('gop_projects')).map((project) => ({
    id: project.id,
    title: project.title || '',
    one_liner: project.one_liner || project.oneLiner || '',
    tags: JSON.stringify(project.tags || []),
    radar_json: project.radar_json || JSON.stringify(project.radar || {}),
    survival_rate: project.survival_rate ?? project.survivalRate ?? 0,
    survival_grade: project.survival_grade || project.survivalGrade || '',
    summary: project.summary || '',
    recommendation: project.recommendation || '',
    war_logs_json: project.war_logs_json || JSON.stringify(project.warLogs || []),
    raw_content: project.raw_content || project.rawContent || '',
    is_pinned: project.is_pinned ?? (project.isPinned ? 1 : 0),
    is_starred: project.is_starred ?? (project.isStarred ? 1 : 0),
    priority_level: project.priority_level || project.priorityLevel || 'normal',
    created_at: project.created_at || project.createdAt || nowIso(),
    updated_at: project.updated_at || project.updatedAt || project.created_at || project.createdAt || nowIso(),
  }))
}

function saveProjectRowsToLocalStorage(rows: LocalSqlRow[]): void {
  const projects = rows.map((row) => ({
    id: String(row.id || ''),
    title: String(row.title || ''),
    oneLiner: String(row.one_liner || ''),
    tags: safeParseArray<string>(String(row.tags || '[]')),
    radar: safeParseObject(String(row.radar_json || '{}')),
    survivalRate: Number(row.survival_rate || 0),
    survivalGrade: String(row.survival_grade || ''),
    summary: String(row.summary || ''),
    recommendation: String(row.recommendation || ''),
    warLogs: safeParseArray(String(row.war_logs_json || '[]')),
    rawContent: String(row.raw_content || ''),
    isPinned: Boolean(row.is_pinned),
    isStarred: Boolean(row.is_starred),
    priorityLevel: String(row.priority_level || 'normal'),
    createdAt: String(row.created_at || nowIso()),
    updatedAt: String(row.updated_at || row.created_at || nowIso()),
  }))
  localStorageSet('gop_projects', JSON.stringify(projects))
}

function loadLocalSqlTable(table: string): LocalSqlRow[] {
  if (!canUseLocalStorage()) return []
  if (table === 'operating_events') return loadLocalOperatingEvents() as unknown as LocalSqlRow[]
  if (table === 'settings') {
    return Object.entries(safeParseObject(localStorageGet('gop_settings'))).map(([key, value]) => ({ key, value }))
  }
  if (table === 'boss_profile') {
    return Object.entries(safeParseObject(localStorageGet('gop_boss_profile'))).map(([key, value]) => ({ key, value }))
  }
  if (table === 'projects') return projectRowsFromLocalStorage()
  return safeParseArray<LocalSqlRow>(localStorageGet(localSqlTableKey(table)))
}

function saveLocalSqlTable(table: string, rows: LocalSqlRow[]): void {
  if (!canUseLocalStorage()) return
  if (table === 'operating_events') {
    saveLocalOperatingEvents(rows as unknown as OperatingEventRow[])
    return
  }
  if (table === 'settings') {
    localStorageSet(
      'gop_settings',
      JSON.stringify(Object.fromEntries(rows.map((row) => [String(row.key || ''), String(row.value || '')]))),
    )
    return
  }
  if (table === 'boss_profile') {
    localStorageSet(
      'gop_boss_profile',
      JSON.stringify(Object.fromEntries(rows.map((row) => [String(row.key || ''), String(row.value || '')]))),
    )
    return
  }
  if (table === 'projects') {
    saveProjectRowsToLocalStorage(rows)
    return
  }
  localStorageSet(localSqlTableKey(table), JSON.stringify(rows.slice(0, LOCAL_SQL_ROW_LIMIT)))
}

function defaultLocalRow(table: string): LocalSqlRow {
  const now = nowIso()
  const defaults: Record<string, LocalSqlRow> = {
    projects: {
      one_liner: '',
      tags: '[]',
      radar_json: '{}',
      survival_rate: 0,
      survival_grade: '',
      summary: '',
      recommendation: '',
      war_logs_json: '[]',
      raw_content: '',
      is_pinned: 0,
      is_starred: 0,
      priority_level: 'normal',
      created_at: now,
      updated_at: now,
    },
    boss_memory: { source: '', confidence: 0.5, created_at: now, updated_at: now },
    boss_decisions: { reasoning: '', created_at: now },
    boss_assessment_runs: {
      source: 'multi_dimension_profiling',
      profile_version: 'v1',
      status: 'completed',
      title: '',
      raw_result_json: '{}',
      normalized_result_json: '{}',
      summary_json: '{}',
      confidence: 0.7,
      created_at: now,
      updated_at: now,
    },
    boss_profile_snapshots: { run_id: null, profile_json: '{}', diff_json: '{}', source: 'profiling_apply', created_at: now },
    project_taxonomy: {
      taxonomy_json: '{}',
      analysis_json: '{}',
      industry: '',
      sub_industry: '',
      innovation_type: 'incremental',
      era_relevance: 50,
      breakthrough_potential: 50,
      created_at: now,
    },
    synapses: { type: '', strength: 0, reason: '', action_items_json: '[]', created_at: now },
    custom_agents: {
      name_en: '',
      icon: '◈',
      avatar_style: 'default',
      system_prompt_en: '',
      temperature: 0.7,
      personality: '',
      skills: '[]',
      color: '#00d4aa',
      soul_json: '',
      memory_json: '',
      bot_token: '',
      platform_config_json: '{}',
      created_at: now,
      updated_at: now,
    },
    agent_souls: { soul_json: '{}', created_at: now, updated_at: now },
    workflows: { name_en: '', steps_json: '[]', agents_json: '[]', status: 'draft', created_at: now, updated_at: now },
    workflow_studio_items: {
      goal: '',
      workflow_type: 'custom',
      team_id: '',
      prompt_template: '',
      steps_json: '[]',
      target_consumers_json: '[]',
      status: 'draft',
      last_test_status: 'idle',
      last_test_input: '',
      last_test_output: '',
      last_optimization_feedback: '',
      last_optimization_output: '',
      published_targets_json: '[]',
      publish_configs_json: '{}',
      created_at: now,
      updated_at: now,
    },
    teams: {
      description: '',
      agents_json: '[]',
      project_id: null,
      config_json: '{}',
      status: 'active',
      created_at: now,
      updated_at: now,
    },
    team_sessions: {
      title: '',
      topic: '',
      messages_json: '[]',
      summary: '',
      tags_json: '[]',
      is_pinned: 0,
      is_starred: 0,
      status: 'active',
      created_at: now,
      updated_at: now,
    },
    team_actions: {
      owner_agent_id: '',
      owner_agent_name: '',
      capability: 'review',
      tool_id: 'manual_review',
      title: '',
      description: '',
      params_json: '{}',
      risk: 'medium',
      requires_approval: 1,
      status: 'proposed',
      result_json: '',
      created_at: now,
      updated_at: now,
    },
    scheduled_tasks: {
      task_config_json: '{}',
      agent_id: '',
      platform_config_json: '[]',
      last_run: '',
      next_run: '',
      enabled: 1,
      created_at: now,
    },
    cron_execution_log: { message: '', duration_ms: 0, created_at: now },
    openbasaka_runs: {
      module_name: '',
      boss_demand: '',
      title: '',
      status: 'queued',
      current_step_id: '',
      result_preview: '',
      error: '',
      created_at: now,
      updated_at: now,
      completed_at: '',
    },
    openbasaka_run_steps: {
      node_id: '',
      target_tab: '',
      title: '',
      detail: '',
      status: 'queued',
      started_at: '',
      completed_at: '',
      output_preview: '',
      order_index: 0,
      metadata_json: '{}',
      created_at: now,
      updated_at: now,
    },
    skill_evolution: { usage_count: 0, success_count: 0, last_used: '', improved_prompt: '', updated_at: now },
  }
  return { ...(defaults[table] || { created_at: now, updated_at: now }) }
}

function splitSqlList(input: string): string[] {
  const out: string[] = []
  let current = ''
  let quote: "'" | '"' | null = null
  let depth = 0
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (quote) {
      current += char
      if (char === quote && input[i - 1] !== '\\') quote = null
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      current += char
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') depth = Math.max(0, depth - 1)
    if (char === ',' && depth === 0) {
      out.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) out.push(current.trim())
  return out
}

function parseSqlLiteral(token: string, params: unknown[], cursor: { value: number }): unknown {
  const trimmed = token.trim()
  if (trimmed === '?') {
    const value = params[cursor.value]
    cursor.value += 1
    return value
  }
  if (/^datetime\s*\(/i.test(trimmed)) return nowIso()
  if (/^null$/i.test(trimmed)) return null
  if (/^''$/.test(trimmed)) return ''
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1).replace(/''/g, "'")
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  return trimmed
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

function sqlTableFrom(sql: string, keyword: 'from' | 'into' | 'update' | 'table'): string | null {
  const patterns = {
    from: /\bfrom\s+([a-z_][a-z0-9_]*)/i,
    into: /\binto\s+([a-z_][a-z0-9_]*)/i,
    update: /^\s*update\s+([a-z_][a-z0-9_]*)/i,
    table: /\btable\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/i,
  }
  return sql.match(patterns[keyword])?.[1] || null
}

function uniqueKeyForTable(table: string): string {
  if (table === 'settings' || table === 'boss_profile') return 'key'
  if (table === 'skill_evolution') return 'skill_id'
  if (table === 'agent_memories') return 'created_at'
  return 'id'
}

function rowMatchesWhere(row: LocalSqlRow, whereSql: string, params: unknown[]): boolean {
  let where = whereSql
    .replace(/\border\s+by\b[\s\S]*$/i, '')
    .replace(/\blimit\b[\s\S]*$/i, '')
    .trim()
  if (!where) return true
  if (where.startsWith('(') && where.endsWith(')')) where = where.slice(1, -1)

  const inMatch = where.match(/^([a-z_][a-z0-9_]*)\s+in\s*\(([^)]*)\)$/i)
  if (inMatch) {
    const values = splitSqlList(inMatch[2]).map((token) => {
      const cursor = { value: 0 }
      return token.trim() === '?' ? params.shift() : parseSqlLiteral(token, [], cursor)
    })
    return values.map(String).includes(String(row[inMatch[1]] ?? ''))
  }

  const orParts = where.split(/\s+or\s+/i)
  if (orParts.length > 1) {
    let offset = 0
    return orParts.some((part) => {
      const consumed = countPlaceholders(part)
      const result = rowMatchesWhere(row, part, params.slice(offset, offset + consumed))
      offset += consumed
      return result
    })
  }

  const andParts = where.split(/\s+and\s+/i)
  if (andParts.length > 1) {
    let offset = 0
    return andParts.every((part) => {
      const consumed = countPlaceholders(part)
      const result = rowMatchesWhere(row, part, params.slice(offset, offset + consumed))
      offset += consumed
      return result
    })
  }

  const equalParam = where.match(/^([a-z_][a-z0-9_]*)\s*=\s*\?$/i)
  if (equalParam) return String(row[equalParam[1]] ?? '') === String(params[0] ?? '')

  const equalLiteral = where.match(/^([a-z_][a-z0-9_]*)\s*=\s*('.*?'|".*?"|[a-z0-9_.-]+)$/i)
  if (equalLiteral) {
    const cursor = { value: 0 }
    return String(row[equalLiteral[1]] ?? '') === String(parseSqlLiteral(equalLiteral[2], [], cursor) ?? '')
  }

  const notEmpty = where.match(/^([a-z_][a-z0-9_]*)\s*!=\s*""$/i)
  if (notEmpty) return String(row[notEmpty[1]] || '') !== ''

  const likeLiteral = where.match(/^([a-z_][a-z0-9_]*)\s+like\s+('.*?'|".*?")$/i)
  if (likeLiteral) {
    const cursor = { value: 0 }
    const pattern = String(parseSqlLiteral(likeLiteral[2], [], cursor) || '')
      .replace(/^%/, '')
      .replace(/%$/, '')
    return pattern ? String(row[likeLiteral[1]] || '').includes(pattern) : true
  }

  if (/^created_at\s*>\s*datetime/i.test(where)) return true
  return false
}

function countPlaceholders(sql: string): number {
  return (sql.match(/\?/g) || []).length
}

function applyOrder(rows: LocalSqlRow[], orderSql: string): LocalSqlRow[] {
  const orderMatch = orderSql.match(/\border\s+by\s+([\s\S]*?)(?:\blimit\b|$)/i)
  if (!orderMatch) return rows
  const parts = splitSqlList(orderMatch[1]).filter((part) => !/^case\b/i.test(part))
  if (parts.length === 0) return rows
  return [...rows].sort((a, b) => {
    for (const part of parts) {
      const match = part.trim().match(/^([a-z_][a-z0-9_\.]*)(?:\s+(asc|desc))?/i)
      if (!match) continue
      const column = match[1].split('.').pop() || match[1]
      const direction = (match[2] || 'asc').toLowerCase() === 'desc' ? -1 : 1
      const av = a[column]
      const bv = b[column]
      const an = typeof av === 'number' ? av : Number(av)
      const bn = typeof bv === 'number' ? bv : Number(bv)
      let cmp = 0
      if (Number.isFinite(an) && Number.isFinite(bn)) cmp = an === bn ? 0 : an > bn ? 1 : -1
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''))
      if (cmp !== 0) return cmp * direction
    }
    return 0
  })
}

function applyLimit(rows: LocalSqlRow[], sql: string, params: unknown[]): LocalSqlRow[] {
  const match = sql.match(/\blimit\s+(\?|\d+)/i)
  if (!match) return rows
  const limit = match[1] === '?' ? Number(params[params.length - 1] ?? rows.length) : Number(match[1])
  return rows.slice(0, Number.isFinite(limit) ? limit : rows.length)
}

function projectColumns(row: LocalSqlRow, columnsSql: string): LocalSqlRow {
  const columns = columnsSql.trim()
  if (columns === '*' || columns.endsWith('.*')) return row
  const out: LocalSqlRow = {}
  for (const raw of splitSqlList(columns)) {
    const part = raw.trim()
    const aliasMatch = part.match(/^count\(\*\)\s+as\s+([a-z_][a-z0-9_]*)$/i)
    if (aliasMatch) {
      out[aliasMatch[1]] = 0
      continue
    }
    const match = part.match(/^([a-z_][a-z0-9_\.]*)(?:\s+as\s+([a-z_][a-z0-9_]*))?$/i)
    if (!match) continue
    const source = match[1].split('.').pop() || match[1]
    out[match[2] || source] = row[source]
  }
  return out
}

function localPragmaTableInfo(table: string): LocalSqlRow[] {
  const columns = Object.keys(defaultLocalRow(table))
  const existing = loadLocalSqlTable(table)[0]
  for (const key of Object.keys(existing || {})) if (!columns.includes(key)) columns.push(key)
  return columns.map((name, index) => ({ cid: index, name, type: 'TEXT', notnull: 0, dflt_value: null, pk: index === 0 ? 1 : 0 }))
}

function localQuery<T = unknown>(sql: string, params: unknown[] = []): T[] {
  if (!canUseLocalStorage()) return []
  const normalized = normalizeSql(sql)
  const pragma = normalized.match(/^pragma\s+table_info\(([^)]+)\)/i)
  if (pragma) return localPragmaTableInfo(pragma[1].trim()) as T[]
  if (/^select\s+name\s+from\s+sqlite_master/i.test(normalized)) {
    return params[0] ? ([{ name: params[0] }] as T[]) : []
  }
  if (/\bunion(?:\s+all)?\b/i.test(normalized)) {
    const parts = normalized.split(/\s+union(?:\s+all)?\s+/i)
    return parts.flatMap((part) => localQuery<T>(part, params))
  }

  const table = sqlTableFrom(normalized, 'from')
  if (!table) return []

  const countAlias = normalized.match(/^select\s+count\(\*\)\s+as\s+([a-z_][a-z0-9_]*)\s+from/i)
  if (countAlias) {
    const where = normalized.match(/\bwhere\s+([\s\S]*?)(?:\border\s+by\b|\blimit\b|$)/i)?.[1] || ''
    const count = loadLocalSqlTable(table).filter((row) => rowMatchesWhere(row, where, [...params])).length
    return [{ [countAlias[1]]: count }] as T[]
  }

  const selectColumns = normalized.match(/^select\s+([\s\S]*?)\s+from/i)?.[1] || '*'
  const where = normalized.match(/\bwhere\s+([\s\S]*?)(?:\border\s+by\b|\blimit\b|$)/i)?.[1] || ''
  let rows = loadLocalSqlTable(table).filter((row) => rowMatchesWhere(row, where, [...params]))
  rows = applyOrder(rows, normalized)
  rows = applyLimit(rows, normalized, params)
  return rows.map((row) => projectColumns(row, selectColumns)) as T[]
}

function localInsert(sql: string, params: unknown[]): boolean {
  const normalized = normalizeSql(sql)
  const match = normalized.match(/^insert\s+(or\s+(replace|ignore)\s+)?into\s+([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*values\s*\(([\s\S]*)\)$/i)
  if (!match) return false
  const mode = (match[2] || '').toLowerCase()
  const table = match[3]
  const columns = splitSqlList(match[4]).map((column) => column.replace(/["`]/g, '').trim())
  const values = splitSqlList(match[5])
  const cursor = { value: 0 }
  const row = { ...defaultLocalRow(table) }
  columns.forEach((column, index) => {
    row[column] = parseSqlLiteral(values[index] || '?', params, cursor)
  })
  if ('updated_at' in row && !row.updated_at) row.updated_at = nowIso()
  if ('created_at' in row && !row.created_at) row.created_at = nowIso()

  const key = uniqueKeyForTable(table)
  const rows = loadLocalSqlTable(table)
  const existingIndex = rows.findIndex((item) => String(item[key] ?? '') === String(row[key] ?? ''))
  if (existingIndex >= 0) {
    if (mode === 'ignore') return true
    rows[existingIndex] = mode === 'replace' ? { ...rows[existingIndex], ...row } : { ...row }
  } else {
    rows.unshift(row)
  }
  saveLocalSqlTable(table, rows)
  return true
}

function localUpdate(sql: string, params: unknown[]): boolean {
  const normalized = normalizeSql(sql)
  const match = normalized.match(/^update\s+([a-z_][a-z0-9_]*)\s+set\s+([\s\S]*?)\s+where\s+([\s\S]*)$/i)
  if (!match) return false
  const table = match[1]
  const setParts = splitSqlList(match[2])
  const cursor = { value: 0 }
  const patch: LocalSqlRow = {}
  for (const part of setParts) {
    const setMatch = part.match(/^([a-z_][a-z0-9_]*)\s*=\s*([\s\S]*)$/i)
    if (!setMatch) continue
    patch[setMatch[1]] = parseSqlLiteral(setMatch[2], params, cursor)
  }
  const whereParams = params.slice(cursor.value)
  const rows = loadLocalSqlTable(table)
  const next = rows.map((row) => (rowMatchesWhere(row, match[3], [...whereParams]) ? { ...row, ...patch } : row))
  saveLocalSqlTable(table, next)
  return true
}

function localDelete(sql: string, params: unknown[]): boolean {
  const normalized = normalizeSql(sql)
  const match = normalized.match(/^delete\s+from\s+([a-z_][a-z0-9_]*)(?:\s+where\s+([\s\S]*))?$/i)
  if (!match) return false
  const table = match[1]
  const where = match[2] || ''
  const rows = where ? loadLocalSqlTable(table).filter((row) => !rowMatchesWhere(row, where, [...params])) : []
  saveLocalSqlTable(table, rows)
  return true
}

function localRun(sql: string, params: unknown[] = []): boolean {
  const normalized = normalizeSql(sql)
  if (/^(create\s+table|create\s+index|alter\s+table|drop\s+index|pragma)\b/i.test(normalized)) {
    const table = sqlTableFrom(normalized, 'table')
    if (table && !localStorageGet(localSqlTableKey(table)) && table !== 'settings' && table !== 'boss_profile' && table !== 'projects') {
      saveLocalSqlTable(table, loadLocalSqlTable(table))
    }
    return true
  }
  return localInsert(normalized, params) || localUpdate(normalized, params) || localDelete(normalized, params)
}

// ─── 底层查询接口 ─────────────────────────────────────────

/** SELECT 查询 */
export async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (isElectron() && window.electronAPI) {
    return window.electronAPI.dbQuery(sql, params) as Promise<T[]>
  }
  return localQuery<T>(sql, params)
}

/** INSERT / UPDATE / DELETE */
export async function run(sql: string, params: unknown[] = []): Promise<void> {
  if (isElectron() && window.electronAPI) {
    return window.electronAPI.dbRun(sql, params)
  }
  if (!localRun(sql, params)) {
    console.warn('[repository] localStorage SQL fallback skipped unsupported run:', sql)
  }
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
    const projectsRaw = localStorageGet('gop_projects')
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
    const settingsRaw = localStorageGet('gop_settings')
    if (settingsRaw) {
      const settings = JSON.parse(settingsRaw) as Record<string, string>
      for (const [key, value] of Object.entries(settings)) {
        if (key !== 'migrated_from_localstorage') {
          await dbSetSetting(key, value)
        }
      }
    }

    // 迁移 Boss Profile
    const bossRaw = localStorageGet('gop_boss_profile')
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
