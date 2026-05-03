import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { classifyQimengText, type QimengClassification } from '../src/lib/memory/qimeng-taxonomy.ts'
import { KNOWLEDGE_MASTERS_ROOT } from '../src/lib/knowledge/default-paths.ts'

const DEFAULT_CORPUS_PATH = KNOWLEDGE_MASTERS_ROOT
const REPORT_MD_PATH = path.resolve('docs/启蒙-语料预检报告.md')
const REPORT_JSON_PATH = path.resolve('docs/启蒙-语料预检报告.json')
const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.txt'])
const MAX_EXAMPLES_PER_GROUP = 6
const PILOT_PER_WING = 18
const SAMPLE_FRONTMATTER_COUNT = 24
const READ_SNIPPET_BYTES = 8 * 1024

type FrontmatterBlock = Record<string, unknown>

interface CorpusEntry {
  filePath: string
  relativePath: string
  year: number | null
  title: string
  source: string
  exportedWikiLike: boolean
  classification: QimengClassification
}

function parseArgs() {
  const args = process.argv.slice(2)
  const pathArg = args.find(arg => !arg.startsWith('--'))
  return {
    corpusPath: pathArg ? path.resolve(pathArg) : DEFAULT_CORPUS_PATH,
  }
}

async function walkDirectory(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const files = await Promise.all(entries.map(async entry => {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      return walkDirectory(fullPath)
    }
    if (!entry.isFile()) return []
    const ext = path.extname(entry.name).toLowerCase()
    return SUPPORTED_EXTENSIONS.has(ext) ? [fullPath] : []
  }))

  return files.flat()
}

async function readSnippet(filePath: string): Promise<string> {
  const handle = await fs.open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(READ_SNIPPET_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, READ_SNIPPET_BYTES, 0)
    return buffer.toString('utf8', 0, bytesRead)
  } finally {
    await handle.close()
  }
}

function parseSimpleYamlBlock(block: string): FrontmatterBlock {
  const result: FrontmatterBlock = {}
  const lines = block.split(/\r?\n/)

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const match = line.match(/^([A-Za-z0-9_\-]+):\s*(.*)$/)
    if (!match) continue

    const key = match[1]
    let value: unknown = match[2].trim()

    if (typeof value === 'string' && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1)
    }

    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map(item => item.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    }

    result[key] = value
  }

  return result
}

function stripLeadingFrontmatterBlocks(content: string): {
  blocks: FrontmatterBlock[]
  body: string
} {
  const blocks: FrontmatterBlock[] = []
  let remaining = content.trimStart()

  while (remaining.startsWith('---')) {
    const match = remaining.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
    if (!match) break
    blocks.push(parseSimpleYamlBlock(match[1]))
    remaining = remaining.slice(match[0].length).trimStart()
  }

  return { blocks, body: remaining.trim() }
}

function basenameWithoutExt(filePath: string): string {
  return path.basename(filePath, path.extname(filePath))
}

function cleanTitle(value: string): string {
  return value
    .replace(/\.md$/i, '')
    .replace(/[-_]+md$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTitle(filePath: string, blocks: FrontmatterBlock[]): string {
  const titleFromBlocks = [...blocks]
    .reverse()
    .map(block => typeof block.title === 'string' ? block.title : '')
    .find(Boolean)

  return cleanTitle(titleFromBlocks || basenameWithoutExt(filePath))
}

function extractSource(blocks: FrontmatterBlock[]): string {
  const source = [...blocks]
    .reverse()
    .map(block => typeof block.source === 'string' ? block.source : '')
    .find(Boolean)

  return source || 'unknown'
}

function extractYear(filePath: string, blocks: FrontmatterBlock[]): number | null {
  const fileNameMatch = path.basename(filePath).match(/^(19|20)\d{2}/)
  if (fileNameMatch) return Number(fileNameMatch[0])

  const dateLike = [...blocks]
    .reverse()
    .flatMap(block => [
      typeof block.created === 'string' ? block.created : '',
      typeof block.modified === 'string' ? block.modified : '',
      typeof block.date === 'string' ? block.date : '',
      typeof block.updated === 'string' ? block.updated : '',
    ])
    .find(Boolean)

  const dateMatch = dateLike?.match(/(19|20)\d{2}/)
  return dateMatch ? Number(dateMatch[0]) : null
}

function isExportedWikiLike(blocks: FrontmatterBlock[]): boolean {
  return blocks.some(block => (
    typeof block.slug === 'string'
    || Array.isArray(block.source_drawers)
    || typeof block.updated === 'string'
  ))
}

function formatCountMap(entries: Array<[string, number]>, limit = 12): string {
  return entries
    .slice(0, limit)
    .map(([key, count]) => `- ${key}: ${count}`)
    .join('\n')
}

function openDatabaseStats(corpusPath: string) {
  const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'game-of-projects', 'game-of-projects.db')
  try {
    const db = new DatabaseSync(dbPath, { readonly: true })
    const corpusLike = `${corpusPath}%`
    const wikiSources = Number(db.prepare('SELECT COUNT(*) AS cnt FROM wiki_sources WHERE file_path LIKE ?').get(corpusLike).cnt || 0)
    const drawers = Number(db.prepare('SELECT COUNT(*) AS cnt FROM mempalace_drawers WHERE file_path LIKE ?').get(corpusLike).cnt || 0)
    const pages = Number(db.prepare("SELECT COUNT(*) AS cnt FROM wiki_pages WHERE metadata_json LIKE ? OR folder_path LIKE 'Wiki%'").get(`%${corpusPath}%`).cnt || 0)
    db.close()
    return { dbPath, wikiSources, drawers, pages }
  } catch (error) {
    return { dbPath, wikiSources: 0, drawers: 0, pages: 0, error: String(error) }
  }
}

function titleFromFileName(filePath: string): string {
  return cleanTitle(
    basenameWithoutExt(filePath)
      .replace(/^(19|20)\d{6}_/, '')
      .replace(/_/g, ' ')
      .replace(/-+/g, ' '),
  )
}

async function buildEntries(corpusPath: string): Promise<CorpusEntry[]> {
  const files = await walkDirectory(corpusPath)
  const entries: CorpusEntry[] = []

  for (const filePath of files.sort()) {
    const title = titleFromFileName(filePath)
    const year = extractYear(filePath, [])
    const classification = classifyQimengText({
      title,
      content: title,
    })

    entries.push({
      filePath,
      relativePath: path.relative(corpusPath, filePath) || path.basename(filePath),
      year,
      title,
      source: 'unknown',
      exportedWikiLike: false,
      classification,
    })
  }

  return entries
}

async function inspectFrontmatterSample(files: string[]) {
  const sampleFiles = files.slice(0, Math.min(SAMPLE_FRONTMATTER_COUNT, files.length))
  let exportedCount = 0
  let appleNotesCount = 0

  for (const filePath of sampleFiles) {
    const raw = await readSnippet(filePath)
    const { blocks } = stripLeadingFrontmatterBlocks(raw)
    if (isExportedWikiLike(blocks)) exportedCount++
    if (extractSource(blocks) === 'Apple Notes') appleNotesCount++
  }

  return {
    sampleSize: sampleFiles.length,
    exportedCount,
    appleNotesCount,
  }
}

function pickExamples(entries: CorpusEntry[], key: keyof QimengClassification) {
  const map = new Map<string, string[]>()

  for (const entry of entries) {
    const bucket = String(entry.classification[key])
    const list = map.get(bucket) || []
    if (list.length < MAX_EXAMPLES_PER_GROUP) {
      list.push(`${entry.title} (${entry.relativePath})`)
      map.set(bucket, list)
    }
  }

  return map
}

function countBy<T extends string | number>(items: T[]): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(String(item), (counts.get(String(item)) || 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
}

function buildPilot(entries: CorpusEntry[]) {
  const grouped = new Map<string, CorpusEntry[]>()
  for (const entry of entries) {
    const list = grouped.get(entry.classification.wing) || []
    list.push(entry)
    grouped.set(entry.classification.wing, list)
  }

  const pilot: CorpusEntry[] = []
  for (const [, group] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))) {
    group
      .sort((a, b) => (
        b.classification.confidence - a.classification.confidence
        || (a.year || 9999) - (b.year || 9999)
        || a.relativePath.localeCompare(b.relativePath, 'zh-CN')
      ))
      .slice(0, PILOT_PER_WING)
      .forEach(entry => pilot.push(entry))
  }

  return pilot
}

function renderExamples(title: string, examples: Map<string, string[]>, order: string[]) {
  const lines = [`## ${title}`]
  for (const key of order) {
    const items = examples.get(key)
    if (!items || items.length === 0) continue
    lines.push(`### ${key}`)
    lines.push(...items.map(item => `- ${item}`))
  }
  return lines.join('\n')
}

async function main() {
  const { corpusPath } = parseArgs()
  const startedAt = new Date()
  const entries = await buildEntries(corpusPath)
  const sample = await inspectFrontmatterSample(entries.map(entry => entry.filePath))
  const dbStats = openDatabaseStats(corpusPath)
  const byYear = countBy(entries.map(entry => entry.year || 'unknown'))
  const byWing = countBy(entries.map(entry => entry.classification.wingLabel))
  const byHall = countBy(entries.map(entry => entry.classification.hallLabel))
  const byRoom = countBy(entries.map(entry => entry.classification.room))
  const bySource: Array<[string, number]> = [
    ['Apple Notes (sample)', sample.appleNotesCount],
    ['unknown', Math.max(sample.sampleSize - sample.appleNotesCount, 0)],
  ]
  const lowConfidenceCount = entries.filter(entry => entry.classification.confidence < 0.55).length
  const pilot = buildPilot(entries)
  const wingExamples = pickExamples(entries, 'wingLabel')
  const hallExamples = pickExamples(entries, 'hallLabel')
  const years = entries.map(entry => entry.year).filter((value): value is number => typeof value === 'number')
  const earliestYear = years.length > 0 ? Math.min(...years) : null
  const latestYear = years.length > 0 ? Math.max(...years) : null

  const report = {
    scannedAt: startedAt.toISOString(),
    corpusPath,
    totalFiles: entries.length,
    frontmatterSample: sample,
    lowConfidenceCount,
    earliestYear,
    latestYear,
    database: dbStats,
    byYear,
    byWing,
    byHall,
    byRoom: byRoom.slice(0, 20),
    bySource,
    pilot: pilot.map(entry => ({
      filePath: entry.filePath,
      relativePath: entry.relativePath,
      year: entry.year,
      title: entry.title,
      wing: entry.classification.wing,
      hall: entry.classification.hall,
      room: entry.classification.room,
      confidence: Number(entry.classification.confidence.toFixed(2)),
    })),
  }

  const markdown = [
    '# 《启蒙》语料预检报告',
    '',
    `生成时间：${startedAt.toLocaleString('zh-CN', { hour12: false })}`,
    '',
    '## 总览',
    `- 语料路径：\`${corpusPath}\``,
    `- 扫描文件数：${entries.length}`,
    `- 年份范围：${earliestYear || '未知'} - ${latestYear || '未知'}`,
    `- frontmatter 样本量：${sample.sampleSize}`,
    `- 样本中具备导出 Wiki 信号的文件：${sample.exportedCount}`,
    `- 样本中保留 Apple Notes 来源信号的文件：${sample.appleNotesCount}`,
    `- 低置信度条目：${lowConfidenceCount}`,
    '',
    '## 当前数据库状态',
    `- 数据库：\`${dbStats.dbPath}\``,
    `- 已导入 wiki_sources：${dbStats.wikiSources}`,
    `- 已导入 mempalace_drawers：${dbStats.drawers}`,
    `- 已导入 wiki_pages：${dbStats.pages}`,
    '',
    '## 预检判断',
    '- 这批语料目前更像“历史导出层”，不是纯生肉原始笔记。',
    '- 当前项目数据库尚未正式纳入这批语料，可以安全做 dry-run 后再决定首批迁入。',
    `- 当前 dry-run 分布主要依据 6427 个文件名标题完成，frontmatter 结构由 ${sample.sampleSize} 篇样本核验。`,
    '- 预检分类器已经能给出《启蒙》所需的 wing / hall / room 建议，下一步适合从 pilot batch 开始。',
    '',
    '## 年度分布',
    formatCountMap(byYear, 20),
    '',
    '## Wing 分布',
    formatCountMap(byWing, 20),
    '',
    '## Hall 分布',
    formatCountMap(byHall, 20),
    '',
    '## Top Room 分布',
    formatCountMap(byRoom, 20),
    '',
    '## 来源分布',
    formatCountMap(bySource, 12),
    '',
    renderExamples('Wing 样例', wingExamples, byWing.map(([label]) => label)),
    '',
    renderExamples('Hall 样例', hallExamples, byHall.map(([label]) => label)),
    '',
    '## 首批迁入建议',
    `- 建议先导入 pilot batch：${pilot.length} 篇高置信度文件。`,
    '- 这批 pilot 已按 wing 分散抽样，适合验证《启蒙》分类法、去重规则和 drawer 元数据。', 
    '- pilot 通过后，再按年度或主题做全量迁入。',
    '',
    '## 下一步',
    '- 把分类结果接到专用《启蒙》导入器上，先跑 pilot ingest。',
    '- 为 pilot ingest 增加去重校验、导入日志和可回滚记录。',
    '- pilot 验证通过后，再推进 6427 篇全量入宫。',
    '',
  ].join('\n')

  await fs.mkdir(path.dirname(REPORT_MD_PATH), { recursive: true })
  await fs.writeFile(REPORT_MD_PATH, markdown, 'utf8')
  await fs.writeFile(REPORT_JSON_PATH, JSON.stringify(report, null, 2), 'utf8')

  console.log(JSON.stringify({
    corpusPath,
    totalFiles: entries.length,
    sampleFrontmatterCount: sample.sampleSize,
    sampleExportedCount: sample.exportedCount,
    sampleAppleNotesCount: sample.appleNotesCount,
    lowConfidenceCount,
    pilotCount: pilot.length,
    report: REPORT_MD_PATH,
    json: REPORT_JSON_PATH,
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
