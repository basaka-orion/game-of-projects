import { describe, expect, it } from 'vitest'
import { BIBI_PLATFORM_CAPABILITIES, detectBibiPlatform, platformStatusLabel } from '../platforms'

describe('BibiGPT-style source coverage', () => {
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
})
