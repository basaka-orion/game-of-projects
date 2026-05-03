import { describe, expect, it } from 'vitest'
import { getNotebookArtifactSpecs, inferNotebookArtifactKind } from '../notebook-studio'

describe('notebook studio', () => {
  it('keeps a practical artifact menu available', () => {
    const kinds = getNotebookArtifactSpecs().map((spec) => spec.kind)
    expect(kinds).toContain('source-map')
    expect(kinds).toContain('briefing')
    expect(kinds).toContain('faq')
    expect(kinds).toContain('podcast-script')
    expect(kinds).toContain('action-plan')
  })

  it('infers artifact kind from beginner-friendly commands', () => {
    expect(inferNotebookArtifactKind('帮我整理成 FAQ 问答')).toBe('faq')
    expect(inferNotebookArtifactKind('做一份时间线和阶段变化')).toBe('timeline')
    expect(inferNotebookArtifactKind('生成适合小白理解的播客脚本')).toBe('podcast-script')
    expect(inferNotebookArtifactKind('把这些变成可执行的行动清单')).toBe('action-plan')
    expect(inferNotebookArtifactKind('彻底拆开这些资料')).toBe('source-map')
  })
})
