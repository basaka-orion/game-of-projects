/**
 * Team Store — 团队 CRUD 操作
 */
import { query, run } from '../db/repository'
import { generateId } from '../db/schema'
import {
  AgentCapabilityId,
  Team,
  TeamAction,
  TeamActionRisk,
  TeamActionStatus,
  TeamActionToolId,
  TeamSession,
  TeamType,
  TeamStatus,
  TeamAgent,
  TeamConfig,
} from './types'

/** 创建团队 */
export async function createTeam(params: {
  name: string
  description?: string
  teamType: TeamType
  agents: TeamAgent[]
  projectId?: string
  config?: TeamConfig
}): Promise<string> {
  const id = 'team_' + generateId()
  const config: TeamConfig = params.config || { communicationPattern: 'sequential' }

  await run(
    `INSERT INTO teams (id, name, description, team_type, agents_json, project_id, config_json, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
    [
      id,
      params.name,
      params.description || '',
      params.teamType,
      JSON.stringify(params.agents),
      params.projectId || null,
      JSON.stringify(config),
    ],
  )
  return id
}

/** 获取团队 */
export async function getTeam(id: string): Promise<Team | null> {
  const rows = await query<RawTeamRow>('SELECT * FROM teams WHERE id = ?', [id])
  if (!rows[0]) return null
  return parseTeamRow(rows[0])
}

/** 列出所有团队 */
export async function listTeams(filter?: { teamType?: TeamType; status?: TeamStatus }): Promise<Team[]> {
  let sql = 'SELECT * FROM teams'
  const conditions: string[] = []
  const params: unknown[] = []

  if (filter?.teamType) {
    conditions.push('team_type = ?')
    params.push(filter.teamType)
  }
  if (filter?.status) {
    conditions.push('status = ?')
    params.push(filter.status)
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ')
  }
  sql += ' ORDER BY created_at DESC'

  const rows = await query<RawTeamRow>(sql, params)
  return rows.map(parseTeamRow)
}

/** 更新团队 */
export async function updateTeam(
  id: string,
  updates: Partial<Pick<Team, 'name' | 'description' | 'agents' | 'config' | 'status'>>,
): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) {
    sets.push('name = ?')
    values.push(updates.name)
  }
  if (updates.description !== undefined) {
    sets.push('description = ?')
    values.push(updates.description)
  }
  if (updates.agents !== undefined) {
    sets.push('agents_json = ?')
    values.push(JSON.stringify(updates.agents))
  }
  if (updates.config !== undefined) {
    sets.push('config_json = ?')
    values.push(JSON.stringify(updates.config))
  }
  if (updates.status !== undefined) {
    sets.push('status = ?')
    values.push(updates.status)
  }

  if (sets.length === 0) return
  sets.push("updated_at = datetime('now','localtime')")
  values.push(id)
  await run(`UPDATE teams SET ${sets.join(', ')} WHERE id = ?`, values)
}

/** 删除团队 */
export async function deleteTeam(id: string): Promise<void> {
  await run('DELETE FROM teams WHERE id = ?', [id])
}

/** 创建团队会话 */
export async function createTeamSession(teamId: string, topic: string): Promise<string> {
  const id = 'ts_' + generateId()
  const title = topic.trim().slice(0, 80) || '未命名协作'
  await run(
    `INSERT INTO team_sessions (id, team_id, title, topic, messages_json, summary, tags_json, status)
     VALUES (?, ?, ?, ?, '[]', '', '[]', 'active')`,
    [id, teamId, title, topic],
  )
  return id
}

/** 保存团队会话 */
export async function saveTeamSession(session: TeamSession): Promise<void> {
  await run(
    `UPDATE team_sessions SET title = ?, topic = ?, messages_json = ?, summary = ?, tags_json = ?, is_pinned = ?, is_starred = ?, status = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
    [
      session.title || session.topic.trim().slice(0, 80) || '未命名协作',
      session.topic,
      JSON.stringify(session.messages),
      session.summary,
      JSON.stringify(session.tags || []),
      session.isPinned ? 1 : 0,
      session.isStarred ? 1 : 0,
      session.status,
      session.id,
    ],
  )
}

/** 获取团队会话 */
export async function getTeamSession(id: string): Promise<TeamSession | null> {
  const rows = await query<RawTeamSessionRow>('SELECT * FROM team_sessions WHERE id = ?', [id])
  if (!rows[0]) return null
  return parseTeamSessionRow(rows[0])
}

/** 列出团队协作历史 */
export async function listTeamSessions(filter?: { teamId?: string; limit?: number }): Promise<TeamSession[]> {
  const params: unknown[] = []
  let sql = 'SELECT * FROM team_sessions'
  if (filter?.teamId) {
    sql += ' WHERE team_id = ?'
    params.push(filter.teamId)
  }
  sql += ' ORDER BY is_pinned DESC, is_starred DESC, updated_at DESC, created_at DESC'
  if (filter?.limit) {
    sql += ' LIMIT ?'
    params.push(filter.limit)
  }
  const rows = await query<RawTeamSessionRow>(sql, params)
  return rows.map(parseTeamSessionRow)
}

/** 更新团队协作历史元信息 */
export async function updateTeamSession(
  id: string,
  updates: Partial<Pick<TeamSession, 'title' | 'topic' | 'summary' | 'tags' | 'isPinned' | 'isStarred' | 'status'>>,
): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []

  if (updates.title !== undefined) {
    sets.push('title = ?')
    values.push(updates.title)
  }
  if (updates.topic !== undefined) {
    sets.push('topic = ?')
    values.push(updates.topic)
  }
  if (updates.summary !== undefined) {
    sets.push('summary = ?')
    values.push(updates.summary)
  }
  if (updates.tags !== undefined) {
    sets.push('tags_json = ?')
    values.push(JSON.stringify(updates.tags))
  }
  if (updates.isPinned !== undefined) {
    sets.push('is_pinned = ?')
    values.push(updates.isPinned ? 1 : 0)
  }
  if (updates.isStarred !== undefined) {
    sets.push('is_starred = ?')
    values.push(updates.isStarred ? 1 : 0)
  }
  if (updates.status !== undefined) {
    sets.push('status = ?')
    values.push(updates.status)
  }

  if (sets.length === 0) return
  sets.push("updated_at = datetime('now','localtime')")
  values.push(id)
  await run(`UPDATE team_sessions SET ${sets.join(', ')} WHERE id = ?`, values)
}

/** 删除团队协作历史 */
export async function deleteTeamSession(id: string): Promise<void> {
  await run('DELETE FROM team_sessions WHERE id = ?', [id])
}

/** 创建团队执行动作 */
export async function createTeamAction(
  action: Omit<TeamAction, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<string> {
  const id = action.id || 'ta_' + generateId()
  await run(
    `INSERT INTO team_actions (
      id, session_id, team_id, owner_agent_id, owner_agent_name, capability, tool_id,
      title, description, params_json, risk, requires_approval, status, result_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      action.sessionId,
      action.teamId,
      action.ownerAgentId || '',
      action.ownerAgentName || '',
      action.capability,
      action.toolId,
      action.title,
      action.description,
      JSON.stringify(action.params || {}),
      action.risk,
      action.requiresApproval ? 1 : 0,
      action.status,
      action.result ? JSON.stringify(action.result) : '',
    ],
  )
  return id
}

/** 批量创建团队执行动作 */
export async function createTeamActions(
  actions: Array<Omit<TeamAction, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }>,
): Promise<string[]> {
  const ids: string[] = []
  for (const action of actions) {
    ids.push(await createTeamAction(action))
  }
  return ids
}

/** 列出团队执行动作 */
export async function listTeamActions(filter?: {
  sessionId?: string
  teamId?: string
  status?: TeamActionStatus
  limit?: number
}): Promise<TeamAction[]> {
  const conditions: string[] = []
  const params: unknown[] = []
  let sql = 'SELECT * FROM team_actions'
  if (filter?.sessionId) {
    conditions.push('session_id = ?')
    params.push(filter.sessionId)
  }
  if (filter?.teamId) {
    conditions.push('team_id = ?')
    params.push(filter.teamId)
  }
  if (filter?.status) {
    conditions.push('status = ?')
    params.push(filter.status)
  }
  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ')
  sql += ' ORDER BY created_at ASC'
  if (filter?.limit) {
    sql += ' LIMIT ?'
    params.push(filter.limit)
  }
  const rows = await query<RawTeamActionRow>(sql, params)
  return rows.map(parseTeamActionRow)
}

/** 更新团队执行动作 */
export async function updateTeamAction(
  id: string,
  updates: Partial<
    Pick<
      TeamAction,
      | 'ownerAgentId'
      | 'ownerAgentName'
      | 'capability'
      | 'toolId'
      | 'title'
      | 'description'
      | 'params'
      | 'risk'
      | 'requiresApproval'
      | 'status'
      | 'result'
    >
  >,
): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []

  if (updates.ownerAgentId !== undefined) {
    sets.push('owner_agent_id = ?')
    values.push(updates.ownerAgentId)
  }
  if (updates.ownerAgentName !== undefined) {
    sets.push('owner_agent_name = ?')
    values.push(updates.ownerAgentName)
  }
  if (updates.capability !== undefined) {
    sets.push('capability = ?')
    values.push(updates.capability)
  }
  if (updates.toolId !== undefined) {
    sets.push('tool_id = ?')
    values.push(updates.toolId)
  }
  if (updates.title !== undefined) {
    sets.push('title = ?')
    values.push(updates.title)
  }
  if (updates.description !== undefined) {
    sets.push('description = ?')
    values.push(updates.description)
  }
  if (updates.params !== undefined) {
    sets.push('params_json = ?')
    values.push(JSON.stringify(updates.params))
  }
  if (updates.risk !== undefined) {
    sets.push('risk = ?')
    values.push(updates.risk)
  }
  if (updates.requiresApproval !== undefined) {
    sets.push('requires_approval = ?')
    values.push(updates.requiresApproval ? 1 : 0)
  }
  if (updates.status !== undefined) {
    sets.push('status = ?')
    values.push(updates.status)
  }
  if (updates.result !== undefined) {
    sets.push('result_json = ?')
    values.push(updates.result ? JSON.stringify(updates.result) : '')
  }

  if (sets.length === 0) return
  sets.push("updated_at = datetime('now','localtime')")
  values.push(id)
  await run(`UPDATE team_actions SET ${sets.join(', ')} WHERE id = ?`, values)
}

// ─── 内部 ───

interface RawTeamRow {
  id: string
  name: string
  description: string
  team_type: string
  agents_json: string
  project_id: string | null
  config_json: string
  status: string
  created_at: string
  updated_at: string
}

interface RawTeamSessionRow {
  id: string
  team_id: string
  title?: string
  topic: string
  messages_json: string
  summary: string
  tags_json?: string
  is_pinned?: number
  is_starred?: number
  status: string
  created_at: string
  updated_at: string
}

interface RawTeamActionRow {
  id: string
  session_id: string
  team_id: string
  owner_agent_id?: string
  owner_agent_name?: string
  capability?: string
  tool_id?: string
  title?: string
  description?: string
  params_json?: string
  risk?: string
  requires_approval?: number
  status?: string
  result_json?: string
  created_at: string
  updated_at: string
}

function parseTeamRow(r: RawTeamRow): Team {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    teamType: r.team_type as TeamType,
    agents: JSON.parse(r.agents_json || '[]'),
    projectId: r.project_id || undefined,
    config: JSON.parse(r.config_json || '{"communicationPattern":"sequential"}'),
    status: r.status as TeamStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function safeJsonArray<T>(raw: string | undefined, fallback: T[] = []): T[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? (parsed as T[]) : fallback
  } catch {
    return fallback
  }
}

function safeJsonObject<T extends Record<string, unknown>>(raw: string | undefined, fallback: T): T {
  try {
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : fallback
  } catch {
    return fallback
  }
}

function deriveSessionTags(messages: TeamSession['messages'], tags: string[]): string[] {
  if (tags.length > 0) return tags
  const artifactTags = messages.find((msg) => msg.kind === 'artifact')?.tags || []
  return Array.isArray(artifactTags) ? artifactTags : []
}

function parseTeamSessionRow(r: RawTeamSessionRow): TeamSession {
  const messages = safeJsonArray<TeamSession['messages'][number]>(r.messages_json)
  const tags = deriveSessionTags(messages, safeJsonArray<string>(r.tags_json))
  return {
    id: r.id,
    teamId: r.team_id,
    title: r.title || r.topic.trim().slice(0, 80) || '未命名协作',
    topic: r.topic,
    messages,
    summary: r.summary,
    tags,
    isPinned: Boolean(r.is_pinned),
    isStarred: Boolean(r.is_starred),
    status: r.status as TeamSession['status'],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function parseTeamActionRow(r: RawTeamActionRow): TeamAction {
  return {
    id: r.id,
    sessionId: r.session_id,
    teamId: r.team_id,
    ownerAgentId: r.owner_agent_id || '',
    ownerAgentName: r.owner_agent_name || '群策引擎',
    capability: (r.capability || 'review') as AgentCapabilityId,
    toolId: (r.tool_id || 'manual_review') as TeamActionToolId,
    title: r.title || '未命名动作',
    description: r.description || '',
    params: safeJsonObject<Record<string, unknown>>(r.params_json, {}),
    risk: (r.risk || 'medium') as TeamActionRisk,
    requiresApproval: r.requires_approval !== 0,
    status: (r.status || 'proposed') as TeamActionStatus,
    result: r.result_json ? safeJsonObject<NonNullable<TeamAction['result']>>(r.result_json, undefined as never) : undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
