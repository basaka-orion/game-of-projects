/**
 * Team Store — 团队 CRUD 操作
 */
import { query, run } from '../db/repository'
import { generateId } from '../db/schema'
import { Team, TeamSession, TeamType, TeamStatus, TeamAgent, TeamConfig } from './types'

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
    ]
  )
  return id
}

/** 获取团队 */
export async function getTeam(id: string): Promise<Team | null> {
  const rows = await query<RawTeamRow>(
    'SELECT * FROM teams WHERE id = ?',
    [id]
  )
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
export async function updateTeam(id: string, updates: Partial<Pick<Team, 'name' | 'description' | 'agents' | 'config' | 'status'>>): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name) }
  if (updates.description !== undefined) { sets.push('description = ?'); values.push(updates.description) }
  if (updates.agents !== undefined) { sets.push('agents_json = ?'); values.push(JSON.stringify(updates.agents)) }
  if (updates.config !== undefined) { sets.push('config_json = ?'); values.push(JSON.stringify(updates.config)) }
  if (updates.status !== undefined) { sets.push('status = ?'); values.push(updates.status) }

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
  await run(
    `INSERT INTO team_sessions (id, team_id, topic, messages_json, summary, status)
     VALUES (?, ?, ?, '[]', '', 'active')`,
    [id, teamId, topic]
  )
  return id
}

/** 保存团队会话 */
export async function saveTeamSession(session: TeamSession): Promise<void> {
  await run(
    `UPDATE team_sessions SET messages_json = ?, summary = ?, status = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
    [JSON.stringify(session.messages), session.summary, session.status, session.id]
  )
}

/** 获取团队会话 */
export async function getTeamSession(id: string): Promise<TeamSession | null> {
  const rows = await query<{
    id: string; team_id: string; topic: string; messages_json: string;
    summary: string; status: string; created_at: string; updated_at: string
  }>('SELECT * FROM team_sessions WHERE id = ?', [id])
  if (!rows[0]) return null
  const r = rows[0]
  return {
    id: r.id, teamId: r.team_id, topic: r.topic,
    messages: JSON.parse(r.messages_json || '[]'),
    summary: r.summary, status: r.status as TeamSession['status'],
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

// ─── 内部 ───

interface RawTeamRow {
  id: string; name: string; description: string; team_type: string;
  agents_json: string; project_id: string | null; config_json: string;
  status: string; created_at: string; updated_at: string
}

function parseTeamRow(r: RawTeamRow): Team {
  return {
    id: r.id, name: r.name, description: r.description,
    teamType: r.team_type as TeamType,
    agents: JSON.parse(r.agents_json || '[]'),
    projectId: r.project_id || undefined,
    config: JSON.parse(r.config_json || '{"communicationPattern":"sequential"}'),
    status: r.status as TeamStatus,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}
