import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { chunkText } from '../src/lib/knowledge/chunker.ts'

const REPORT_DIR = path.resolve('docs/qimeng-compiles')
const INDEX_SLUG = 'qimeng-pilot-index'

type Wing =
  | 'identity'
  | 'worldview'
  | 'method'
  | 'creation'
  | 'dialogue'
  | 'profiling'
  | 'wishes'
  | 'openbasaka'

type Hall =
  | 'identity'
  | 'consciousness'
  | 'creative'
  | 'technical'
  | 'memory'
  | 'emotions'
  | 'family'

interface CompileArgs {
  apply: boolean
  offset: number
  limit: number
}

interface LLMConfig {
  provider: 'deepseek' | 'minimax' | 'ollama' | 'glm' | 'custom'
  apiKey: string
  baseUrl: string
  model: string
}

interface DrawerRow {
  id: string
  title: string
  wing: Wing
  hall: Hall
  room: string
  raw_content: string
  source_type: string
  folder_path: string
  metadata_json: string
  created_at: string
}

interface GroupRow {
  folderPath: string
  wing: Wing
  hall: Hall
  count: number
}

interface CompileOutput {
  title: string
  summary: string
  content: string
  category: string
  tags: string[]
  importance: number
}

interface GroupResult {
  key: string
  wing: Wing
  hall: Hall
  folderPath: string
  drawerCount: number
  pageId: string
  pageTitle: string
  pageSlug: string
  status: 'compiled' | 'skipped' | 'error'
  reason: string
}

const WING_LABELS: Record<Wing, string> = {
  identity: '自我定义',
  worldview: '世界模型',
  method: '探索方法',
  creation: '创意与项目',
  dialogue: '关键对话',
  profiling: '画像工坊',
  wishes: '未竟心愿',
  openbasaka: '系统演化',
}

const HALL_LABELS: Record<Hall, string> = {
  identity: '自我认识',
  consciousness: '世界观',
  creative: '创意表达',
  technical: '结构与工程',
  memory: '经历回忆',
  emotions: '情绪与渴望',
  family: '关系与家庭',
}

const CATEGORY_FALLBACK: Record<Hall, string> = {
  identity: 'insight',
  consciousness: 'concept',
  creative: 'learning',
  technical: 'tech',
  memory: 'learning',
  emotions: 'insight',
  family: 'insight',
}

const SYSTEM_PROMPT = `你是《启蒙》知识结晶编译器。你会把同一主题组的原始抽屉，编译成一篇结构化、可追溯的 wiki 页面。

硬规则：
1. 只输出一个 JSON 对象，不要输出代码块，不要输出多余解释。
2. 页面必须保留原始语义密度，不能把具体想法压扁成空洞总结。
3. 页面正文必须使用 Markdown，并且自然分段，包含小标题、要点和必要的原话摘录式表述。
4. 关键判断、执念、问题意识、方法论、项目构想都要保留下来。
5. 关键段落后标注来源锚点，格式必须是 ^[Drawer:ID]。
6. 如果这一组明显是系统/工程/智能体相关内容，要明确写出系统目标、机制、约束、下一步。
7. 如果这一组明显是世界观/自我认知/情绪线索，要明确写出核心命题、张力、反复出现的母题。

JSON 结构：
{
  "title": "页面标题",
  "summary": "一句话摘要，少于100字",
  "content": "Markdown 正文",
  "category": "tech|academic|concept|decision|learning|insight|general",
  "tags": ["标签1", "标签2"],
  "importance": 0-100 的整数
}`

function parseArgs(): CompileArgs {
  const args = process.argv.slice(2)
  let offset = 0
  let limit = 0

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--offset') {
      offset = Number(args[index + 1] || 0)
      index += 1
      continue
    }
    if (arg === '--limit') {
      limit = Number(args[index + 1] || 0)
      index += 1
    }
  }

  return {
    apply: args.includes('--apply'),
    offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 0,
  }
}

function generateId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function buildTimestampSlug(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[:]/g, '-')
}

function normalizeProviderBaseUrl(provider: string, baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (provider === 'glm' && trimmed === 'https://open.bigmodel.cn/api/anthropic') {
    return trimmed
  }
  return trimmed || baseUrl
}

function openDatabase() {
  const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'game-of-projects', 'game-of-projects.db')
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')
  return { dbPath, db }
}

function loadLLMConfig(db: DatabaseSync): LLMConfig {
  const rows = db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all('llm_%') as Array<{ key: string; value: string }>
  const settings = new Map(rows.map(row => [row.key, row.value]))
  const provider = (settings.get('llm_provider') || 'deepseek') as LLMConfig['provider']

  return {
    provider,
    apiKey: settings.get('llm_api_key') || '',
    baseUrl: normalizeProviderBaseUrl(provider, settings.get('llm_base_url') || 'https://api.deepseek.com/v1'),
    model: settings.get('llm_model') || (provider === 'glm' ? 'glm-5.1' : 'deepseek-chat'),
  }
}

function getTargetGroups(db: DatabaseSync, offset: number, limit: number): GroupRow[] {
  const rows = db.prepare(`
    SELECT folder_path AS folderPath, wing, hall, COUNT(*) AS count
    FROM mempalace_drawers
    WHERE metadata_json LIKE '%"importScope":"qimeng-pilot"%'
      AND is_compiled = 0
    GROUP BY folder_path, wing, hall
    ORDER BY COUNT(*) DESC, folder_path ASC, wing ASC, hall ASC
  `).all() as GroupRow[]

  if (limit > 0) return rows.slice(offset, offset + limit)
  return rows.slice(offset)
}

function getGroupDrawers(db: DatabaseSync, group: GroupRow): DrawerRow[] {
  return db.prepare(`
    SELECT id, title, wing, hall, room, raw_content, source_type, folder_path, metadata_json, created_at
    FROM mempalace_drawers
    WHERE metadata_json LIKE '%"importScope":"qimeng-pilot"%'
      AND is_compiled = 0
      AND folder_path = ?
      AND wing = ?
      AND hall = ?
    ORDER BY created_at ASC, id ASC
  `).all(group.folderPath, group.wing, group.hall) as DrawerRow[]
}

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map(value => value?.trim() || '').filter(Boolean)))
}

function buildGroupKey(group: GroupRow): string {
  return `${group.folderPath}::${group.wing}::${group.hall}`
}

function buildSlug(group: GroupRow): string {
  return `qimeng-${group.wing}-${group.hall}`.replace(/_+/g, '-')
}

function buildFallbackTitle(group: GroupRow): string {
  return `启蒙 / ${WING_LABELS[group.wing]} / ${HALL_LABELS[group.hall]}`
}

function sanitizeCategory(category: string, group: GroupRow): string {
  const normalized = category.trim().toLowerCase()
  const allowed = new Set(['tech', 'academic', 'concept', 'decision', 'learning', 'insight', 'general'])
  if (allowed.has(normalized)) return normalized
  return CATEGORY_FALLBACK[group.hall] || 'general'
}

function clampImportance(value: number | string): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 65
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function buildPrompt(group: GroupRow, drawers: DrawerRow[]): string {
  const lines: string[] = [
    `《启蒙》编译组：${WING_LABELS[group.wing]} / ${HALL_LABELS[group.hall]}`,
    `组标识：${buildGroupKey(group)}`,
    `抽屉数量：${drawers.length}`,
    `要求：输出一篇能作为长期 wiki 页面保留下来的结构化页面。`,
    '',
  ]

  for (const drawer of drawers) {
    lines.push(`--- Drawer: ${drawer.id} ---`)
    lines.push(`Title: ${drawer.title}`)
    lines.push(`Room: ${drawer.room}`)
    lines.push(`Created: ${drawer.created_at}`)
    lines.push(drawer.raw_content)
    lines.push('')
  }

  return lines.join('\n')
}

function extractJsonObject(text: string): CompileOutput {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error('LLM 未返回 JSON 对象')
  }
  return JSON.parse(match[0]) as CompileOutput
}

function createOrReplacePage(
  db: DatabaseSync,
  group: GroupRow,
  output: CompileOutput,
  drawers: DrawerRow[],
): { pageId: string; pageTitle: string; pageSlug: string } {
  const slug = buildSlug(group)
  const existing = db.prepare('SELECT id FROM wiki_pages WHERE slug = ? LIMIT 1').get(slug) as { id?: string } | undefined
  const pageId = existing?.id || generateId()
  const sourceIds = uniqueStrings(drawers.map(drawer => {
    const metadata = parseMetadata(drawer.metadata_json)
    return typeof metadata.sourceId === 'string' ? metadata.sourceId : ''
  }))
  const metadata = {
    compiledBy: 'qimeng-pilot-compiler',
    importScope: 'qimeng-pilot',
    group: buildGroupKey(group),
    wing: group.wing,
    hall: group.hall,
    folderPath: group.folderPath,
    drawerIds: drawers.map(drawer => drawer.id),
    sourceIds,
  }
  const title = output.title?.trim() || buildFallbackTitle(group)
  const summary = output.summary?.trim() || `${WING_LABELS[group.wing]} / ${HALL_LABELS[group.hall]}`
  const content = output.content?.trim() || `# ${title}\n\n${summary}`
  const category = sanitizeCategory(output.category || '', group)
  const tags = uniqueStrings([
    '启蒙',
    WING_LABELS[group.wing],
    HALL_LABELS[group.hall],
    ...(Array.isArray(output.tags) ? output.tags : []),
  ])

  if (existing?.id) {
    db.prepare(`
      UPDATE wiki_pages
      SET title = ?, content = ?, summary = ?, category = ?, tags = ?, source_ids = ?, folder_path = ?, metadata_json = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      title,
      content,
      summary,
      category,
      JSON.stringify(tags),
      JSON.stringify(sourceIds),
      group.folderPath,
      JSON.stringify(metadata),
      pageId,
    )
  } else {
    db.prepare(`
      INSERT INTO wiki_pages
        (id, title, slug, content, summary, category, tags, frontmatter_json, source_ids, linked_page_ids, backlink_count,
         importance, confidence, is_index, is_log, folder_path, template_id, version, metadata_json, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, '{}', ?, '[]', 0, ?, 0.88, 0, 0, ?, '', 1, ?, datetime('now','localtime'), datetime('now','localtime'))
    `).run(
      pageId,
      title,
      slug,
      content,
      summary,
      category,
      JSON.stringify(tags),
      JSON.stringify(sourceIds),
      clampImportance(output.importance),
      group.folderPath,
      JSON.stringify(metadata),
    )
  }

  return { pageId, pageTitle: title, pageSlug: slug }
}

function markGroupCompiled(db: DatabaseSync, pageId: string, drawers: DrawerRow[]) {
  const updateDrawer = db.prepare(`
    UPDATE mempalace_drawers
    SET is_compiled = 1, compiled_page_id = ?, updated_at = datetime('now','localtime')
    WHERE id = ?
  `)
  const updateSource = db.prepare(`
    UPDATE wiki_sources
    SET status = 'processed', updated_at = datetime('now','localtime')
    WHERE id = ?
  `)

  for (const drawer of drawers) {
    updateDrawer.run(pageId, drawer.id)
    const metadata = parseMetadata(drawer.metadata_json)
    const sourceId = typeof metadata.sourceId === 'string' ? metadata.sourceId : ''
    if (sourceId) updateSource.run(sourceId)
  }
}

function replacePageChunks(db: DatabaseSync, pageId: string, content: string, folderPath: string) {
  db.prepare('DELETE FROM wiki_chunks WHERE page_id = ?').run(pageId)

  const insertChunk = db.prepare(`
    INSERT INTO wiki_chunks
      (id, page_id, folder_path, chunk_index, content, token_count, header_breadcrumb, overlap_prev, overlap_next, metadata_json, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
  `)

  for (const chunk of chunkText(content)) {
    insertChunk.run(
      generateId(),
      pageId,
      folderPath,
      chunk.index,
      chunk.content,
      chunk.tokenCount,
      chunk.headerBreadcrumb,
      chunk.overlapPrev,
      chunk.overlapNext,
      JSON.stringify({
        importScope: 'qimeng-pilot',
        compiledBy: 'qimeng-pilot-compiler',
        chunkKind: 'page',
      }),
    )
  }
}

function insertActivityLog(db: DatabaseSync, result: GroupResult, drawers: DrawerRow[]) {
  db.prepare(`
    INSERT INTO wiki_activity_log
      (id, action, target_type, target_id, description, details_json, created_at)
    VALUES
      (?, 'ingest', 'page', ?, ?, ?, datetime('now','localtime'))
  `).run(
    generateId(),
    result.pageId,
    `qimeng-compiler → ${result.pageTitle}`,
    JSON.stringify({
      importScope: 'qimeng-pilot',
      group: result.key,
      wing: result.wing,
      hall: result.hall,
      drawerIds: drawers.map(drawer => drawer.id),
      drawerCount: drawers.length,
    }),
  )
}

function rebuildPilotIndex(db: DatabaseSync) {
  const pages = db.prepare(`
    SELECT id, title, summary, category, json_extract(metadata_json, '$.wing') AS wing, json_extract(metadata_json, '$.hall') AS hall
    FROM wiki_pages
    WHERE metadata_json LIKE '%"compiledBy":"qimeng-pilot-compiler"%'
      AND slug != ?
    ORDER BY json_extract(metadata_json, '$.wing'), json_extract(metadata_json, '$.hall'), title
  `).all(INDEX_SLUG) as Array<{ id: string; title: string; summary: string; category: string; wing: Wing; hall: Hall }>

  const lines = [
    '# 《启蒙》Pilot Index',
    '',
    `> 自动生成于 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    `> 共 ${pages.length} 个结构化页面`,
    '',
  ]

  for (const page of pages) {
    lines.push(`- [[${page.title}]] · ${WING_LABELS[page.wing]} / ${HALL_LABELS[page.hall]} · ${page.summary || ''}`)
  }

  const content = lines.join('\n')
  const existing = db.prepare('SELECT id FROM wiki_pages WHERE slug = ? LIMIT 1').get(INDEX_SLUG) as { id?: string } | undefined

  if (existing?.id) {
    db.prepare(`
      UPDATE wiki_pages
      SET title = ?, content = ?, summary = ?, category = 'index', tags = ?, is_index = 1, importance = 100, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      '《启蒙》Pilot Index',
      content,
      `${pages.length} 个结构化页面`,
      JSON.stringify(['启蒙', 'index', 'pilot']),
      existing.id,
    )
  } else {
    db.prepare(`
      INSERT INTO wiki_pages
        (id, title, slug, content, summary, category, tags, frontmatter_json, source_ids, linked_page_ids, backlink_count,
         importance, confidence, is_index, is_log, folder_path, template_id, version, metadata_json, created_at, updated_at)
      VALUES
        (?, '《启蒙》Pilot Index', ?, ?, ?, 'index', ?, '{}', '[]', '[]', 0, 100, 1.0, 1, 0, '.', '', 1, ?, datetime('now','localtime'), datetime('now','localtime'))
    `).run(
      generateId(),
      INDEX_SLUG,
      content,
      `${pages.length} 个结构化页面`,
      JSON.stringify(['启蒙', 'index', 'pilot']),
      JSON.stringify({ compiledBy: 'qimeng-pilot-compiler', importScope: 'qimeng-pilot', index: true }),
    )
  }
}

async function writeReport(timestampSlug: string, payload: Record<string, unknown>) {
  await fs.mkdir(REPORT_DIR, { recursive: true })
  const jsonPath = path.join(REPORT_DIR, `${timestampSlug}-compile.json`)
  const mdPath = path.join(REPORT_DIR, `${timestampSlug}-compile.md`)
  const markdown = [
    '# 《启蒙》Pilot Compile 报告',
    '',
    `- 时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    `- groups：${(payload.totals as Record<string, number>).groups}`,
    `- compiled：${(payload.totals as Record<string, number>).compiled}`,
    `- skipped：${(payload.totals as Record<string, number>).skipped}`,
    `- errors：${(payload.totals as Record<string, number>).errors}`,
    '',
  ].join('\n')

  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), 'utf8')
  await fs.writeFile(mdPath, markdown, 'utf8')
  return { jsonPath, mdPath }
}

async function compileGroup(config: LLMConfig, group: GroupRow, drawers: DrawerRow[]): Promise<CompileOutput> {
  const prompt = buildPrompt(group, drawers)
  const response = await chatCompletion(config, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ], 0.35, 4096)
  return extractJsonObject(response)
}

function isAnthropicFormat(config: LLMConfig): boolean {
  return config.baseUrl.includes('/api/anthropic')
}

async function chatCompletion(
  config: LLMConfig,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  if (isAnthropicFormat(config)) {
    let systemPrompt = ''
    const userMessages = messages.filter(message => {
      if (message.role === 'system') {
        systemPrompt = message.content
        return false
      }
      return true
    })

    const response = await fetch(`${config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        system: systemPrompt,
        messages: userMessages,
        temperature,
        max_tokens: maxTokens,
      }),
    })

    if (!response.ok) {
      throw new Error(`LLM API Error [${response.status}]: ${await response.text()}`)
    }

    const data = await response.json()
    return Array.isArray(data.content)
      ? data.content.filter((item: { type: string }) => item.type === 'text').map((item: { text: string }) => item.text).join('')
      : ''
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!response.ok) {
    throw new Error(`LLM API Error [${response.status}]: ${await response.text()}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

async function main() {
  const args = parseArgs()
  const startedAt = new Date()
  const timestampSlug = buildTimestampSlug(startedAt)
  const sessionId = `qimeng-compile-${timestampSlug}`
  const { dbPath, db } = openDatabase()
  const llmConfig = loadLLMConfig(db)
  const groups = getTargetGroups(db, args.offset, args.limit)
  const results: GroupResult[] = []

  if (!llmConfig.apiKey && llmConfig.provider !== 'ollama') {
    throw new Error('缺少 LLM API Key，无法运行 pilot compiler')
  }

  try {
    if (args.apply) db.exec('BEGIN')

    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index]
      const key = buildGroupKey(group)
      const drawers = getGroupDrawers(db, group)

      console.error(`[qimeng:compile] ${index + 1}/${groups.length} ${key} (${drawers.length})`)

      if (drawers.length === 0) {
        results.push({
          key,
          wing: group.wing,
          hall: group.hall,
          folderPath: group.folderPath,
          drawerCount: 0,
          pageId: '',
          pageTitle: '',
          pageSlug: buildSlug(group),
          status: 'skipped',
          reason: '组内无未编译抽屉',
        })
        continue
      }

      try {
        const output = await compileGroup(llmConfig, group, drawers)
        const page = args.apply
          ? createOrReplacePage(db, group, output, drawers)
          : { pageId: '', pageTitle: output.title || buildFallbackTitle(group), pageSlug: buildSlug(group) }

        if (args.apply) {
          replacePageChunks(db, page.pageId, output.content, group.folderPath)
          markGroupCompiled(db, page.pageId, drawers)
          insertActivityLog(db, {
            key,
            wing: group.wing,
            hall: group.hall,
            folderPath: group.folderPath,
            drawerCount: drawers.length,
            pageId: page.pageId,
            pageTitle: page.pageTitle,
            pageSlug: page.pageSlug,
            status: 'compiled',
            reason: '已写入 wiki page 并标记抽屉已编译',
          }, drawers)
        }

        results.push({
          key,
          wing: group.wing,
          hall: group.hall,
          folderPath: group.folderPath,
          drawerCount: drawers.length,
          pageId: page.pageId,
          pageTitle: page.pageTitle,
          pageSlug: page.pageSlug,
          status: 'compiled',
          reason: args.apply ? '已写入 wiki page 并标记抽屉已编译' : 'dry-run 编译成功',
        })
      } catch (error) {
        results.push({
          key,
          wing: group.wing,
          hall: group.hall,
          folderPath: group.folderPath,
          drawerCount: drawers.length,
          pageId: '',
          pageTitle: '',
          pageSlug: buildSlug(group),
          status: 'error',
          reason: String(error),
        })
      }
    }

    if (args.apply) {
      const hasErrors = results.some(result => result.status === 'error')
      if (hasErrors) {
        db.exec('ROLLBACK')
      } else {
        rebuildPilotIndex(db)
        db.exec('COMMIT')
      }
    }
  } catch (error) {
    if (args.apply) {
      try { db.exec('ROLLBACK') } catch { /* noop */ }
    }
    throw error
  } finally {
    db.close()
  }

  const payload = {
    sessionId,
    generatedAt: startedAt.toISOString(),
    databasePath: dbPath,
    model: llmConfig.model,
    mode: args.apply ? 'apply' : 'dry-run',
    offset: args.offset,
    limit: args.limit || null,
    totals: {
      groups: groups.length,
      compiled: results.filter(result => result.status === 'compiled').length,
      skipped: results.filter(result => result.status === 'skipped').length,
      errors: results.filter(result => result.status === 'error').length,
    },
    results,
  }
  const reportPaths = await writeReport(timestampSlug, payload)

  console.log(JSON.stringify({
    sessionId,
    model: llmConfig.model,
    mode: args.apply ? 'apply' : 'dry-run',
    totals: payload.totals,
    report: reportPaths.mdPath,
    json: reportPaths.jsonPath,
  }, null, 2))
  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
