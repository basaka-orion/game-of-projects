import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkBibiGptProvider, fetchBibiGptSourceResult, saveBibiGptApiKey } from '../bibigpt'
import { buildSourceIntakeDiagnostics } from '../intake-diagnostics'
import { BIBI_PLATFORM_CAPABILITIES, detectBibiPlatform, platformStatusLabel } from '../platforms'
import { appendArtifactRecord, appendExportReceipt, appendProviderRun, artifactRecord, refreshSourceAsset, setLibraryReceipt, sourceAssetToExportJson } from '../source-asset'
import { getBiliUsableSourceText } from '../source-content'
import { hydrateBiliWorkspaceSource } from '../source-hydration'
import { createFileSourceWorkspace, createLocalArtifactPack, createLocalVideoInfo, createSampleBiliWorkspace } from '../state'
import { createLocalWanxiangResult } from '../wanxiang'

describe('BibiGPT-style source coverage', () => {
  afterEach(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined,
    })
  })

  it('keeps the referenced platform surface visible', () => {
    const ids = BIBI_PLATFORM_CAPABILITIES.map((item) => item.id)

    expect(ids).toEqual(
      expect.arrayContaining([
        'bilibili',
        'youtube',
        'x-twitter',
        'tiktok',
        'douyin',
        'kuaishou',
        'xiaohongshu',
        'dropbox',
        'google-drive',
        'baidu-netdisk',
        'aliyun-drive',
        'website',
        'podcast',
        'meeting',
        'lecture',
        'local-video',
        'local-audio',
        'local-image',
        'local-file',
      ]),
    )
  })

  it('detects major URL and local file sources', () => {
    expect(detectBibiPlatform('https://www.bilibili.com/video/BV1fX4y1Q7Ux/').id).toBe('bilibili')
    expect(detectBibiPlatform('https://youtu.be/DHhOgWPKIKU').id).toBe('youtube')
    expect(detectBibiPlatform('https://x.com/example/status/1').id).toBe('x-twitter')
    expect(detectBibiPlatform('https://pan.baidu.com/s/example').id).toBe('baidu-netdisk')
    expect(detectBibiPlatform('/Users/apple/Desktop/demo.png', 'image').id).toBe('local-image')
    expect(detectBibiPlatform('/Users/apple/Desktop/demo.mp4', 'video').id).toBe('local-video')
  })

  it('uses readable coverage status labels', () => {
    expect(platformStatusLabel('direct')).toBe('可直接接入')
    expect(platformStatusLabel('metadata')).toBe('元信息 + 内容兜底')
    expect(platformStatusLabel('local-first')).toBe('本地优先兜底')
  })

  it('marks whisper and vision imports as recognized content', () => {
    const media = createFileSourceWorkspace({
      filePath: '/Users/apple/Desktop/demo.mp4',
      fileName: 'demo.mp4',
      kind: 'video',
      method: 'whisper-local',
      content: '00:00 这是一个本地转写结果，足够进入学习包。',
      rawContent: '00:00 这是一个本地转写结果，足够进入学习包。',
    })
    const image = createFileSourceWorkspace({
      filePath: '/Users/apple/Desktop/screenshot.png',
      fileName: 'screenshot.png',
      kind: 'image',
      method: 'apple-vision-ocr-classify',
      content: '## 图片 OCR 文本\n标题\n\n## 图片视觉标签\n- diagram (88%)',
      rawContent: '标题\ndiagram',
    })

    expect(media.video.subtitleStatus).toBe('transcribed')
    expect(image.video.subtitleStatus).toBe('ocr')
    expect(buildSourceIntakeDiagnostics(media).recognitionLabel).toBe('本地转写')
    expect(buildSourceIntakeDiagnostics(image).recognitionLabel).toBe('图片 OCR/视觉识别')
  })

  it('keeps local placeholder media from becoming fake learning content', () => {
    const placeholder = [
      '# demo.mp4',
      '',
      '## 当前解析状态',
      '- 视频已接收；请把同名 .srt、.vtt、.txt 或 .md 字幕/转写稿放在同一文件夹，系统会自动合并。',
      '',
      '## 下一步',
      '- 需要更深解析时，请补充 OCR、字幕、音频转写或对应原始文字稿。',
    ].join('\n')
    const media = createFileSourceWorkspace({
      filePath: '/Users/apple/Desktop/demo.mp4',
      fileName: 'demo.mp4',
      kind: 'video',
      method: 'video-placeholder',
      content: placeholder,
      rawContent: placeholder,
    })

    expect(getBiliUsableSourceText(media.video, media.transcript)).toBe('')
    expect(buildSourceIntakeDiagnostics(media).contentLength).toBe(0)
    expect(media.wanxiang).toBeUndefined()
  })

  it('hydrates a metadata-only video workspace from yt-dlp subtitle output', async () => {
    const executeCommand = vi.fn(async (_command: string, _timeout?: number) => ({
      success: true,
      stdout: JSON.stringify({
        success: true,
        text: '00:00 真实字幕片段一。\n01:10 真实字幕片段二。\n03:20 真实字幕片段三。',
        method: 'yt-dlp-subtitle',
        files: ['source.zh.vtt'],
      }),
      stderr: '',
      exitCode: 0,
    }))
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { executeCommand },
    })
    const video = createLocalVideoInfo('https://www.youtube.com/watch?v=abc123def45', {
      title: '只有元信息的视频',
      platform: 'youtube',
      platformName: 'YouTube',
      sourceKind: 'video',
      subtitleStatus: 'missing',
      contentText: '',
    })
    const workspace = refreshSourceAsset({ video, transcript: '', chat: [] })

    const hydrated = await hydrateBiliWorkspaceSource(workspace)

    expect(executeCommand).toHaveBeenCalled()
    const command = executeCommand.mock.calls[0]?.[0] as string
    expect(command).toContain('("chrome", ["--cookies-from-browser", "chrome"])')
    expect(command).toContain('("safari", ["--cookies-from-browser", "safari"])')
    expect(command).toContain('("firefox", ["--cookies-from-browser", "firefox"])')
    expect(command).toContain('base + extra + [url]')
    expect(hydrated.sourceText).toContain('真实字幕片段')
    expect(hydrated.workspace.video.subtitleStatus).toBe('found')
    expect(hydrated.workspace.sourceAsset?.providerRuns.some((run) => run.provider === 'yt-dlp' && run.status === 'done')).toBe(true)

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined,
    })
  })

  it('treats existing subtitles as ready learning content', () => {
    const diagnostics = buildSourceIntakeDiagnostics(createSampleBiliWorkspace())
    const mediaStep = diagnostics.steps.find((step) => step.id === 'media')

    expect(diagnostics.recognitionLabel).toBe('同名字幕/文字稿')
    expect(mediaStep?.status).toBe('done')
    expect(diagnostics.nextActions).not.toContain('放入同名 .srt/.vtt/.txt，或安装 Whisper 后重新选择文件')
  })

  it('does not turn source-card-only Bilibili links into fake learning packs', () => {
    const video = createLocalVideoInfo('https://www.bilibili.com/video/BV1FN5X6DEYH/', {
      title: '特朗普：中美两国会有更美好的未来',
      owner: '央视新闻',
    })
    const pack = createLocalArtifactPack(video, '', '把这个来源转成资料地图、学习包和今天可执行的行动清单', 'tutorial', 70)

    expect(pack.summary).toContain('还没有拿到真实字幕')
    expect(pack.timeline).toHaveLength(0)
    expect(pack.markdown).toContain('暂无真实时间线')
    expect(pack.markdown).not.toContain('03:10 核心观点一')
    expect(pack.markdown).not.toContain('不要只收藏视频')

    const diagnostics = buildSourceIntakeDiagnostics({ video, transcript: '', pack, chat: [] })
    expect(diagnostics.contentLength).toBe(0)
    expect(diagnostics.recognitionLabel).toBe('元信息')
  })

  it('keeps Wanxiang source-card-only analysis on hold instead of absorbing a template', () => {
    const video = createLocalVideoInfo('https://www.bilibili.com/video/BV1FN5X6DEYH/', {
      title: '特朗普：中美两国会有更美好的未来',
      owner: '央视新闻',
    })
    const result = createLocalWanxiangResult({
      video,
      transcript: '',
      goal: '把这个来源转成资料地图、学习包和今天可执行的行动清单',
    })

    expect(result.teaching.isTeaching).toBe(false)
    expect(result.openbasakaFusion.applicable).toBe(false)
    expect(result.openbasakaFusion.absorptionVerdict).toContain('暂不吸收')
    expect(result.markdown).not.toContain('给超级小白看的教程')
  })

  it('builds a unified SourceAsset with pipeline, evidence, and export-safe receipts', () => {
    const workspace = refreshSourceAsset(createSampleBiliWorkspace())

    expect(workspace.sourceAsset?.pipeline.map((step) => step.id)).toEqual(
      expect.arrayContaining(['received', 'metadata', 'content', 'summary', 'chatIndex', 'exported']),
    )
    expect(workspace.sourceAsset?.evidenceRefs.length).toBeGreaterThan(0)

    const withProvider = appendProviderRun(workspace, {
      provider: 'bibigpt',
      capability: 'summary+subtitle',
      status: 'failed',
      detail: 'authorization: secret-token-should-redact',
      error: 'api_key=secret-token-should-redact',
      completedAt: Date.now(),
      receipt: { apiKey: 'secret-token-should-redact' },
    })
    const exported = sourceAssetToExportJson(withProvider)

    expect(exported).toContain('sourceAsset')
    expect(exported).not.toContain('secret-token-should-redact')
    expect(exported).toContain('[redacted]')
  })

  it('keeps generated, blocked, export, and archive receipts on the same SourceAsset', () => {
    const workspace = refreshSourceAsset(createSampleBiliWorkspace())
    const withGenerated = appendArtifactRecord(
      workspace,
      artifactRecord('learning-pack', '金句精华', '真实来源产物', 'local'),
    )
    const withBlocked = appendArtifactRecord(
      withGenerated,
      artifactRecord('wanxiang', '万象三结果', '缺真实字幕/正文/OCR/转写', 'local', 'blocked', 'missing source text'),
    )
    const withExport = appendExportReceipt(withBlocked, {
      format: 'json',
      outputName: 'source.json',
      status: 'done',
    })
    const withLibrary = setLibraryReceipt(withExport, {
      sourceId: 'source-123',
      folderPath: '知识+大佬/万象学习',
      archivedAt: Date.now(),
      mode: 'archive',
    })

    expect(withLibrary.sourceAsset?.artifacts.map((item) => item.status)).toEqual(expect.arrayContaining(['generated', 'blocked']))
    expect(withLibrary.sourceAsset?.exportReceipts[0]?.format).toBe('json')
    expect(withLibrary.sourceAsset?.libraryReceipt?.sourceId).toBe('source-123')
  })

  it('reports BibiGPT provider as unconfigured without leaking credentials', async () => {
    const original = (globalThis as any).window
    ;(globalThis as any).window = {
      electronAPI: {
        bibigptRequest: vi.fn(async () => ({ success: false, configured: false, error: 'BibiGPT API Key 未配置。' })),
      },
    }

    const status = await checkBibiGptProvider()

    expect(status.configured).toBe(false)
    expect(status.ok).toBe(false)
    expect(status.detail).toContain('未配置')
    ;(globalThis as any).window = original
  })

  it('saves BibiGPT API keys through the main-process configure bridge', async () => {
    const bibigptRequest = vi.fn(async (payload: Record<string, unknown>) => ({
      success: payload.action === 'configure',
      configured: payload.action === 'configure',
    }))
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { bibigptRequest },
    })

    const result = await saveBibiGptApiKey('bibi_test_key')

    expect(result.success).toBe(true)
    expect(bibigptRequest).toHaveBeenCalledWith({ action: 'configure', apiKey: 'bibi_test_key' })
  })

  it('parses BibiGPT subtitlesArray/contentText and falls back to summarizeWithConfig', async () => {
    const bibigptRequest = vi.fn(async (payload: Record<string, unknown>) => {
      if (payload.action === 'createSummaryTask') return { success: false, configured: true, error: 'async task unavailable' }
      if (payload.action === 'summarize') return { success: true, configured: true, data: { id: 'empty-content', detail: { title: '空摘要' } } }
      if (payload.action === 'summarizeWithConfig') {
        return {
          success: true,
          configured: true,
          data: {
            id: 'content-1',
            htmlUrl: 'https://bibigpt.co/detail/content-1',
            summary: '这是 BibiGPT 真实摘要。',
            detail: {
              contentId: 'content-1',
              summary: '这是 BibiGPT 真实摘要。',
              contentText: '这是完整正文兜底，不应该被忽略。',
              subtitlesArray: [
                { startTime: 0, text: '第一句真实字幕。' },
                { startTime: 65, text: '第二句真实字幕。' },
              ],
            },
          },
        }
      }
      if (payload.action === 'getSubtitle') {
        return {
          success: true,
          configured: true,
          data: {
            subtitlesArray: [{ from: 130, content: '第三句真实字幕。' }],
          },
        }
      }
      if (payload.action === 'mindmap') return { success: true, configured: true, data: { fileUrl: 'https://bibigpt.co/mindmap/content-1.md' } }
      return { success: false, configured: true, error: `unexpected action ${String(payload.action)}` }
    })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { bibigptRequest },
    })
    const video = createLocalVideoInfo('https://www.bilibili.com/video/BV1FN5X6DEYH/', {
      title: 'B站视频',
      platform: 'bilibili',
      platformName: 'Bilibili / B站',
      sourceKind: 'video',
      subtitleStatus: 'missing',
      contentText: '',
    })

    const result = await fetchBibiGptSourceResult(video)

    expect(bibigptRequest).toHaveBeenCalledWith({ action: 'summarizeWithConfig', url: video.url, includeDetail: true })
    expect(result.summary).toContain('真实摘要')
    expect(result.transcript).toContain('0:00 第一句真实字幕')
    expect(result.transcript).toContain('1:05 第二句真实字幕')
    expect(result.transcript).toContain('2:10 第三句真实字幕')
    expect(result.contentId).toBe('content-1')
    expect(result.providerRun.status).toBe('done')
    expect(result.providerRun.receipt).toMatchObject({
      contentId: 'content-1',
      subtitle: true,
      mindmapFileUrl: 'https://bibigpt.co/mindmap/content-1.md',
    })
  })
})
