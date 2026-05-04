import { chatCompletion, type ChatMessage } from '../ai/provider'
import {
  BILI_ARTIFACT_MODES,
  createBiliChatMessage,
  createLocalArtifactPack,
  createLocalVideoInfo,
  parseTranscriptTimeline,
} from './state'
import { detectBibiPlatform } from './platforms'
import { getBaoyuModelRoute, type BaoyuModelRoute } from './model-routing'
import type { BiliArtifactMode, BiliChatMessage, BiliLearningPack, BiliVideoInfo } from './types'

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  try {
    return JSON.parse(trimmed)
  } catch {}
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1))
  throw new Error('AI response is not JSON')
}

async function callBiliAI(messages: ChatMessage[], maxTokens = 2200, route: BaoyuModelRoute = 'primary-structured'): Promise<string> {
  const config = getBaoyuModelRoute(route).config
  if (!config.apiKey && config.provider !== 'ollama') throw new Error('LLM is not configured')
  return chatCompletion(config, messages, 0.45, maxTokens)
}

async function fetchJsonWithFallback(url: string, timeout = 5500): Promise<any> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (firstError) {
    const electronAPI = (window as any)?.electronAPI
    if (!electronAPI?.fetchUrl) throw firstError
    const fetched = await electronAPI.fetchUrl(url)
    if (fetched?.error) throw new Error(fetched.error)
    const text = String(fetched?.content || '').trim()
    if (!text) throw firstError
    return JSON.parse(text)
  }
}

async function fetchUrlMetadata(url: string): Promise<{
  title?: string
  description?: string
  author?: string
  content?: string
  cover?: string
  siteName?: string
  canonicalUrl?: string
  favicon?: string
}> {
  const electronAPI = (window as any)?.electronAPI
  if (!electronAPI?.fetchUrl || !/^https?:\/\//i.test(url)) return {}
  try {
    const fetched = await electronAPI.fetchUrl(url)
    if (fetched?.error) return {}
    return {
      title: fetched.title,
      description: fetched.description,
      author: fetched.author,
      content: fetched.content,
      cover: fetched.cover,
      siteName: fetched.siteName,
      canonicalUrl: fetched.canonicalUrl,
      favicon: fetched.favicon,
    }
  } catch {
    return {}
  }
}

function urlHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function extractYoutubeId(url: string): string {
  const direct = url.match(/[?&]v=([a-zA-Z0-9_-]{6,})/)?.[1]
  if (direct) return direct
  return url.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/)?.[1] || ''
}

function zeroStats() {
  return { views: 0, danmaku: 0, likes: 0, coins: 0, favorites: 0, shares: 0 }
}

function cleanOneLine(value?: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export async function resolveBiliVideoInfo(url: string): Promise<BiliVideoInfo> {
  const local = createLocalVideoInfo(url)
  const detected = detectBibiPlatform(url)
  const host = urlHost(url)

  if (detected.id === 'youtube') {
    const videoId = extractYoutubeId(url)
    const meta = await fetchUrlMetadata(url)
    return createLocalVideoInfo(url, {
      bvid: videoId ? `YT-${videoId}` : local.bvid,
      platform: 'youtube',
      platformName: detected.label,
      sourceKind: 'video',
      inputType: 'url',
      title: cleanOneLine(meta.title) || (videoId ? `YouTube 视频 · ${videoId}` : local.title),
      owner: cleanOneLine(meta.author) || host || 'YouTube Creator',
      cover: cleanOneLine(meta.cover) || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : local.cover),
      description: cleanOneLine(meta.description) || local.description,
      durationSeconds: 0,
      tags: ['YouTube', '视频', 'BibiGPT 兼容来源'],
      stats: zeroStats(),
      pages: [{ index: 1, title: cleanOneLine(meta.title) || '主视频', durationSeconds: 0 }],
      contentText: meta.content,
      subtitleStatus: 'missing',
      capabilities: [detected.intake, detected.organize, detected.chat],
      resolvedBy: meta.title ? 'api' : 'local',
    })
  }

  if (detected.id !== 'bilibili' || !/^BV[0-9A-Za-z]{8,14}$/.test(local.bvid)) {
    const meta = await fetchUrlMetadata(url)
    return createLocalVideoInfo(url, {
      platform: detected.id,
      platformName: detected.label,
      sourceKind: detected.kind,
      inputType: /^https?:\/\//i.test(url) ? 'url' : 'manual',
      title: cleanOneLine(meta.title) || (host ? `${detected.label} · ${host}` : local.title),
      owner: cleanOneLine(meta.author) || host || '公开来源',
      cover: cleanOneLine(meta.cover) || local.cover,
      description: cleanOneLine(meta.description) || local.description,
      durationSeconds: 0,
      tags: [detected.label, detected.kind, 'BibiGPT 兼容来源'],
      stats: zeroStats(),
      pages: [{ index: 1, title: cleanOneLine(meta.title) || detected.label, durationSeconds: 0 }],
      contentText: meta.content,
      siteName: cleanOneLine(meta.siteName) || host,
      canonicalUrl: cleanOneLine(meta.canonicalUrl),
      favicon: cleanOneLine(meta.favicon),
      subtitleStatus: detected.kind === 'webpage' ? 'metadata' : 'missing',
      capabilities: [detected.intake, detected.organize, detected.chat],
      resolvedBy: meta.title || meta.content ? 'api' : 'local',
    })
  }

  try {
    const data = await fetchJsonWithFallback(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(local.bvid)}`)
    const item = data?.data
    if (!item?.title) return local
    return createLocalVideoInfo(url, {
      platform: 'bilibili',
      platformName: detected.label,
      sourceKind: 'video',
      inputType: 'url',
      bvid: item.bvid || local.bvid,
      aid: item.aid ? String(item.aid) : local.aid,
      title: item.title,
      owner: item.owner?.name || local.owner,
      cover: item.pic || local.cover,
      description: item.desc || local.description,
      durationSeconds: item.duration || local.durationSeconds,
      tags: Array.isArray(item.tname) ? [item.tname] : [item.tname || 'Bilibili'].filter(Boolean),
      stats: {
        views: item.stat?.view || local.stats.views,
        danmaku: item.stat?.danmaku || local.stats.danmaku,
        likes: item.stat?.like || local.stats.likes,
        coins: item.stat?.coin || local.stats.coins,
        favorites: item.stat?.favorite || local.stats.favorites,
        shares: item.stat?.share || local.stats.shares,
      },
      pages: Array.isArray(item.pages)
        ? item.pages.map((page: { page?: number; part?: string; duration?: number }, index: number) => ({
            index: page.page || index + 1,
            title: page.part || `P${index + 1}`,
            durationSeconds: page.duration || 0,
          }))
        : local.pages,
      subtitleStatus: 'missing',
      capabilities: [detected.intake, detected.organize, detected.chat],
      resolvedBy: 'api',
    })
  } catch {
    return local
  }
}

export async function generateBiliLearningPack(input: {
  video: BiliVideoInfo
  transcript: string
  goal: string
  mode?: BiliArtifactMode
  depth?: number
}): Promise<BiliLearningPack> {
  const mode = input.mode || 'tutorial'
  const depth = input.depth ?? 70
  const fallback = createLocalArtifactPack(input.video, input.transcript, input.goal, mode, depth)
  const modeLabel = BILI_ARTIFACT_MODES.find((item) => item.id === mode)?.label || '学习包'
  try {
    const response = await callBiliAI(
      [
        {
          role: 'system',
          content: `你是 OpenBasaka 的多来源学习助手，学习了 BibiGPT 的跨平台来源整理思路，但输出必须服务本地知识库。
你的任务是把视频、网页、文件、图片 OCR、音频转写或社交链接，转成可归档、可追问、可执行的学习包。
必须输出 JSON，不要 markdown 代码块。语言：简体中文。`,
        },
        {
          role: 'user',
          content: `来源标题：${input.video.title}
平台：${input.video.platformName}
来源类型：${input.video.sourceKind}
作者/来源：${input.video.owner}
来源 ID：${input.video.bvid}
描述：${input.video.description}
用户目标：${input.goal || '把视频变成可复用学习包'}
生成模式：${modeLabel}
详细度：${depth}%

来源正文/字幕/转写/OCR：
${input.transcript || input.video.contentText || '用户还没有提供正文，请基于标题、平台、简介和目标生成可继续补充的结构。'}

请返回 JSON：
{
  "summary": "一段摘要",
  "outline": ["资料地图节点"],
  "timeline": [{"time":"00:00","title":"片段标题","note":"片段笔记"}],
  "keyPoints": ["关键点"],
  "tutorial": "Markdown 教程",
  "actionList": ["行动"],
  "questions": ["可追问问题"]
}`,
        },
      ],
      3600,
    )
    const parsed = extractJsonObject(response) as Partial<BiliLearningPack>
    const timeline = Array.isArray(parsed.timeline) && parsed.timeline.length > 0 ? parsed.timeline : parseTranscriptTimeline(input.transcript)
    const pack: BiliLearningPack = {
      ...fallback,
      mode,
      depth,
      summary: String(parsed.summary || fallback.summary),
      outline: Array.isArray(parsed.outline) ? parsed.outline.map(String) : fallback.outline,
      timeline: timeline.map((item) => ({
        time: String(item.time || '00:00'),
        title: String(item.title || '片段'),
        note: String(item.note || ''),
      })),
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String) : fallback.keyPoints,
      tutorial: String(parsed.tutorial || fallback.tutorial),
      actionList: Array.isArray(parsed.actionList) ? parsed.actionList.map(String) : fallback.actionList,
      questions: Array.isArray(parsed.questions) ? parsed.questions.map(String) : fallback.questions,
      generatedBy: 'ai',
    }
    pack.markdown = buildMarkdownFromPack(input.video, pack)
    return pack
  } catch {
    return fallback
  }
}

function buildMarkdownFromPack(video: BiliVideoInfo, pack: BiliLearningPack): string {
  return `# ${video.title}

Source: ${video.url}
Platform: ${video.platformName}
Source kind: ${video.sourceKind}
Source ID: ${video.bvid}
Owner: ${video.owner}
Mode: ${pack.mode}
Depth: ${pack.depth}%

## 摘要

${pack.summary}

## 资料地图

${pack.outline.map((item) => `- ${item}`).join('\n')}

## 时间线

${pack.timeline.map((item) => `- ${item.time} ${item.title}: ${item.note}`).join('\n')}

## 关键点

${pack.keyPoints.map((item) => `- ${item}`).join('\n')}

## 教程

${pack.tutorial}

## 行动清单

${pack.actionList.map((item) => `- [ ] ${item}`).join('\n')}

## 可追问问题

${pack.questions.map((item) => `- ${item}`).join('\n')}`
}

export async function answerBiliQuestion(input: {
  video: BiliVideoInfo
  transcript: string
  pack?: BiliLearningPack
  history: BiliChatMessage[]
  question: string
}): Promise<BiliChatMessage> {
  const fallback = fallbackAnswer(input)
  try {
    const historyText = input.history.map((item) => `${item.role === 'user' ? '用户' : '助手'}：${item.content}`).join('\n')
    const response = await callBiliAI(
      [
        {
          role: 'system',
          content: '你是本地优先的多来源学习问答助手。只基于已提供的来源信息、网页正文、字幕、OCR、转写和学习包回答；不确定就指出需要回原来源核对。',
        },
        {
          role: 'user',
          content: `来源：${input.video.title}
平台：${input.video.platformName}
来源 ID：${input.video.bvid}
摘要：${input.pack?.summary || '暂无'}
关键点：${input.pack?.keyPoints.join('；') || '暂无'}
来源正文/字幕/OCR/转写：
${input.transcript || input.video.contentText || '暂无'}

历史对话：
${historyText}

问题：${input.question}`,
        },
      ],
      1600,
    )
    return createBiliChatMessage('assistant', response.trim() || fallback.content)
  } catch {
    return fallback
  }
}

function fallbackAnswer(input: {
  video: BiliVideoInfo
  transcript: string
  pack?: BiliLearningPack
  question: string
}): BiliChatMessage {
  const firstAction = input.pack?.actionList[0] || '先补充字幕或转写，再生成学习包。'
  const keyPoint = input.pack?.keyPoints[0] || '把来源内容转成自己的下一步，而不是停留在收藏。'
  const timeline = input.pack?.timeline[0]
  const content = `基于当前资料，「${input.video.title}」最稳定的判断是：${keyPoint}

如果你的问题是“下一步做什么”，我会先做这件事：${firstAction}

${timeline ? `可回看/核对位置：${timeline.time} ${timeline.title}，用于核对「${timeline.note}」。` : '当前还没有可靠时间线或正文，建议先粘贴字幕、导入文件、OCR 图片或补充转写。'}`
  return createBiliChatMessage('assistant', content)
}
