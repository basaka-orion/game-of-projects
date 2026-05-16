import { proposeBossDistillation } from '../boss/distillation'

const DRAFT_KEY = 'gop_whiteboard_draft'
const HISTORY_KEY = 'gop_whiteboard_history'

export type WhiteboardAiMode = 'openbasakaPrompt' | 'storyboard' | 'summary' | 'optimize' | 'imagePrompt'
export type WhiteboardSaveKind = 'inspiration' | 'project'
export type WhiteboardPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface WhiteboardImage {
  id: string
  name: string
  type: string
  size: number
  dataUrl: string
  createdAt: string
}

export interface WhiteboardAiResult {
  mode: WhiteboardAiMode
  title: string
  content: string
  createdAt: string
}

export interface WhiteboardDraft {
  id: string
  text: string
  images: WhiteboardImage[]
  aiResult: WhiteboardAiResult | null
  createdAt: string
  updatedAt: string
}

export interface WhiteboardHistoryItem extends WhiteboardDraft {
  title: string
  saveKind: WhiteboardSaveKind
  priority: WhiteboardPriority
  isStarred: boolean
  isPinned: boolean
  imageCount: number
}

export interface WhiteboardMarkdownExport {
  fileName: string
  markdown: string
  images: Array<{
    fileName: string
    relativePath: string
    dataUrl: string
  }>
}

function now(): string {
  return new Date().toISOString()
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function canStore(): boolean {
  return typeof localStorage !== 'undefined'
}

function compactText(value: string, limit = 28): string {
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) return '未命名白板'
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function loadHistoryRows(): WhiteboardHistoryItem[] {
  if (!canStore()) return []
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as WhiteboardHistoryItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveHistoryRows(items: WhiteboardHistoryItem[]) {
  if (!canStore()) return
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 120)))
}

export function createEmptyWhiteboardDraft(): WhiteboardDraft {
  const createdAt = now()
  return {
    id: id('whiteboard'),
    text: '',
    images: [],
    aiResult: null,
    createdAt,
    updatedAt: createdAt,
  }
}

export function createWhiteboardImage(file: File, dataUrl: string): WhiteboardImage {
  return {
    id: id('whiteboard_image'),
    name: file.name,
    type: file.type,
    size: file.size,
    dataUrl,
    createdAt: now(),
  }
}

export async function loadWhiteboardDraft(): Promise<WhiteboardDraft> {
  if (!canStore()) return createEmptyWhiteboardDraft()
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') as WhiteboardDraft | null
    return parsed?.id ? { ...createEmptyWhiteboardDraft(), ...parsed, images: parsed.images || [] } : createEmptyWhiteboardDraft()
  } catch {
    return createEmptyWhiteboardDraft()
  }
}

export async function saveWhiteboardDraft(draft: WhiteboardDraft): Promise<void> {
  if (!canStore()) return
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, updatedAt: draft.updatedAt || now() }))
}

export async function loadWhiteboardHistory(limit = 20): Promise<WhiteboardHistoryItem[]> {
  return loadHistoryRows()
    .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
}

function inferPriority(draft: WhiteboardDraft): WhiteboardPriority {
  if (/紧急|马上|今天|阻塞|必须/.test(draft.text)) return 'urgent'
  if (/重要|关键|主线|发布|验收/.test(draft.text)) return 'high'
  if (draft.text.trim().length < 20 && draft.images.length === 0) return 'low'
  return 'normal'
}

async function createDistillationProposalFromWhiteboard(item: WhiteboardHistoryItem) {
  const evidenceQuote = item.text.replace(/\s+/g, ' ').trim()
  const aiContent = item.aiResult?.content.replace(/\s+/g, ' ').trim()
  if (!/蒸馏|画像|长期|偏好|openbasaka/i.test(`${evidenceQuote} ${aiContent || ''}`)) return

  await proposeBossDistillation({
    id: `whiteboard_distill_${item.id}`,
    title: `白板蒸馏：${item.title}`,
    rationale: '白板保存时检测到 Boss 自我描述或 OpenBasaka 长期主线，需要进入确认队列。',
    proposedBy: 'whiteboard',
    source: { kind: 'whiteboard', sourceId: item.id, title: item.title },
    claims: [
      {
        id: `claim_verbatim_${item.id}`,
        dimension: 'mission',
        claim: evidenceQuote || item.title,
        evidenceTier: 'boss_verbatim',
        evidenceRefs: [{ sourceKind: 'whiteboard', sourceId: item.id, quote: evidenceQuote, locator: 'whiteboard.text' }],
        confidence: 0.92,
        temporalScope: 'stage',
        affectsProfileKeys: ['long_term_vision'],
      },
      {
        id: `claim_ai_${item.id}`,
        dimension: 'cognitive_style',
        claim: aiContent || 'AI 结果指出该白板内容需要进入 Boss 确认队列。',
        evidenceTier: 'derived_inference',
        evidenceRefs: [{ sourceKind: 'whiteboard', sourceId: item.id, quote: aiContent || item.title, locator: 'whiteboard.ai_result' }],
        confidence: 0.72,
        temporalScope: 'stage',
      },
    ],
  })
}

export async function saveWhiteboardHistory(
  draft: WhiteboardDraft,
  saveKind: WhiteboardSaveKind,
  title = '',
): Promise<WhiteboardHistoryItem | null> {
  const timestamp = now()
  const item: WhiteboardHistoryItem = {
    ...draft,
    id: id('whiteboard_history'),
    title: title.trim() || compactText(draft.text),
    saveKind,
    priority: inferPriority(draft),
    isPinned: false,
    isStarred: false,
    imageCount: draft.images.length,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const rows = loadHistoryRows().filter((row) => row.id !== item.id)
  saveHistoryRows([item, ...rows])
  await createDistillationProposalFromWhiteboard(item)
  return item
}

export async function updateWhiteboardHistoryItem(
  patch: Partial<WhiteboardHistoryItem> & Pick<WhiteboardHistoryItem, 'id'>,
): Promise<WhiteboardHistoryItem | null> {
  const rows = loadHistoryRows()
  const index = rows.findIndex((item) => item.id === patch.id)
  if (index < 0) return null
  const updated = { ...rows[index], ...patch, updatedAt: now() }
  rows[index] = updated
  saveHistoryRows(rows)
  return updated
}

export async function deleteWhiteboardHistoryItem(itemId: string): Promise<boolean> {
  const rows = loadHistoryRows()
  const next = rows.filter((item) => item.id !== itemId)
  saveHistoryRows(next)
  return next.length !== rows.length
}

export function getWhiteboardSaveKindLabel(kind: WhiteboardSaveKind): string {
  return kind === 'project' ? '项目候选' : '灵感'
}

export function getWhiteboardPriorityLabel(priority: WhiteboardPriority): string {
  const labels: Record<WhiteboardPriority, string> = {
    low: '低',
    normal: '普通',
    high: '高',
    urgent: '紧急',
  }
  return labels[priority]
}

export function getWhiteboardAiTitle(mode: WhiteboardAiMode): string {
  if (mode === 'openbasakaPrompt') return 'OpenBasaka 系统 Prompt'
  if (mode === 'storyboard') return '故事板'
  if (mode === 'optimize') return '一键优化'
  if (mode === 'imagePrompt') return '绘画 Prompt'
  return '摘要'
}

export function buildWhiteboardAiSystemPrompt(mode: WhiteboardAiMode): string {
  if (mode === 'openbasakaPrompt') return '把 Boss 白板内容整理成 OpenBasaka 可执行系统提示词，保留边界和证据。'
  if (mode === 'storyboard') return '把白板内容整理成可视化故事板。'
  if (mode === 'optimize') return '在不改变 Boss 原意的前提下，整理白板内容的结构、标题、重点、下一步和风险边界。'
  if (mode === 'imagePrompt') return '把白板内容转成适合图像模型理解的英文视觉 Prompt，避免直接让模型渲染复杂中文文字。'
  return '把白板内容压缩成清晰摘要。'
}

export function buildWhiteboardAiUserPrompt(draft: WhiteboardDraft, mode: WhiteboardAiMode): string {
  return [
    `模式：${mode}`,
    `文字：${draft.text || '无'}`,
    `图片数量：${draft.images.length}`,
  ].join('\n')
}

export function buildWhiteboardTitleSystemPrompt(): string {
  return '请为白板内容生成两个短标题，分别用于灵感和项目候选。返回 JSON：{"inspiration":"...","project":"..."}'
}

export function buildWhiteboardTitleUserPrompt(draft: WhiteboardDraft): string {
  return draft.text || draft.aiResult?.content || '空白白板'
}

export function createWhiteboardFallbackTitleSuggestions(draft: WhiteboardDraft): Record<WhiteboardSaveKind, string> {
  const base = compactText(draft.text || draft.aiResult?.content || '新白板')
  return {
    inspiration: base,
    project: `${base}｜项目候选`,
  }
}

export function parseWhiteboardTitleSuggestions(value: string, draft: WhiteboardDraft): Record<WhiteboardSaveKind, string> {
  const fallback = createWhiteboardFallbackTitleSuggestions(draft)
  try {
    const parsed = JSON.parse(value) as Partial<Record<WhiteboardSaveKind, string>>
    return {
      inspiration: compactText(parsed.inspiration || fallback.inspiration, 34),
      project: compactText(parsed.project || fallback.project, 34),
    }
  } catch {
    const lines = value.split('\n').map((line) => line.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean)
    return {
      inspiration: compactText(lines[0] || fallback.inspiration, 34),
      project: compactText(lines[1] || fallback.project, 34),
    }
  }
}

export function mergeWhiteboardAiResultIntoText(draft: WhiteboardDraft): string {
  if (!draft.aiResult?.content) return draft.text
  return [draft.text.trim(), `\n\n## ${draft.aiResult.title}\n${draft.aiResult.content}`].filter(Boolean).join('\n')
}

function markdownFromDraft(draft: WhiteboardDraft, title = '白板导出'): string {
  const lines = [`# ${title}`, '', draft.text.trim()]
  if (draft.aiResult) lines.push('', `## ${draft.aiResult.title}`, draft.aiResult.content)
  if (draft.images.length > 0) {
    lines.push('', '## 图片')
    draft.images.forEach((image) => lines.push(`- ${image.name} (${Math.round(image.size / 1024)} KB)`))
  }
  return lines.join('\n').trim() + '\n'
}

function exportImages(images: WhiteboardImage[]): WhiteboardMarkdownExport['images'] {
  return images.map((image, index) => {
    const safeName = image.name.replace(/[\\/:*?"<>|]/g, '_') || `whiteboard-image-${index + 1}.png`
    return {
      fileName: safeName,
      relativePath: `assets/${safeName}`,
      dataUrl: image.dataUrl,
    }
  })
}

export function buildWhiteboardMarkdownExport(draft: WhiteboardDraft): WhiteboardMarkdownExport {
  const title = compactText(draft.text || draft.aiResult?.title || 'whiteboard', 40)
  return {
    fileName: `${title.replace(/[\\/:*?"<>|]/g, '_')}.md`,
    markdown: markdownFromDraft(draft, title),
    images: exportImages(draft.images),
  }
}

export function buildWhiteboardHistoryMarkdownExport(item: WhiteboardHistoryItem): WhiteboardMarkdownExport {
  return {
    fileName: `${item.title.replace(/[\\/:*?"<>|]/g, '_')}.md`,
    markdown: markdownFromDraft(item, item.title),
    images: exportImages(item.images),
  }
}

export async function saveWhiteboardExportRecord(draft: WhiteboardDraft, filePath: string): Promise<void> {
  const rows = loadHistoryRows()
  saveHistoryRows([
    {
      ...draft,
      id: id('whiteboard_export'),
      title: compactText(draft.text || filePath),
      saveKind: 'inspiration',
      priority: inferPriority(draft),
      isPinned: false,
      isStarred: false,
      imageCount: draft.images.length,
      createdAt: now(),
      updatedAt: now(),
    },
    ...rows,
  ])
}
