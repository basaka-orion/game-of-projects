import { describe, expect, it } from 'vitest'
import { getFileIntakeKind, isFileSupported, shouldWrapAsCode } from '../ingest'

describe('universal knowledge intake', () => {
  it('accepts text, document, media, and source-code formats', () => {
    expect(isFileSupported('note.md')).toBe(true)
    expect(isFileSupported('paper.pdf')).toBe(true)
    expect(isFileSupported('brief.docx')).toBe(true)
    expect(isFileSupported('screenshot.png')).toBe(true)
    expect(isFileSupported('voice.m4a')).toBe(true)
    expect(isFileSupported('demo.mov')).toBe(true)
    expect(isFileSupported('demo.srt')).toBe(true)
    expect(isFileSupported('demo.vtt')).toBe(true)
  })

  it('classifies intake kind before parsing', () => {
    expect(getFileIntakeKind('note.md')).toBe('text')
    expect(getFileIntakeKind('paper.pdf')).toBe('pdf')
    expect(getFileIntakeKind('brief.docx')).toBe('document')
    expect(getFileIntakeKind('screenshot.heic')).toBe('image')
    expect(getFileIntakeKind('voice.mp3')).toBe('audio')
    expect(getFileIntakeKind('demo.mp4')).toBe('video')
    expect(getFileIntakeKind('demo.srt')).toBe('text')
  })

  it('wraps code files but not documents or media placeholders', () => {
    expect(shouldWrapAsCode('agent.ts')).toBe(true)
    expect(shouldWrapAsCode('paper.pdf')).toBe(false)
    expect(shouldWrapAsCode('photo.png')).toBe(false)
  })
})
