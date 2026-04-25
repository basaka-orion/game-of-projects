/**
 * Coverage Checker — 知识库搜索覆盖率检测器
 *
 * 随机抽取 Drawer 和 Wiki 中的短语，验证能否通过搜索找到。
 * 确保知识库中的每个标点符号都可搜索到。
 */
import { query } from '../db/repository'
import { searchDrawers, searchDrawersExact, getMatchContext } from './drawer'
import { searchPages } from './wiki'

// ─── 接口 ───

export interface CoverageReport {
  /** 检测的样本总数 */
  totalSamples: number
  /** 通过 FTS5 搜索找到的样本数 */
  ftsHits: number
  /** 通过精确搜索找到的样本数 */
  exactHits: number
  /** 最终覆盖率百分比 */
  coveragePercent: number
  /** 不可搜的样本列表 */
  missed: Array<{
    id: string
    type: 'drawer' | 'wiki_page'
    title: string
    sampleText: string
  }>
}

export interface CoverageCheckProgress {
  phase: 'sampling' | 'testing' | 'done'
  current: number
  total: number
  message: string
}

// ─── 采样 ───

/** 从文本中随机抽取一个可搜索的短语 */
function extractRandomPhrase(text: string, minLen = 4, maxLen = 20): string | null {
  if (!text || text.length < minLen) return null

  // 随机起始位置
  const maxStart = Math.max(0, text.length - maxLen)
  const start = Math.floor(Math.random() * maxStart)
  // 随机长度
  const len = minLen + Math.floor(Math.random() * (maxLen - minLen))
  const phrase = text.slice(start, start + len).trim()

  // 过滤掉纯空白或太短的
  if (phrase.length < minLen) return null
  // 过滤掉纯标点的
  if (/^[\s\p{P}]+$/u.test(phrase)) return null

  return phrase
}

// ─── 核心检测 ───

/** 运行覆盖率检测 */
export async function checkSearchCoverage(
  sampleSize = 50,
  onProgress?: (p: CoverageCheckProgress) => void
): Promise<CoverageReport> {
  const report: CoverageReport = {
    totalSamples: 0,
    ftsHits: 0,
    exactHits: 0,
    coveragePercent: 0,
    missed: [],
  }

  // 1. 收集样本
  onProgress?.({ phase: 'sampling', current: 0, total: 0, message: '采集样本...' })

  type Sample = { id: string; type: 'drawer' | 'wiki_page'; title: string; text: string }
  const samples: Sample[] = []

  // 从 Drawer 采样
  try {
    const drawerRows = await query(
      'SELECT id, title, raw_content FROM mempalace_drawers ORDER BY RANDOM() LIMIT ?',
      [Math.ceil(sampleSize / 2)]
    ) as Array<{ id: string; title: string; raw_content: string }>

    for (const row of drawerRows) {
      const phrase = extractRandomPhrase(row.raw_content)
      if (phrase) {
        samples.push({ id: row.id, type: 'drawer', title: row.title || '未命名', text: phrase })
      }
    }
  } catch { /* ignore */ }

  // 从 Wiki Pages 采样
  try {
    const wikiRows = await query(
      "SELECT id, title, content FROM wiki_pages WHERE is_index = 0 ORDER BY RANDOM() LIMIT ?",
      [Math.ceil(sampleSize / 2)]
    ) as Array<{ id: string; title: string; content: string }>

    for (const row of wikiRows) {
      const phrase = extractRandomPhrase(row.content)
      if (phrase) {
        samples.push({ id: row.id, type: 'wiki_page', title: row.title || '未命名', text: phrase })
      }
    }
  } catch { /* ignore */ }

  report.totalSamples = samples.length
  if (report.totalSamples === 0) {
    onProgress?.({ phase: 'done', current: 0, total: 0, message: '无内容可检测' })
    return report
  }

  // 2. 逐个测试
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]
    onProgress?.({
      phase: 'testing',
      current: i + 1,
      total: samples.length,
      message: `测试 ${i + 1}/${samples.length}: "${sample.text.slice(0, 30)}..."`,
    })

    let found = false

    // 尝试 FTS5 / 模糊搜索
    if (sample.type === 'drawer') {
      const results = await searchDrawers(sample.text, 5)
      if (results.some(r => r.id === sample.id)) {
        report.ftsHits++
        found = true
      }
    } else {
      const results = await searchPages(sample.text, 5)
      if (results.some(r => r.id === sample.id)) {
        report.ftsHits++
        found = true
      }
    }

    // 如果 FTS 没找到，尝试精确搜索（仅 Drawer）
    if (!found && sample.type === 'drawer') {
      const exactResults = await searchDrawersExact(sample.text, 5)
      if (exactResults.some(r => r.id === sample.id)) {
        report.exactHits++
        found = true
      }
    }

    if (!found) {
      report.missed.push({
        id: sample.id,
        type: sample.type,
        title: sample.title,
        sampleText: sample.text,
      })
    }
  }

  // 3. 计算覆盖率
  const totalHits = report.ftsHits + report.exactHits
  report.coveragePercent = report.totalSamples > 0
    ? Math.round((totalHits / report.totalSamples) * 10000) / 100
    : 0

  onProgress?.({
    phase: 'done',
    current: samples.length,
    total: samples.length,
    message: `覆盖率: ${report.coveragePercent}% (${totalHits}/${report.totalSamples})`,
  })

  return report
}

/** 验证特定文本是否可搜到 */
export async function verifySearchable(
  text: string
): Promise<{
  found: boolean
  sources: Array<{
    type: 'drawer' | 'wiki_page' | 'wiki_chunk'
    id: string
    title: string
    matchContext: string
  }>
}> {
  const sources: Array<{
    type: 'drawer' | 'wiki_page' | 'wiki_chunk'
    id: string
    title: string
    matchContext: string
  }> = []

  // Drawer 精确搜索
  const drawerResults = await searchDrawersExact(text, 5)
  for (const d of drawerResults) {
    sources.push({
      type: 'drawer',
      id: d.id,
      title: d.title,
      matchContext: getMatchContext(d.rawContent, text),
    })
  }

  // Wiki 页面搜索
  const wikiResults = await searchPages(text, 5)
  for (const p of wikiResults) {
    if (p.content && p.content.includes(text)) {
      sources.push({
        type: 'wiki_page',
        id: p.id,
        title: p.title,
        matchContext: getMatchContext(p.content, text),
      })
    }
  }

  // Drawer FTS 搜索补充
  if (sources.length === 0) {
    const ftsResults = await searchDrawers(text, 5)
    for (const d of ftsResults) {
      sources.push({
        type: 'drawer',
        id: d.id,
        title: d.title,
        matchContext: getMatchContext(d.rawContent, text),
      })
    }
  }

  return {
    found: sources.length > 0,
    sources,
  }
}
