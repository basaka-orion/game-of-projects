import type { BiliVideoInfo } from './types'

export const BILI_EXAMPLE_TRANSCRIPT = `00:00 开场说明：这个视频要解决什么问题，以及为什么值得看。
01:24 背景铺垫：作者解释现有方法的限制。
03:10 核心观点一：先把复杂任务拆成可验证的小步骤。
06:42 核心观点二：不要只收藏视频，要把它转成自己的行动清单。
09:18 示例演示：从一个真实输入开始整理素材。
12:40 复盘：哪些内容应该进入笔记，哪些只作为参考。
15:05 结尾：下一步练习和延伸资料。`

export const BILI_EXAMPLE_BVID = 'BV1xx411c7mD'

function compact(value: string | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function isBiliPlaceholderSourceText(value: string | undefined): boolean {
  const text = compact(value)
  if (!text) return false
  return [
    /## 当前解析状态.*## 下一步/,
    /需要更深解析时，请补充 OCR、字幕、音频转写或对应原始文字稿/,
    /没有找到同名字幕.*本地 whisper/i,
    /未检测到本地 Whisper/i,
    /请把同名 \.srt、\.vtt、\.txt 或 \.md/,
    /视频已接收；请把同名/,
    /音频已接收；请把同名/,
    /图片已接收；如果它是截图、海报或图表/,
    /文档已接收，但本机暂时没有抽取到稳定文本/,
    /PDF 已接收，但没有抽取到正文/,
    /这个文件类型暂时只能作为来源对象保存/,
  ].some((pattern) => pattern.test(text))
}

export function isBiliExampleTranscript(value: string | undefined): boolean {
  return compact(value) === compact(BILI_EXAMPLE_TRANSCRIPT)
}

export function getBiliUsableSourceText(video: BiliVideoInfo, transcript = ''): string {
  const transcriptText = compact(transcript)
  if (
    transcriptText &&
    !isBiliPlaceholderSourceText(transcriptText) &&
    (!isBiliExampleTranscript(transcriptText) || video.bvid === BILI_EXAMPLE_BVID)
  ) {
    return transcript.trim()
  }

  const contentText = compact(video.contentText)
  const description = compact(video.description)
  if (contentText && contentText !== description && contentText.length >= 24 && !isBiliPlaceholderSourceText(contentText)) {
    return String(video.contentText || '').trim()
  }

  return ''
}

export function hasBiliUsableSourceText(video: BiliVideoInfo, transcript = ''): boolean {
  return compact(getBiliUsableSourceText(video, transcript)).length >= 24
}
