import type { ArchiveCandidate, ArchiveTargetKind, QimengFacet } from '../../lib/memory/archive-gate'

export type ArchiveDraft = {
  title: string
  room: string
  tagsText: string
  facets: QimengFacet[]
  targetKind: ArchiveTargetKind
}

export type ArchiveInboxRiskFilter = 'all' | 'duplicates' | 'clean'
export type ArchiveInboxSort = 'latest' | 'earliest' | 'duplicates' | 'customized'
export type ArchiveBulkMergeMode = 'append' | 'replace'

export type ArchiveBatchSessionOption = {
  id: string
  label: string
  count: number
}

export type ArchiveInboxBulkDraft = {
  room: string
  tagsText: string
  facets: QimengFacet[]
  tagsMode: ArchiveBulkMergeMode
  facetsMode: ArchiveBulkMergeMode
}

export function createEmptyArchiveInboxBulkDraft(): ArchiveInboxBulkDraft {
  return {
    room: '',
    tagsText: '',
    facets: [],
    tagsMode: 'append',
    facetsMode: 'append',
  }
}

export function parseArchiveTags(tagsText: string): string[] {
  return Array.from(
    new Set(
      tagsText
        .split(/[,\n，、]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ).slice(0, 8)
}

export function uniqueArchiveOptions(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

export function getArchiveBatchSessionId(candidate: Pick<ArchiveCandidate, 'metadata'>): string {
  return typeof candidate.metadata.batchSessionId === 'string' ? candidate.metadata.batchSessionId : ''
}

export function formatArchiveBatchSessionLabel(batchSessionId: string): string {
  const match = batchSessionId.match(/^qimeng-candidates-(.+)$/)
  if (!match) return batchSessionId

  const timestamp = match[1]
    .replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, 'T$1:$2:$3Z')
    .replace(/T(\d{2})-(\d{2})-(\d{2})\.(\d+)Z$/, 'T$1:$2:$3.$4Z')

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return batchSessionId

  return `启蒙批次 · ${date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })}`
}

export function buildArchiveBatchSessionOptions(candidates: ArchiveCandidate[]): ArchiveBatchSessionOption[] {
  const counts = new Map<string, number>()

  for (const candidate of candidates) {
    const batchSessionId = getArchiveBatchSessionId(candidate)
    if (!batchSessionId) continue
    counts.set(batchSessionId, (counts.get(batchSessionId) || 0) + 1)
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[0].localeCompare(left[0], 'en'))
    .map(([id, count]) => ({
      id,
      label: formatArchiveBatchSessionLabel(id),
      count,
    }))
}

export function buildArchiveInboxSearchText(candidate: ArchiveCandidate): string {
  return [
    candidate.title,
    candidate.room,
    candidate.targetLabel,
    candidate.targetSection,
    candidate.content,
    candidate.rationale,
    candidate.wingLabel,
    candidate.hallLabel,
    candidate.preview.sourcePointer,
    getArchiveBatchSessionId(candidate),
    formatArchiveBatchSessionLabel(getArchiveBatchSessionId(candidate)),
    ...candidate.tags,
  ]
    .join(' ')
    .toLowerCase()
}

export function filterAndSortPendingArchiveCandidates(
  candidates: ArchiveCandidate[],
  options: {
    query: string
    sourceSurface: string
    batchSessionId: string
    wing: string
    hall: string
    risk: ArchiveInboxRiskFilter
    sort: ArchiveInboxSort
  },
): ArchiveCandidate[] {
  const query = options.query.trim().toLowerCase()
  const filtered = candidates.filter((candidate) => {
    if (options.sourceSurface !== 'all' && candidate.sourceSurface !== options.sourceSurface) return false
    if (options.batchSessionId !== 'all' && getArchiveBatchSessionId(candidate) !== options.batchSessionId) return false
    if (options.wing !== 'all' && candidate.wing !== options.wing) return false
    if (options.hall !== 'all' && candidate.hall !== options.hall) return false
    if (options.risk === 'duplicates' && candidate.preview.duplicateCount === 0) return false
    if (options.risk === 'clean' && candidate.preview.duplicateCount > 0) return false
    if (query && !buildArchiveInboxSearchText(candidate).includes(query)) return false
    return true
  })

  return [...filtered].sort((left, right) => {
    const leftTs = new Date(left.updatedAt || left.createdAt || 0).getTime()
    const rightTs = new Date(right.updatedAt || right.createdAt || 0).getTime()

    switch (options.sort) {
      case 'earliest':
        return leftTs - rightTs
      case 'duplicates':
        if (right.preview.duplicateCount !== left.preview.duplicateCount) {
          return right.preview.duplicateCount - left.preview.duplicateCount
        }
        return rightTs - leftTs
      case 'customized':
        if (Number(right.preview.isCustomized) !== Number(left.preview.isCustomized)) {
          return Number(right.preview.isCustomized) - Number(left.preview.isCustomized)
        }
        return rightTs - leftTs
      case 'latest':
      default:
        return rightTs - leftTs
    }
  })
}

export function applyArchiveInboxBulkPatch(draft: ArchiveDraft, bulkDraft: ArchiveInboxBulkDraft): ArchiveDraft {
  const room = bulkDraft.room.trim() || draft.room
  const currentTags = parseArchiveTags(draft.tagsText)
  const incomingTags = parseArchiveTags(bulkDraft.tagsText)
  const tags =
    incomingTags.length === 0
      ? currentTags
      : bulkDraft.tagsMode === 'replace'
        ? incomingTags
        : mergeUniqueStrings([...currentTags, ...incomingTags]).slice(0, 8)

  const facets =
    bulkDraft.facets.length === 0
      ? draft.facets
      : bulkDraft.facetsMode === 'replace'
        ? [...bulkDraft.facets]
        : mergeUniqueFacets([...draft.facets, ...bulkDraft.facets])

  return {
    ...draft,
    room,
    tagsText: tags.join('，'),
    facets,
  }
}

export function hasArchiveInboxBulkPatch(bulkDraft: ArchiveInboxBulkDraft): boolean {
  return Boolean(
    bulkDraft.room.trim() || parseArchiveTags(bulkDraft.tagsText).length > 0 || bulkDraft.facets.length > 0,
  )
}

export function isArchiveDraftEqual(left: ArchiveDraft, right: ArchiveDraft): boolean {
  return (
    left.title === right.title &&
    left.targetKind === right.targetKind &&
    left.room.trim() === right.room.trim() &&
    parseArchiveTags(left.tagsText).join('||') === parseArchiveTags(right.tagsText).join('||') &&
    left.facets.join('||') === right.facets.join('||')
  )
}

function mergeUniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function mergeUniqueFacets(values: QimengFacet[]): QimengFacet[] {
  return Array.from(new Set(values))
}
