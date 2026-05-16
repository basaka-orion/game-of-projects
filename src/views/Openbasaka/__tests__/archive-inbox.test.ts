import { describe, expect, it } from 'vitest'

import type { ArchiveCandidate } from '../../../lib/memory/archive-gate'
import {
  applyArchiveInboxBulkPatch,
  buildArchiveBatchSessionOptions,
  createEmptyArchiveInboxBulkDraft,
  filterAndSortPendingArchiveCandidates,
  formatArchiveBatchSessionLabel,
  hasArchiveInboxBulkPatch,
  type ArchiveDraft,
} from '../archive-inbox'

function makeCandidate(overrides: Partial<ArchiveCandidate> = {}): ArchiveCandidate {
  return {
    id: 'cand-1',
    conversationId: 'conv-1',
    messageId: 'msg-1',
    messageRole: 'assistant',
    content: '我想把自己的世界模型和系统方法整理进启蒙。',
    sourceSurface: 'openbasaka',
    agentRole: 'general',
    status: 'pending',
    archivedDrawerId: '',
    archivedSourceId: '',
    archivedPageId: '',
    metadata: {},
    createdAt: '2026-04-22T09:00:00.000Z',
    updatedAt: '2026-04-22T10:00:00.000Z',
    title: '世界模型整理',
    wing: 'worldview',
    wingLabel: '世界模型',
    hall: 'consciousness',
    hallLabel: '世界观',
    room: '方法论-系统归纳',
    targetKind: 'qimeng',
    targetLabel: '归入启蒙',
    targetSection: 'personal',
    suggestedTargets: [
      {
        kind: 'qimeng',
        label: '归入启蒙',
        section: 'personal',
        sectionLabel: '过往经历与思考',
        title: '方法论-系统归纳',
        path: '世界模型/世界观/方法论-系统归纳',
        reason: '属于 Boss 自己的长期思考。',
        confidence: 0.84,
        recommended: true,
      },
    ],
    tags: ['启蒙', '方法'],
    facets: ['decision'],
    rationale: '命中世界模型与方法论语义',
    preview: {
      sourcePointer: 'Openbasaka · conv-1 / msg-1',
      duplicateCount: 0,
      duplicateMatches: [],
      isCustomized: false,
    },
    ...overrides,
  }
}

describe('archive inbox helpers', () => {
  it('applies bulk room, tags, and facets without dropping previous values in append mode', () => {
    const draft: ArchiveDraft = {
      title: '世界模型整理',
      room: '方法论-系统归纳',
      tagsText: '启蒙，方法',
      facets: ['decision'],
      targetKind: 'qimeng',
    }

    const bulkDraft = createEmptyArchiveInboxBulkDraft()
    bulkDraft.room = '世界观-底层模型'
    bulkDraft.tagsText = '长期主义，启蒙'
    bulkDraft.facets = ['discovery', 'decision']

    const patched = applyArchiveInboxBulkPatch(draft, bulkDraft)

    expect(patched.room).toBe('世界观-底层模型')
    expect(patched.tagsText).toBe('启蒙，方法，长期主义')
    expect(patched.facets).toEqual(['decision', 'discovery'])
  })

  it('filters and sorts pending candidates by query and duplicate risk', () => {
    const candidates = [
      makeCandidate({
        id: 'cand-a',
        title: '系统演化笔记',
        wing: 'openbasaka',
        hall: 'technical',
        hallLabel: '结构与工程',
        updatedAt: '2026-04-22T12:00:00.000Z',
        preview: {
          sourcePointer: 'Openbasaka · conv-a / msg-a',
          duplicateCount: 2,
          duplicateMatches: [],
          isCustomized: true,
        },
      }),
      makeCandidate({
        id: 'cand-b',
        title: '世界模型整理',
        updatedAt: '2026-04-22T11:00:00.000Z',
        sourceSurface: 'qimeng-corpus',
        metadata: {
          batchSessionId: 'qimeng-candidates-2026-04-22T03-09-43Z',
        },
      }),
      makeCandidate({
        id: 'cand-c',
        title: '情绪记录',
        wing: 'identity',
        wingLabel: '自我定义',
        hall: 'emotions',
        hallLabel: '情绪与渴望',
        updatedAt: '2026-04-22T10:00:00.000Z',
      }),
    ]

    const filtered = filterAndSortPendingArchiveCandidates(candidates, {
      query: '系统',
      sourceSurface: 'all',
      batchSessionId: 'all',
      wing: 'all',
      hall: 'all',
      risk: 'duplicates',
      sort: 'duplicates',
    })

    expect(filtered.map(candidate => candidate.id)).toEqual(['cand-a'])
    expect(hasArchiveInboxBulkPatch(createEmptyArchiveInboxBulkDraft())).toBe(false)
  })

  it('builds and filters batch session options for corpus candidates', () => {
    const batchSessionId = 'qimeng-candidates-2026-04-22T03-09-43Z'
    const candidates = [
      makeCandidate({
        id: 'cand-b1',
        sourceSurface: 'qimeng-corpus',
        metadata: { batchSessionId },
      }),
      makeCandidate({
        id: 'cand-b2',
        sourceSurface: 'qimeng-corpus',
        metadata: { batchSessionId },
        title: '《数字经济大趋势》',
      }),
      makeCandidate({
        id: 'cand-openbasaka',
        sourceSurface: 'openbasaka',
      }),
    ]

    const options = buildArchiveBatchSessionOptions(candidates)
    expect(options).toEqual([
      {
        id: batchSessionId,
        label: formatArchiveBatchSessionLabel(batchSessionId),
        count: 2,
      },
    ])
    expect(options[0]?.label).toContain('启蒙批次')
    expect(options[0]?.label).not.toContain('qimeng-candidates-')

    const filtered = filterAndSortPendingArchiveCandidates(candidates, {
      query: '',
      sourceSurface: 'all',
      batchSessionId,
      wing: 'all',
      hall: 'all',
      risk: 'all',
      sort: 'latest',
    })

    expect(filtered.map(candidate => candidate.id)).toEqual(['cand-b1', 'cand-b2'])
  })
})
