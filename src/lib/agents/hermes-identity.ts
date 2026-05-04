import { generateId } from '../db/schema'
import { query, run } from '../db/repository'
import { addMemoryEntry, loadAgentMemory, renderMemoryPrompt, renderL2OnDemand, type AgentMemory } from './agent-memory'
import { getSoul, renderSoulPrompt, scanForInjection, type AgentSoul } from './soul'

export interface AgentMemorySnapshot {
  agentId: string
  entries: Array<{
    rowid: number
    text: string
    createdAt: string
  }>
  charLimit: number
  totalChars: number
  prompt: string
  matchedPrompt: string
}

export interface AgentSessionSnapshot {
  id: string
  agentId: string
  sessionId: string
  topic: string
  soul: AgentSoul
  memory: AgentMemorySnapshot
  createdAt: string
}

export interface AgentReflectionInput {
  agentId: string
  sessionId?: string
  teamId?: string
  subject: string
  phase: string
  input: string
  output: string
  status: 'completed' | 'failed'
  updateMemory?: boolean
  metadata?: Record<string, unknown>
}

export interface AgentReflection {
  id: string
  agentId: string
  sessionId: string
  teamId: string
  subject: string
  phase: string
  learned: string
  nextTime: string
  memoryEntry: string
  updateMemory: boolean
  createdAt: string
}

const MEMORY_ENTRY_LIMIT = 520
const PROMPT_PREVIEW_LIMIT = 1800

let schemaReady = false

export async function ensureHermesIdentitySchema(): Promise<void> {
  if (schemaReady) return
  await run(`CREATE TABLE IF NOT EXISTS agent_session_snapshots (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    session_id TEXT DEFAULT '',
    topic TEXT DEFAULT '',
    soul_json TEXT DEFAULT '{}',
    memory_snapshot_json TEXT DEFAULT '{}',
    prompt_preview TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)
  await run(`CREATE INDEX IF NOT EXISTS idx_agent_session_snapshots_agent ON agent_session_snapshots(agent_id, created_at DESC)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_agent_session_snapshots_session ON agent_session_snapshots(session_id, created_at DESC)`)
  await run(`CREATE TABLE IF NOT EXISTS agent_reflections (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    session_id TEXT DEFAULT '',
    team_id TEXT DEFAULT '',
    subject TEXT DEFAULT '',
    phase TEXT DEFAULT '',
    learned TEXT DEFAULT '',
    next_time TEXT DEFAULT '',
    memory_entry TEXT DEFAULT '',
    update_memory INTEGER DEFAULT 1,
    metadata_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)
  await run(`CREATE INDEX IF NOT EXISTS idx_agent_reflections_agent ON agent_reflections(agent_id, created_at DESC)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_agent_reflections_session ON agent_reflections(session_id, created_at DESC)`)
  schemaReady = true
}

export function extractMemoryKeywords(text: string, max = 10): string[] {
  const tokens = text
    .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
    .split(/\s+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length >= 2 && item.length <= 32)
  return Array.from(new Set(tokens)).slice(0, max)
}

export async function loadAgentSessionSnapshot(params: {
  agentId: string
  sessionId?: string
  topic?: string
  keywords?: string[]
}): Promise<AgentSessionSnapshot> {
  await ensureHermesIdentitySchema()
  const createdAt = new Date().toISOString()
  const soul = await getSoul(params.agentId)
  const memory = await loadAgentMemory(params.agentId)
  const keywords = params.keywords?.length ? params.keywords : extractMemoryKeywords(params.topic || '')
  const snapshot = buildMemorySnapshot(memory, keywords)
  const id = generateId()
  const rendered = renderAgentHermesPrompt({
    id,
    agentId: params.agentId,
    sessionId: params.sessionId || '',
    topic: params.topic || '',
    soul,
    memory: snapshot,
    createdAt,
  })

  await run(
    `INSERT OR REPLACE INTO agent_session_snapshots
     (id, agent_id, session_id, topic, soul_json, memory_snapshot_json, prompt_preview, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.agentId,
      params.sessionId || '',
      params.topic || '',
      JSON.stringify(soul),
      JSON.stringify(snapshot),
      rendered.slice(0, PROMPT_PREVIEW_LIMIT),
      createdAt,
    ],
  )

  return {
    id,
    agentId: params.agentId,
    sessionId: params.sessionId || '',
    topic: params.topic || '',
    soul,
    memory: snapshot,
    createdAt,
  }
}

export function buildMemorySnapshot(memory: AgentMemory, keywords: string[] = []): AgentMemorySnapshot {
  const entries = memory.entries.map((entry) => ({
    rowid: entry.rowid,
    text: entry.text,
    createdAt: entry.createdAt,
  }))
  return {
    agentId: memory.agentId,
    entries,
    charLimit: memory.charLimit,
    totalChars: memory.entries.map((entry) => entry.text).join('§').length,
    prompt: renderMemoryPrompt(memory),
    matchedPrompt: renderL2OnDemand(memory, keywords),
  }
}

export function renderAgentHermesPrompt(snapshot: AgentSessionSnapshot): string {
  const memoryLines = [
    snapshot.memory.prompt,
    snapshot.memory.matchedPrompt
      ? `<memory-context-matched>\nSESSION MATCHES (frozen at session start)\n${snapshot.memory.matchedPrompt}\n</memory-context-matched>`
      : '',
  ].filter(Boolean)

  return [
    '<hermes-local-identity>',
    `agent_id: ${snapshot.agentId}`,
    `snapshot_id: ${snapshot.id}`,
    `session_id: ${snapshot.sessionId || 'local'}`,
    `snapshot_created_at: ${snapshot.createdAt}`,
    'isolation: SOUL, MEMORY, USER preference, workspace scope, skills, tools, and model route are private to this agent.',
    'freeze_rule: This SOUL+MEMORY snapshot was loaded at session start. Reflections written during this round affect future sessions only.',
    'contamination_rule: Do not adopt another role identity. Quote disagreements explicitly before consensus.',
    `memory_hits: ${snapshot.memory.entries.length}`,
    '</hermes-local-identity>',
    renderSoulPrompt(snapshot.soul),
    ...memoryLines,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export async function recordAgentReflection(input: AgentReflectionInput): Promise<AgentReflection> {
  await ensureHermesIdentitySchema()
  const createdAt = new Date().toISOString()
  const id = generateId()
  const learned = summarizeLearning(input)
  const nextTime = suggestNextTime(input)
  const memoryEntry = buildReflectionMemoryEntry(input, learned, nextTime)
  const updateMemory = input.updateMemory ?? input.status === 'completed'

  await run(
    `INSERT OR REPLACE INTO agent_reflections
     (id, agent_id, session_id, team_id, subject, phase, learned, next_time, memory_entry, update_memory, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.agentId,
      input.sessionId || '',
      input.teamId || '',
      input.subject,
      input.phase,
      learned,
      nextTime,
      memoryEntry,
      updateMemory ? 1 : 0,
      JSON.stringify({
        status: input.status,
        inputPreview: compact(input.input, 360),
        outputPreview: compact(input.output, 520),
        ...(input.metadata || {}),
      }),
      createdAt,
    ],
  )

  if (updateMemory && memoryEntry) {
    await addReflectionMemoryIfNew(input.agentId, memoryEntry)
  }

  return {
    id,
    agentId: input.agentId,
    sessionId: input.sessionId || '',
    teamId: input.teamId || '',
    subject: input.subject,
    phase: input.phase,
    learned,
    nextTime,
    memoryEntry,
    updateMemory,
    createdAt,
  }
}

async function addReflectionMemoryIfNew(agentId: string, memoryEntry: string): Promise<void> {
  const scan = scanForInjection(memoryEntry)
  if (!scan.safe) return
  const existing = await query<{ entry: string }>(
    'SELECT entry FROM agent_memories WHERE agent_id = ? ORDER BY created_at DESC LIMIT 24',
    [agentId],
  )
  if (existing.some((row) => normalizeForDedupe(row.entry) === normalizeForDedupe(memoryEntry))) return
  await addMemoryEntry(agentId, memoryEntry)
}

function summarizeLearning(input: AgentReflectionInput): string {
  if (input.status === 'failed') {
    return compact(`本轮在「${input.phase}」没有形成有效输出；主要学到需要先确认模型连接、角色配置或输入约束。`, 180)
  }
  const firstSignal = extractUsefulSentence(input.output)
  return compact(`本轮在「${input.phase}」围绕「${input.subject}」形成了可复用判断：${firstSignal}`, 220)
}

function suggestNextTime(input: AgentReflectionInput): string {
  if (input.status === 'failed') return '下次先自检模型路由、密钥配置、上下文长度和可用工具，再进入角色发言。'
  if (/风险|失败|审查|反方|质询/.test(input.phase + input.output)) {
    return '下次先列出否决条件和证据缺口，再把可行部分并入共识。'
  }
  if (/PRD|产品|界面|体验|用户/.test(input.input + input.output)) {
    return '下次继续把建议落到用户动作、系统反应、数据去向、异常状态和验收标准。'
  }
  return '下次保留本角色的独立判断，明确同意、反对或补充对象。'
}

function buildReflectionMemoryEntry(input: AgentReflectionInput, learned: string, nextTime: string): string {
  return compact(
    [
      `[reflection:${input.phase}] ${learned}`,
      `next: ${nextTime}`,
      `source: team_session=${input.sessionId || 'local'} subject=${input.subject}`,
    ].join('\n'),
    MEMORY_ENTRY_LIMIT,
  )
}

function extractUsefulSentence(text: string): string {
  const cleaned = text.replace(/[#>*`_\-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const sentence = cleaned.split(/[。！？.!?]/).find((item) => item.trim().length >= 16) || cleaned
  return compact(sentence || '需要把输出变成更清晰的行动与验收条款。', 180)
}

function normalizeForDedupe(value: string): string {
  return value.replace(/\s+/g, '').slice(0, 220)
}

function compact(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}
