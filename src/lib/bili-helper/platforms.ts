import type { BiliPlatformCapability, BiliSourceKind, BiliSourcePlatform } from './types'

export const BIBI_PLATFORM_CAPABILITIES: BiliPlatformCapability[] = [
  {
    id: 'bilibili',
    label: 'Bilibili / B站',
    aliases: ['bilibili.com', 'b23.tv', 'BV'],
    kind: 'video',
    intake: 'B站 API 抓取标题、封面、简介、UP、分 P 与播放数据；可继续接字幕或本地转写。',
    organize: '封面卡、时间线、学习包、字幕、Markdown 和下载任务。',
    chat: '基于视频信息、字幕/转写、学习包继续追问。',
    status: 'direct',
    examples: ['https://www.bilibili.com/video/BV1fX4y1Q7Ux/'],
  },
  {
    id: 'youtube',
    label: 'YouTube',
    aliases: ['youtube.com', 'youtu.be'],
    kind: 'video',
    intake: '识别视频 ID，自动生成封面并抓取公开网页元信息；字幕可粘贴、导入或转写。',
    organize: '同 B站视频进入摘要、导图、考题、时间线、行动清单和对话。',
    chat: '围绕公开元信息和导入字幕追问。',
    status: 'metadata',
    examples: ['https://www.youtube.com/watch?v=DHhOgWPKIKU'],
  },
  {
    id: 'x-twitter',
    label: 'X / Twitter / Tweet',
    aliases: ['x.com', 'twitter.com'],
    kind: 'social',
    intake: '抓取公开网页元信息；不可公开读取的内容可通过复制正文或本地截图 OCR 接入。',
    organize: '整理为观点卡、证据链、反方问题和可归档笔记。',
    chat: '基于截取正文、OCR 或网页文本追问。',
    status: 'metadata',
    examples: ['https://x.com/.../status/...'],
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    aliases: ['tiktok.com'],
    kind: 'video',
    intake: '识别链接并保存元信息；公开视频可走下载/转写链路，受平台限制时使用本地文件兜底。',
    organize: '短视频摘要、金句、时间线和二次创作清单。',
    chat: '导入字幕或转写后可继续问答。',
    status: 'metadata',
    examples: ['https://www.tiktok.com/@user/video/123'],
  },
  {
    id: 'douyin',
    label: '抖音 / Douyin',
    aliases: ['douyin.com', 'iesdouyin.com'],
    kind: 'video',
    intake: '识别公开链接并记录来源；复杂反爬内容先用本地下载文件或字幕兜底。',
    organize: '短视频脚本拆解、钩子、结构、行动清单。',
    chat: '围绕转写、文案或截图 OCR 追问。',
    status: 'metadata',
    examples: ['https://www.douyin.com/video/...'],
  },
  {
    id: 'kuaishou',
    label: '快手 / Kuaishou',
    aliases: ['kuaishou.com', 'kwai.com'],
    kind: 'video',
    intake: '识别公开链接，保存平台、作者和网页元信息；本地文件兜底。',
    organize: '短视频内容地图、爆点、可执行复用点。',
    chat: '基于转写/文案/截图继续对话。',
    status: 'metadata',
    examples: ['https://www.kuaishou.com/short-video/...'],
  },
  {
    id: 'xiaohongshu',
    label: '小红书 / Xiaohongshu',
    aliases: ['xiaohongshu.com', 'xhslink.com'],
    kind: 'social',
    intake: '公开链接元信息、截图 OCR、手动复制正文三路接入。',
    organize: '种草笔记结构、图片文字、清单和复盘。',
    chat: '基于正文/OCR/图片说明追问。',
    status: 'metadata',
    examples: ['https://www.xiaohongshu.com/explore/...'],
  },
  {
    id: 'dropbox',
    label: 'Dropbox',
    aliases: ['dropbox.com'],
    kind: 'cloud',
    intake: '保存公开分享链接元信息；私有文件请通过本地文件导入。',
    organize: '文件正文、音视频转写、图片 OCR、资料包。',
    chat: '基于导入文件内容问答。',
    status: 'local-first',
    examples: ['https://www.dropbox.com/s/...'],
  },
  {
    id: 'google-drive',
    label: 'Google Drive',
    aliases: ['drive.google.com', 'docs.google.com'],
    kind: 'cloud',
    intake: '公开链接可抓元信息；私有 Drive 内容走本地导入或复制正文。',
    organize: '文档、表格导出文本、会议材料和学习包。',
    chat: '基于导入文本、文件解析结果问答。',
    status: 'local-first',
    examples: ['https://drive.google.com/file/d/...'],
  },
  {
    id: 'baidu-netdisk',
    label: '百度网盘 / Baidu Netdisk',
    aliases: ['pan.baidu.com', 'eyun.baidu.com'],
    kind: 'cloud',
    intake: '保存分享链接与提取码线索；实际内容以本地下载文件导入为准。',
    organize: '下载后的音视频、文档、图片进入同一整理链路。',
    chat: '基于文件解析/转写/OCR 追问。',
    status: 'local-first',
    examples: ['https://pan.baidu.com/s/...'],
  },
  {
    id: 'aliyun-drive',
    label: '阿里云盘 / Aliyun Drive',
    aliases: ['aliyundrive.com', 'alipan.com'],
    kind: 'cloud',
    intake: '保存公开分享链接；私有内容用本地文件导入兜底。',
    organize: '云盘文件下载后统一转成资料地图和学习包。',
    chat: '基于导入内容追问。',
    status: 'local-first',
    examples: ['https://www.aliyundrive.com/s/...'],
  },
  {
    id: 'website',
    label: '网页 / Websites',
    aliases: ['http://', 'https://'],
    kind: 'webpage',
    intake: '通过 Electron 主进程抓取网页标题、描述、正文，绕开普通浏览器 CORS。',
    organize: '文章摘要、证据链、资料地图、复盘和问题清单。',
    chat: '基于网页正文继续问答。',
    status: 'direct',
    examples: ['https://example.com/article'],
  },
  {
    id: 'podcast',
    label: '播客 / Podcasts',
    aliases: ['podcasts.apple.com', 'xiaoyuzhoufm.com', 'rss'],
    kind: 'podcast',
    intake: '保存播客链接；音频文件可本地转写，RSS/网页元信息可抓取。',
    organize: '播客摘要、观点时间线、行动清单。',
    chat: '基于转写稿追问。',
    status: 'local-first',
    examples: ['https://podcasts.apple.com/...'],
  },
  {
    id: 'meeting',
    label: '会议 / Meetings',
    aliases: ['zoom.us', 'meet.google.com', 'teams.microsoft.com'],
    kind: 'meeting',
    intake: '会议链接保存为来源；录音、录像、纪要文件本地导入解析。',
    organize: '会议纪要、决策、待办、风险和追问。',
    chat: '基于纪要或转写追问。',
    status: 'local-first',
    examples: ['https://meet.google.com/...'],
  },
  {
    id: 'lecture',
    label: '讲座 / Lectures',
    aliases: ['lecture', 'course', 'class'],
    kind: 'video',
    intake: '课程/讲座链接、文件、字幕都可接入。',
    organize: '教程化复盘、考题、知识结构、练习清单。',
    chat: '基于课程资料继续学习对话。',
    status: 'local-first',
    examples: ['本地课程视频.mp4'],
  },
  {
    id: 'local-video',
    label: '本地视频 / Local video',
    aliases: ['mp4', 'mov', 'mkv', 'webm'],
    kind: 'video',
    intake: '优先读取同名字幕/转写；没有字幕时调用本地 Whisper。',
    organize: '视频学习包、时间线、导出和追问。',
    chat: '基于字幕/转写问答。',
    status: 'direct',
    examples: ['~/Movies/lecture.mp4'],
  },
  {
    id: 'local-audio',
    label: '本地音频 / Local audio',
    aliases: ['mp3', 'm4a', 'wav', 'flac', 'ogg'],
    kind: 'audio',
    intake: '优先同名转写；没有转写时调用本地 Whisper。',
    organize: '播客/会议/音频笔记、摘要和行动清单。',
    chat: '基于音频转写追问。',
    status: 'direct',
    examples: ['~/Music/interview.m4a'],
  },
  {
    id: 'local-image',
    label: '图片 / Local image',
    aliases: ['png', 'jpg', 'jpeg', 'webp', 'heic'],
    kind: 'image',
    intake: 'Spotlight / Apple Vision OCR 提取图片文字；无文字时保留图片来源对象。',
    organize: '图片文字、海报信息、图表说明、待核对点。',
    chat: '基于 OCR 或手动补充说明追问。',
    status: 'direct',
    examples: ['~/Desktop/screenshot.png'],
  },
  {
    id: 'local-file',
    label: '本地文件 / Local file',
    aliases: ['pdf', 'docx', 'md', 'txt', 'csv'],
    kind: 'file',
    intake: '读取文本、Markdown、文档、PDF；失败时保留来源并提示补文本。',
    organize: '文档摘要、章节地图、行动清单、问答。',
    chat: '基于文件正文追问。',
    status: 'direct',
    examples: ['~/Documents/report.pdf'],
  },
]

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm', 'mkv'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'wav', 'aac', 'flac', 'ogg'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'tif', 'tiff'])
const DOCUMENT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'rtf', 'odt', 'md', 'txt', 'markdown', 'json', 'csv'])

function extensionOf(input: string): string {
  return input.toLowerCase().match(/\.([^.?#/]+)(?:[?#].*)?$/)?.[1] || ''
}

function normalizeInput(input: string): string {
  return input.trim().toLowerCase()
}

function capabilityById(id: BiliSourcePlatform): BiliPlatformCapability {
  return BIBI_PLATFORM_CAPABILITIES.find((item) => item.id === id) || BIBI_PLATFORM_CAPABILITIES[BIBI_PLATFORM_CAPABILITIES.length - 1]
}

export function detectBibiPlatform(input: string, fileKind?: string): BiliPlatformCapability {
  const normalized = normalizeInput(input)
  const ext = extensionOf(input)

  if (fileKind === 'video' || VIDEO_EXTENSIONS.has(ext)) return capabilityById('local-video')
  if (fileKind === 'audio' || AUDIO_EXTENSIONS.has(ext)) return capabilityById('local-audio')
  if (fileKind === 'image' || IMAGE_EXTENSIONS.has(ext)) return capabilityById('local-image')
  if (fileKind === 'document' || fileKind === 'pdf' || fileKind === 'text' || DOCUMENT_EXTENSIONS.has(ext)) return capabilityById('local-file')

  if (/BV[0-9A-Za-z]{8,14}/.test(input) || normalized.includes('bilibili.com') || normalized.includes('b23.tv')) return capabilityById('bilibili')
  if (normalized.includes('youtube.com') || normalized.includes('youtu.be')) return capabilityById('youtube')
  if (normalized.includes('twitter.com') || normalized.includes('x.com')) return capabilityById('x-twitter')
  if (normalized.includes('tiktok.com')) return capabilityById('tiktok')
  if (normalized.includes('douyin.com') || normalized.includes('iesdouyin.com')) return capabilityById('douyin')
  if (normalized.includes('kuaishou.com') || normalized.includes('kwai.com')) return capabilityById('kuaishou')
  if (normalized.includes('xiaohongshu.com') || normalized.includes('xhslink.com')) return capabilityById('xiaohongshu')
  if (normalized.includes('dropbox.com')) return capabilityById('dropbox')
  if (normalized.includes('drive.google.com') || normalized.includes('docs.google.com')) return capabilityById('google-drive')
  if (normalized.includes('pan.baidu.com') || normalized.includes('eyun.baidu.com')) return capabilityById('baidu-netdisk')
  if (normalized.includes('aliyundrive.com') || normalized.includes('alipan.com')) return capabilityById('aliyun-drive')
  if (normalized.includes('podcasts.apple.com') || normalized.includes('xiaoyuzhoufm.com') || normalized.endsWith('.xml')) return capabilityById('podcast')
  if (normalized.includes('zoom.us') || normalized.includes('meet.google.com') || normalized.includes('teams.microsoft.com')) return capabilityById('meeting')
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return capabilityById('website')

  return {
    id: 'unknown',
    label: '未知来源',
    aliases: [],
    kind: 'file' as BiliSourceKind,
    intake: '先作为手动来源保存，后续可补 URL、正文或文件。',
    organize: '可以整理为普通资料包。',
    chat: '基于用户补充内容追问。',
    status: 'local-first',
    examples: [],
  }
}

export function platformStatusLabel(status: BiliPlatformCapability['status']): string {
  if (status === 'direct') return '可直接接入'
  if (status === 'metadata') return '元信息 + 内容兜底'
  return '本地优先兜底'
}
