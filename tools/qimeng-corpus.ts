import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { classifyQimengText, type QimengClassification } from './qimeng-taxonomy-recovered.ts'
import { maybeRecoverQimengNote, type NotesFallbackRecord } from './qimeng-notes-fallback.ts'

export const DEFAULT_CORPUS_PATH = '/Users/apple/Documents/Openbasaka_Brain/Wiki'
export const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.txt'])
export const DEFAULT_PILOT_PER_WING = 18

export type FrontmatterBlock = Record<string, unknown>

export interface CorpusEntry {
  filePath: string
  relativePath: string
  year: number | null
  title: string
  source: string
  exportedWikiLike: boolean
  classification: QimengClassification
}

export interface QimengDocument {
  filePath: string
  relativePath: string
  rawContent: string
  body: string
  blocks: FrontmatterBlock[]
  exportBlock: FrontmatterBlock
  sourceBlock: FrontmatterBlock
  title: string
  source: string
  year: number | null
  noteId: string
  folder: string
  created: string
  modified: string
  slug: string
  tags: string[]
  classification: QimengClassification
  notesFallbackRecovered: boolean
  notesFallbackLookupPk: number | null
}

function normalizeArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim())
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(/[,，]/)
      .map(item => item.trim())
      .filter(Boolean)
  }

  return []
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map(value => value?.trim() || '').filter(Boolean)))
}

export async function walkDirectory(dirPath: string): Promise<string[]> {
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

export async function readSnippet(filePath: string, bytes = 8 * 1024): Promise<string> {
  const handle = await fs.open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(bytes)
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0)
    return buffer.toString('utf8', 0, bytesRead)
  } finally {
    await handle.close()
  }
}

export function parseSimpleYamlBlock(block: string): FrontmatterBlock {
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

export function stripLeadingFrontmatterBlocks(content: string): {
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

export function cleanTitle(value: string): string {
  return value
    .replace(/\.md$/i, '')
    .replace(/[-_]+md$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function titleFromFileName(filePath: string): string {
  return cleanTitle(
    basenameWithoutExt(filePath)
      .replace(/^(19|20)\d{6}_/, '')
      .replace(/_/g, ' ')
      .replace(/-+/g, ' '),
  )
}

export function extractTitle(filePath: string, blocks: FrontmatterBlock[]): string {
  const titleFromBlocks = [...blocks]
    .reverse()
    .map(block => typeof block.title === 'string' ? block.title : '')
    .find(Boolean)

  return cleanTitle(titleFromBlocks || basenameWithoutExt(filePath))
}

export function extractSource(blocks: FrontmatterBlock[]): string {
  const source = [...blocks]
    .reverse()
    .map(block => typeof block.source === 'string' ? block.source : '')
    .find(Boolean)

  return source || 'unknown'
}

export function extractYear(filePath: string, blocks: FrontmatterBlock[]): number | null {
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

function isDatalessFile(filePath: string): boolean {
  try {
    const flags = execFileSync('stat', ['-f', '%Sf', filePath], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    }).trim()

    return flags.split(',').includes('dataless')
  } catch {
    return false
  }
}

function buildRecoveredDocument(corpusPath: string, filePath: string, recovered: NotesFallbackRecord): QimengDocument {
  const exportBlock = {
    title: `${recovered.slug}.md`,
    slug: recovered.slug,
    tags: [],
  }
  const sourceBlock = {
    title: recovered.title,
    id: recovered.noteId,
    folder: recovered.folder,
    modified: recovered.modified,
    created: recovered.created,
    source: 'Apple Notes',
  }
  const body = [`# ${recovered.title}`, recovered.plainText].filter(Boolean).join('\n\n').trim()
  const rawContent = body
  const blocks = [exportBlock, sourceBlock]
  const classification = classifyQimengText({
    title: recovered.title,
    content: body,
  })

  return {
    filePath,
    relativePath: path.relative(corpusPath, filePath) || path.basename(filePath),
    rawContent,
    body,
    blocks,
    exportBlock,
    sourceBlock,
    title: recovered.title,
    source: 'Apple Notes',
    year: extractYear(filePath, blocks),
    noteId: recovered.noteId,
    folder: recovered.folder,
    created: recovered.created,
    modified: recovered.modified,
    slug: recovered.slug,
    tags: uniqueStrings(classification.tags),
    classification,
    notesFallbackRecovered: true,
    notesFallbackLookupPk: recovered.lookupPk,
  }
}

export function isExportedWikiLike(blocks: FrontmatterBlock[]): boolean {
  return blocks.some(block => (
    typeof block.slug === 'string'
    || Array.isArray(block.source_drawers)
    || typeof block.updated === 'string'
  ))
}

export async function buildCorpusEntries(corpusPath: string): Promise<CorpusEntry[]> {
  const files = await walkDirectory(corpusPath)
  const entries: CorpusEntry[] = []

  for (const filePath of files.sort()) {
    const title = titleFromFileName(filePath)
    const classification = classifyQimengText({
      title,
      content: title,
    })

    entries.push({
      filePath,
      relativePath: path.relative(corpusPath, filePath) || path.basename(filePath),
      year: extractYear(filePath, []),
      title,
      source: 'unknown',
      exportedWikiLike: false,
      classification,
    })
  }

  return entries
}

export function buildPilot(entries: CorpusEntry[], perWing = DEFAULT_PILOT_PER_WING): CorpusEntry[] {
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
      .slice(0, perWing)
      .forEach(entry => pilot.push(entry))
  }

  return pilot
}

export async function readQimengDocument(corpusPath: string, filePath: string): Promise<QimengDocument> {
  if (isDatalessFile(filePath)) {
    const recovered = maybeRecoverQimengNote(filePath)
    if (recovered) {
      return buildRecoveredDocument(corpusPath, filePath, recovered)
    }
  }

  try {
    const rawContent = await fs.readFile(filePath, 'utf8')
    const { blocks, body } = stripLeadingFrontmatterBlocks(rawContent)
    const exportBlock = blocks[0] || {}
    const sourceBlock = blocks[1] || blocks[0] || {}
    const title = extractTitle(filePath, blocks)
    const classification = classifyQimengText({
      title,
      content: body || rawContent,
    })

    return {
      filePath,
      relativePath: path.relative(corpusPath, filePath) || path.basename(filePath),
      rawContent,
      body: body || rawContent,
      blocks,
      exportBlock,
      sourceBlock,
      title,
      source: extractSource(blocks),
      year: extractYear(filePath, blocks),
      noteId: typeof sourceBlock.id === 'string' ? sourceBlock.id : '',
      folder: typeof sourceBlock.folder === 'string' ? sourceBlock.folder : '',
      created: typeof sourceBlock.created === 'string' ? sourceBlock.created : '',
      modified: typeof sourceBlock.modified === 'string' ? sourceBlock.modified : '',
      slug: typeof exportBlock.slug === 'string' ? exportBlock.slug : '',
      tags: uniqueStrings([
        ...normalizeArrayValue(exportBlock.tags),
        ...normalizeArrayValue(sourceBlock.tags),
        ...classification.tags,
      ]),
      classification,
      notesFallbackRecovered: false,
      notesFallbackLookupPk: null,
    }
  } catch (error) {
    const message = String(error)
    if (!message.includes('ETIMEDOUT') && !message.includes('timed out')) {
      throw error
    }

    const recovered = maybeRecoverQimengNote(filePath)
    if (!recovered) throw error
    return buildRecoveredDocument(corpusPath, filePath, recovered)
  }
}
