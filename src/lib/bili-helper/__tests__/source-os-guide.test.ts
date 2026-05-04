import { describe, expect, it } from 'vitest'
import { createSampleBiliWorkspace } from '../state'
import { buildSourceOsArrowGeometry, buildSourceOsGuideState } from '../source-os-guide'
import type { BiliVideoWorkspace } from '../types'

function unpackedWorkspace(): BiliVideoWorkspace {
  const sample = createSampleBiliWorkspace()
  return {
    ...sample,
    pack: undefined,
  }
}

describe('SourceOS guide state', () => {
  it('starts with intake guidance before a source exists', () => {
    const state = buildSourceOsGuideState({
      processing: 'idle',
      workspace: null,
      view: 'workspace',
      artifactMode: 'tutorial',
    })

    expect(state.activeStep.id).toBe('intake')
    expect(state.progress).toBe(4)
    expect(state.cta).toContain('粘贴链接')
  })

  it('moves to resolving while parsing a source', () => {
    const state = buildSourceOsGuideState({
      processing: 'resolving',
      workspace: null,
      view: 'workspace',
      artifactMode: 'tutorial',
    })

    expect(state.activeStep.id).toBe('resolving')
    expect(state.intensity).toBe('active')
    expect(state.focusTarget).toBe('source-card')
  })

  it('points parsed sources toward Baoyu visual guidance', () => {
    const state = buildSourceOsGuideState({
      processing: 'idle',
      workspace: unpackedWorkspace(),
      view: 'workspace',
      artifactMode: 'mindmap',
    })

    expect(state.activeStep.id).toBe('visual-brief')
    expect(state.artifactMode).toBe('mindmap')
    expect(state.steps.find((step) => step.id === 'source-ready')?.status).toBe('complete')
    expect(state.focusTarget).toBe('baoyu-visuals')
  })

  it('shows active generation while building a pack', () => {
    const state = buildSourceOsGuideState({
      processing: 'generating',
      workspace: unpackedWorkspace(),
      view: 'workspace',
      artifactMode: 'actionable',
    })

    expect(state.activeStep.id).toBe('generating')
    expect(state.intensity).toBe('active')
    expect(state.headline).toContain('生成学习包')
  })

  it('celebrates a ready learning pack', () => {
    const state = buildSourceOsGuideState({
      processing: 'idle',
      workspace: createSampleBiliWorkspace(),
      view: 'tutorial',
      artifactMode: 'tutorial',
    })

    expect(state.activeStep.id).toBe('pack-ready')
    expect(state.intensity).toBe('celebrate')
    expect(state.progress).toBeGreaterThanOrEqual(90)
  })

  it('switches to dialog and export guidance for chat and downloads', () => {
    const chatState = buildSourceOsGuideState({
      processing: 'chatting',
      workspace: createSampleBiliWorkspace(),
      view: 'chat',
      artifactMode: 'tutorial',
    })
    const downloadState = buildSourceOsGuideState({
      processing: 'idle',
      workspace: createSampleBiliWorkspace(),
      view: 'downloads',
      artifactMode: 'tutorial',
    })

    expect(chatState.activeStep.id).toBe('dialog-export')
    expect(chatState.intensity).toBe('active')
    expect(downloadState.activeStep.id).toBe('dialog-export')
    expect(downloadState.cta).toContain('导出')
  })

  it('builds a short target-aware Remotion arrow', () => {
    const arrow = buildSourceOsArrowGeometry({
      rootRect: { left: 100, top: 100, width: 700, height: 220 },
      targetRect: { left: 610, top: 165, width: 120, height: 80 },
      width: 700,
      height: 220,
      compact: true,
    })

    expect(arrow.endX).toBeGreaterThan(arrow.startX)
    expect(Math.hypot(arrow.endX - arrow.startX, arrow.endY - arrow.startY)).toBeLessThanOrEqual(151)
  })
})
