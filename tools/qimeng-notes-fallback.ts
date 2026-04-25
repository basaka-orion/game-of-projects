import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const NOTES_DB_PATH = path.join(
  process.env.HOME || '',
  'Library',
  'Group Containers',
  'group.com.apple.notes',
  'NoteStore.sqlite',
)
const APPLE_EPOCH_OFFSET_SECONDS = 978307200
const OSASCRIPT_MAX_BUFFER = 16 * 1024 * 1024

type NotesIndexRow = {
  pk: number
  title: string
  noteId: string
  created: string
  modified: string
  folder: string
  normalizedTitle: string
  digitSignature: string
}

export interface NotesFallbackRecord {
  lookupPk: number
  title: string
  noteId: string
  folder: string
  created: string
  modified: string
  slug: string
  htmlBody: string
  plainText: string
}

let cachedIndex: NotesIndexRow[] | null = null

function normalizeLookup(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\.md/gi, '')
    .replace(/\bmd\b/gi, '')
    .replace(/[_-]+/g, '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[^\p{Letter}\p{Number}\u4e00-\u9fff]+/gu, '')
}

function extractDigitSignature(value: string): string {
  return Array.from(
    value
      .normalize('NFKC')
      .matchAll(/\d+/g),
    match => match[0],
  ).join('')
}

function stripOrdinalDigits(value: string): string {
  return value.replace(/\d+/g, '')
}

function buildLookupKey(filePath: string) {
  const baseName = path.basename(filePath, path.extname(filePath))
  const dayMatch = baseName.match(/^((?:19|20)\d{2})(\d{2})(\d{2})_/)
  const day = dayMatch ? `${dayMatch[1]}-${dayMatch[2]}-${dayMatch[3]}` : ''
  const withoutDate = baseName.replace(/^(?:19|20)\d{6}_/, '')
  const slugBase = withoutDate.replace(/-md$/i, '')

  return {
    day,
    slug: baseName,
    normalizedTitle: normalizeLookup(slugBase),
    digitSignature: extractDigitSignature(slugBase),
  }
}

function loadIndex(): NotesIndexRow[] {
  if (cachedIndex) return cachedIndex

  try {
    const db = new DatabaseSync(NOTES_DB_PATH)
    const rows = db.prepare(`
      SELECT note.Z_PK AS pk,
             COALESCE(note.ZTITLE1, '') AS title,
             COALESCE(note.ZIDENTIFIER, '') AS note_id,
             COALESCE(datetime(note.ZCREATIONDATE3 + ${APPLE_EPOCH_OFFSET_SECONDS}, 'unixepoch', 'localtime'), '') AS created,
             COALESCE(datetime(note.ZMODIFICATIONDATE1 + ${APPLE_EPOCH_OFFSET_SECONDS}, 'unixepoch', 'localtime'), '') AS modified,
             COALESCE(folder.ZTITLE2, folder.ZNAME, 'Notes') AS folder
        FROM ZICCLOUDSYNCINGOBJECT AS note
        LEFT JOIN ZICCLOUDSYNCINGOBJECT AS folder
               ON folder.Z_PK = note.ZFOLDER
       WHERE COALESCE(note.ZTITLE1, '') <> ''
         AND note.ZNOTEDATA IS NOT NULL
         AND COALESCE(note.ZMARKEDFORDELETION, 0) = 0
    `).all() as Array<{
      pk: number
      title: string
      note_id: string
      created: string
      modified: string
      folder: string
    }>

    db.close()
    cachedIndex = rows.map(row => ({
      pk: row.pk,
      title: row.title,
      noteId: row.note_id,
      created: row.created,
      modified: row.modified,
      folder: row.folder || 'Notes',
      normalizedTitle: normalizeLookup(row.title),
      digitSignature: extractDigitSignature(row.title),
    }))
  } catch {
    cachedIndex = []
  }

  return cachedIndex
}

function pickMatchingNote(filePath: string): NotesIndexRow | null {
  const { day, normalizedTitle, digitSignature } = buildLookupKey(filePath)
  const rows = loadIndex()
  if (!rows.length) return null

  const dayRows = day ? rows.filter(row => row.modified.startsWith(day)) : rows
  const exactMatches = dayRows.filter(row => row.normalizedTitle === normalizedTitle)

  if (exactMatches.length > 0) {
    return [...exactMatches].sort((a, b) => a.modified.localeCompare(b.modified, 'zh-CN')).at(-1) || null
  }

  const prefixMatches = dayRows.filter(row => (
    normalizedTitle.length >= 16
    && (
      row.normalizedTitle.startsWith(normalizedTitle)
      || normalizedTitle.startsWith(row.normalizedTitle)
    )
  ))
  if (prefixMatches.length === 1) {
    return prefixMatches[0]
  }

  const containsMatches = dayRows.filter(row => (
    normalizedTitle.length >= 6
    && (
      row.normalizedTitle.includes(normalizedTitle)
      || normalizedTitle.includes(row.normalizedTitle)
    )
  ))
  if (containsMatches.length === 1) {
    return containsMatches[0]
  }

  const ordinalStrippedTitle = stripOrdinalDigits(normalizedTitle)
  if (ordinalStrippedTitle.length >= 6) {
    const ordinalMatches = dayRows.filter(row => {
      const rowTitle = stripOrdinalDigits(row.normalizedTitle)
      return rowTitle.includes(ordinalStrippedTitle) || ordinalStrippedTitle.includes(rowTitle)
    })
    if (ordinalMatches.length === 1) {
      return ordinalMatches[0]
    }
  }

  if (!normalizedTitle) {
    const symbolicTitleMatches = dayRows.filter(row => row.normalizedTitle.length > 0 && row.normalizedTitle.length <= 3)
    if (symbolicTitleMatches.length === 1) {
      return symbolicTitleMatches[0]
    }
  }

  const globalExactMatches = rows.filter(row => row.normalizedTitle === normalizedTitle)
  if (globalExactMatches.length === 1) {
    return globalExactMatches[0]
  }

  if (digitSignature) {
    const dayDigitMatches = dayRows.filter(row => row.digitSignature === digitSignature)
    if (dayDigitMatches.length === 1) {
      return dayDigitMatches[0]
    }

    const globalDigitMatches = rows.filter(row => row.digitSignature === digitSignature)
    if (globalDigitMatches.length === 1) {
      return globalDigitMatches[0]
    }
  }

  return null
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
  }

function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/\r/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<div[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')

  return decodeHtmlEntities(withBreaks)
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizePlainText(value: string): string {
  return value
    .replace(/\uFFFC/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function fetchPlainTextByPk(pk: number): string | null {
  try {
    return execFileSync(
      'osascript',
      [
        '-e',
        'tell application "Notes"',
        '-e',
        `set matches to every note whose id contains "p${pk}"`,
        '-e',
        'if (count of matches) = 0 then return ""',
        '-e',
        'set targetNote to item 1 of matches',
        '-e',
        'return plaintext of targetNote',
        '-e',
        'end tell',
      ],
      {
        encoding: 'utf8',
        maxBuffer: OSASCRIPT_MAX_BUFFER,
      },
    ).trim()
  } catch {
    return null
  }
}

function fetchHtmlBodyByPk(pk: number): string | null {
  try {
    return execFileSync(
      'osascript',
      [
        '-e',
        'tell application "Notes"',
        '-e',
        `set matches to every note whose id contains "p${pk}"`,
        '-e',
        'if (count of matches) = 0 then return ""',
        '-e',
        'set targetNote to item 1 of matches',
        '-e',
        'return body of targetNote',
        '-e',
        'end tell',
      ],
      {
        encoding: 'utf8',
        maxBuffer: OSASCRIPT_MAX_BUFFER,
      },
    ).trim()
  } catch {
    return null
  }
}

export function maybeRecoverQimengNote(filePath: string): NotesFallbackRecord | null {
  const matched = pickMatchingNote(filePath)
  if (!matched) return null

  const plainText = normalizePlainText(fetchPlainTextByPk(matched.pk) || '')
  const htmlBody = fetchHtmlBodyByPk(matched.pk) || ''
  const recoveredPlainText = plainText || normalizePlainText(htmlToPlainText(htmlBody))

  return {
    lookupPk: matched.pk,
    title: matched.title,
    noteId: matched.noteId,
    folder: matched.folder || 'Notes',
    created: matched.created,
    modified: matched.modified,
    slug: buildLookupKey(filePath).slug,
    htmlBody,
    plainText: recoveredPlainText,
  }
}
