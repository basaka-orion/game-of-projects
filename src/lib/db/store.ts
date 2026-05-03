/**
 * 数据存储层 — 统一入口
 * Electron 模式：走 SQLite（via repository.ts → IPC）
 * 浏览器开发模式：走 localStorage（Phase 1 兼容）
 */
import { generateId } from './schema'
import type { RadarScores, WarRoomLog } from '../ai/war-room'
import type { ParsedPRD } from '../ai/prd-parser'
import {
  dbSaveProject,
  dbGetAllProjects,
  dbGetProject,
  dbDeleteProject,
  dbUpdateProject,
  dbGetBossProfile,
  dbSetBossProfile,
  dbGetSetting,
  dbSetSetting,
  migrateFromLocalStorage,
} from './repository'

export type ProjectPriorityLevel = 'low' | 'normal' | 'high' | 'urgent'

const PROJECTS_KEY = 'gop_projects'
const SETTINGS_KEY = 'gop_settings'
const BOSS_KEY = 'gop_boss_profile'

/** 是否使用 SQLite（Electron 模式且 IPC 可用） */
let useSQLite = false

/** 初始化存储层（应用启动时调用） */
export async function initStore(): Promise<void> {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.dbQuery
  if (isElectron) {
    try {
      await migrateFromLocalStorage()
      useSQLite = true
    } catch (err) {
      console.warn('[store] SQLite init failed, falling back to localStorage:', err)
      useSQLite = false
    }
  }
}

export interface StoredProject {
  id: string
  title: string
  oneLiner: string
  tags: string[]
  radar: RadarScores
  survivalRate: number
  survivalGrade: string
  summary: string
  recommendation: string
  warLogs: WarRoomLog[]
  rawContent: string
  isPinned: boolean
  isStarred: boolean
  priorityLevel: ProjectPriorityLevel
  createdAt: string
  updatedAt: string
}

// ─── localStorage 内部方法 ─────────────────────────────────

function loadProjects(): StoredProject[] {
  try {
    const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]') as Partial<StoredProject>[]
    return projects.map(normalizeStoredProject).sort(compareProjectsForAttention)
  } catch {
    return []
  }
}

function saveProjects(projects: StoredProject[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.sort(compareProjectsForAttention)))
}

// ─── 项目 CRUD（统一接口） ─────────────────────────────────

/** 保存项目推演结果 */
export async function saveProject(
  prd: ParsedPRD,
  radar: RadarScores,
  survivalRate: number,
  survivalGrade: string,
  summary: string,
  recommendation: string,
  warLogs: WarRoomLog[],
  rawContent: string
): Promise<StoredProject> {
  const now = new Date().toISOString()
  const project: StoredProject = {
    id: generateId(),
    title: prd.title,
    oneLiner: prd.oneLiner,
    tags: prd.tags,
    radar,
    survivalRate,
    survivalGrade,
    summary,
    recommendation,
    warLogs,
    rawContent,
    isPinned: false,
    isStarred: false,
    priorityLevel: 'normal',
    createdAt: now,
    updatedAt: now,
  }

  if (useSQLite) {
    await dbSaveProject({
      id: project.id,
      title: project.title,
      oneLiner: project.oneLiner,
      tags: project.tags,
      radar: project.radar,
      survivalRate: project.survivalRate,
      survivalGrade: project.survivalGrade,
      summary: project.summary,
      recommendation: project.recommendation,
      warLogs: project.warLogs,
      rawContent: project.rawContent,
      isPinned: project.isPinned,
      isStarred: project.isStarred,
      priorityLevel: project.priorityLevel,
    })
  } else {
    const projects = loadProjects()
    projects.unshift(project)
    saveProjects(projects)
  }

  return project
}

/** 获取所有项目 */
export async function getAllProjects(): Promise<StoredProject[]> {
  if (useSQLite) {
    const rows = await dbGetAllProjects()
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      oneLiner: row.one_liner,
      tags: JSON.parse(row.tags || '[]'),
      radar: JSON.parse(row.radar_json || '{}'),
      survivalRate: row.survival_rate,
      survivalGrade: row.survival_grade,
      summary: row.summary,
      recommendation: row.recommendation,
      warLogs: JSON.parse(row.war_logs_json || '[]'),
      rawContent: row.raw_content,
      isPinned: !!row.is_pinned,
      isStarred: !!row.is_starred,
      priorityLevel: normalizeProjectPriority(row.priority_level),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }
  return loadProjects()
}

/** 获取单个项目 */
export async function getProject(id: string): Promise<StoredProject | undefined> {
  if (useSQLite) {
    const row = await dbGetProject(id)
    if (!row) return undefined
    return {
      id: row.id,
      title: row.title,
      oneLiner: row.one_liner,
      tags: JSON.parse(row.tags || '[]'),
      radar: JSON.parse(row.radar_json || '{}'),
      survivalRate: row.survival_rate,
      survivalGrade: row.survival_grade,
      summary: row.summary,
      recommendation: row.recommendation,
      warLogs: JSON.parse(row.war_logs_json || '[]'),
      rawContent: row.raw_content,
      isPinned: !!row.is_pinned,
      isStarred: !!row.is_starred,
      priorityLevel: normalizeProjectPriority(row.priority_level),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
  return loadProjects().find(p => p.id === id)
}

/** 删除项目 */
export async function deleteProject(id: string) {
  if (useSQLite) {
    await dbDeleteProject(id)
  } else {
    const projects = loadProjects().filter(p => p.id !== id)
    saveProjects(projects)
  }
}

/** 更新项目可编辑字段 */
export async function updateProject(
  id: string,
  updates: Partial<
    Pick<
      StoredProject,
      'title' | 'oneLiner' | 'tags' | 'summary' | 'recommendation' | 'isPinned' | 'isStarred' | 'priorityLevel'
    >
  >,
): Promise<void> {
  if (useSQLite) {
    await dbUpdateProject(id, updates)
  } else {
    const projects = loadProjects()
    const idx = projects.findIndex(p => p.id === id)
    if (idx >= 0) {
      Object.assign(projects[idx], updates, { updatedAt: new Date().toISOString() })
      saveProjects(projects)
    }
  }
}

function normalizeProjectPriority(value?: string): ProjectPriorityLevel {
  if (value === 'low' || value === 'high' || value === 'urgent') return value
  return 'normal'
}

function normalizeStoredProject(project: Partial<StoredProject>): StoredProject {
  return {
    id: project.id || generateId(),
    title: project.title || '未命名项目',
    oneLiner: project.oneLiner || '',
    tags: Array.isArray(project.tags) ? project.tags : [],
    radar: project.radar || ({} as RadarScores),
    survivalRate: project.survivalRate || 0,
    survivalGrade: project.survivalGrade || 'F',
    summary: project.summary || '',
    recommendation: project.recommendation || '',
    warLogs: Array.isArray(project.warLogs) ? project.warLogs : [],
    rawContent: project.rawContent || '',
    isPinned: !!project.isPinned,
    isStarred: !!project.isStarred,
    priorityLevel: normalizeProjectPriority(project.priorityLevel),
    createdAt: project.createdAt || new Date().toISOString(),
    updatedAt: project.updatedAt || project.createdAt || new Date().toISOString(),
  }
}

function compareProjectsForAttention(a: StoredProject, b: StoredProject): number {
  const rank: Record<ProjectPriorityLevel, number> = { urgent: 4, high: 3, normal: 2, low: 1 }
  return (
    Number(b.isPinned) - Number(a.isPinned) ||
    rank[b.priorityLevel] - rank[a.priorityLevel] ||
    Number(b.isStarred) - Number(a.isStarred) ||
    b.updatedAt.localeCompare(a.updatedAt)
  )
}

// ─── 设置（同步兼容 + 异步优先） ───────────────────────────

export function getSetting(key: string, fallback = ''): string {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return settings[key] ?? fallback
  } catch {
    return fallback
  }
}

export function setSetting(key: string, value: string) {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    settings[key] = value
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch { /* ignore */ }

  // 异步同步到 SQLite
  if (useSQLite) {
    dbSetSetting(key, value).catch(() => {})
  }
}

/** 异步获取设置（优先从 SQLite） */
export async function getSettingAsync(key: string, fallback = ''): Promise<string> {
  if (useSQLite) {
    return dbGetSetting(key, fallback)
  }
  return getSetting(key, fallback)
}

// ─── Boss 画像 ──────────────────────────────────────────────

export function getBossProfile(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(BOSS_KEY) || '{}')
  } catch {
    return {}
  }
}

export function setBossProfile(profile: Record<string, string>) {
  localStorage.setItem(BOSS_KEY, JSON.stringify(profile))
  if (useSQLite) {
    dbSetBossProfile(profile).catch(() => {})
  }
}

/** 异步获取 Boss Profile（优先从 SQLite） */
export async function getBossProfileAsync(): Promise<Record<string, string>> {
  if (useSQLite) {
    return dbGetBossProfile()
  }
  return getBossProfile()
}

// ─── 初始化状态 ─────────────────────────────────────────────

export function isOnboarded(): boolean {
  return getSetting('onboarded') === 'true'
}

export function markOnboarded() {
  setSetting('onboarded', 'true')
}
