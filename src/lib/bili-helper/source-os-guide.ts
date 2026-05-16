import type { BiliArtifactMode, BiliHelperView, BiliVideoWorkspace } from './types'

export type SourceOsGuideStepId =
  | 'intake'
  | 'resolving'
  | 'source-ready'
  | 'content-check'
  | 'artifact-choice'
  | 'generating'
  | 'pack-ready'
  | 'dialog-export'

export type SourceOsGuideStepStatus = 'complete' | 'current' | 'upcoming'

export type SourceOsGuideIntensity = 'calm' | 'active' | 'celebrate'

export interface SourceOsGuideStep {
  id: SourceOsGuideStepId
  label: string
  title: string
  description: string
  target: string
  status: SourceOsGuideStepStatus
}

export interface SourceOsGuideState {
  steps: SourceOsGuideStep[]
  activeStep: SourceOsGuideStep
  activeIndex: number
  progress: number
  headline: string
  caption: string
  cta: string
  focusTarget: string
  intensity: SourceOsGuideIntensity
  artifactMode: BiliArtifactMode
}

export interface SourceOsGuideArrowGeometry {
  startX: number
  startY: number
  endX: number
  endY: number
  controlX: number
  controlY: number
}

export interface SourceOsGuideProps {
  state: SourceOsGuideState
  compact?: boolean
  reducedMotion?: boolean
  className?: string
  arrow?: SourceOsGuideArrowGeometry
}

export type SourceOsProcessingState = 'idle' | 'resolving' | 'generating' | 'chatting'

export interface BuildSourceOsGuideInput {
  processing: SourceOsProcessingState
  workspace: BiliVideoWorkspace | null
  view: BiliHelperView
  artifactMode: BiliArtifactMode
}

const STEP_BASE: Array<Omit<SourceOsGuideStep, 'status'>> = [
  {
    id: 'intake',
    label: '01 接收',
    title: '放入一个来源',
    description: '粘贴链接，或选择视频、网页、文件、图片。',
    target: 'source-input',
  },
  {
    id: 'resolving',
    label: '02 解析',
    title: '识别封面与身份',
    description: '读取标题、作者、封面、简介、平台和解析状态。',
    target: 'source-card',
  },
  {
    id: 'source-ready',
    label: '03 来源就绪',
    title: '确认资料卡片',
    description: '先看清来源质量，再决定是否补字幕、OCR 或正文。',
    target: 'source-card',
  },
  {
    id: 'content-check',
    label: '04 诊断',
    title: '检查来源内容',
    description: '确认是否有真实字幕、正文、OCR 或转写；缺内容先补条件，不生成假结论。',
    target: 'source-card',
  },
  {
    id: 'artifact-choice',
    label: '05 产物',
    title: '选择 AI 产物形态',
    description: '教程、导图、考题、金句、辩论、时间线、行动清单都在这里。',
    target: 'artifact-dashboard',
  },
  {
    id: 'generating',
    label: '06 生成',
    title: '把来源转成学习包',
    description: '系统正在把资料拆成地图、行动、时间线和可追问问题。',
    target: 'learning-pack',
  },
  {
    id: 'pack-ready',
    label: '07 学习包',
    title: '阅读与复用学习包',
    description: '先扫资料地图，再看行动清单，最后回到原来源核对。',
    target: 'learning-pack',
  },
  {
    id: 'dialog-export',
    label: '08 对话/导出',
    title: '继续追问或归档',
    description: '围绕当前来源对话，或导出 Markdown、字幕、封面和资料包。',
    target: 'chat-export',
  },
]

function activeStepId(input: BuildSourceOsGuideInput): SourceOsGuideStepId {
  if (input.processing === 'resolving') return 'resolving'
  if (!input.workspace) return 'intake'
  if (input.processing === 'generating') return 'generating'
  if (input.processing === 'chatting' || input.view === 'chat' || input.view === 'downloads') return 'dialog-export'
  if (input.workspace.pack) return 'pack-ready'
  if (input.view === 'insights' || input.view === 'tutorial') return 'artifact-choice'
  return 'content-check'
}

function progressFor(activeIndex: number, intensity: SourceOsGuideIntensity): number {
  const base = Math.round((activeIndex / (STEP_BASE.length - 1)) * 100)
  if (intensity === 'active') return Math.min(92, base + 8)
  if (intensity === 'celebrate') return Math.min(100, base + 12)
  return Math.max(4, base)
}

function stepCaption(stepId: SourceOsGuideStepId, input: BuildSourceOsGuideInput): Pick<SourceOsGuideState, 'headline' | 'caption' | 'cta' | 'intensity'> {
  const sourceName = input.workspace?.video.platformName || 'SourceOS'
  const title = input.workspace?.video.title || '等待第一个来源'
  switch (stepId) {
    case 'intake':
      return {
        headline: '把任意来源放进资料地图',
        caption: '新人只要粘贴链接；高手可以直接丢文件、图片、字幕或网页正文。',
        cta: '粘贴链接或选择文件',
        intensity: 'calm',
      }
    case 'resolving':
      return {
        headline: '正在识别来源身份',
        caption: '封面、标题、作者、简介和平台能力会先变成可检查的来源卡。',
        cta: '等待解析完成',
        intensity: 'active',
      }
    case 'source-ready':
      return {
        headline: `${sourceName} 来源已就绪`,
        caption: `先确认「${title}」的简介和解析状态，再补正文或直接生成产物。`,
        cta: '检查来源卡片',
        intensity: 'calm',
      }
    case 'artifact-choice':
      return {
        headline: '选择这次要生成的产物',
        caption: '小白教程适合入门，思维导图适合结构化，行动清单适合马上执行。',
        cta: '选择 AI 产物模式',
        intensity: 'calm',
      }
    case 'content-check':
      return {
        headline: '先确认来源够不够真实',
        caption: '有字幕、正文、OCR 或转写才生成结论；只有元信息时只显示补内容路径。',
        cta: '检查识别诊断',
        intensity: 'calm',
      }
    case 'generating':
      return {
        headline: '正在生成学习包',
        caption: 'SourceOS 正在把来源拆成资料地图、时间线、行动和追问。',
        cta: '等待学习包完成',
        intensity: 'active',
      }
    case 'pack-ready':
      return {
        headline: '学习包已经可以复用',
        caption: '先读资料地图，再拿行动清单做今天的下一步。',
        cta: '打开学习包',
        intensity: 'celebrate',
      }
    case 'dialog-export':
      return {
        headline: '进入对话与归档',
        caption: '继续追问当前来源，或把学习包、字幕、封面导出到你的知识系统。',
        cta: '追问或导出',
        intensity: input.processing === 'chatting' ? 'active' : 'celebrate',
      }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function buildSourceOsArrowGeometry(input: {
  rootRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
  targetRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
  width: number
  height: number
  compact?: boolean
}): SourceOsGuideArrowGeometry {
  const scaleX = input.rootRect.width > 0 ? input.width / input.rootRect.width : 1
  const scaleY = input.rootRect.height > 0 ? input.height / input.rootRect.height : 1
  const targetX = (input.targetRect.left + input.targetRect.width / 2 - input.rootRect.left) * scaleX
  const targetY = (input.targetRect.top + input.targetRect.height / 2 - input.rootRect.top) * scaleY
  const card = {
    left: input.compact ? 18 : 24,
    top: input.compact ? 22 : 28,
    width: input.compact ? 430 : 590,
    height: input.compact ? 162 : 188,
  }
  const startX = clamp(targetX, card.left, card.left + card.width)
  const startY = clamp(targetY, card.top, card.top + card.height)
  const rightDistance = Math.abs(targetX - (card.left + card.width))
  const leftDistance = Math.abs(targetX - card.left)
  const fromRight = rightDistance < leftDistance || targetX >= card.left + card.width / 2
  const anchorX = fromRight ? card.left + card.width - 4 : card.left + 4
  const anchorY = startY
  const dx = targetX - anchorX
  const dy = targetY - anchorY
  const distance = Math.max(1, Math.hypot(dx, dy))
  const maxLength = input.compact ? 150 : 190
  const minLength = input.compact ? 58 : 70
  const length = clamp(distance, minLength, maxLength)
  const endX = clamp(anchorX + (dx / distance) * length, 16, input.width - 16)
  const endY = clamp(anchorY + (dy / distance) * length, 16, input.height - 16)

  return {
    startX: anchorX,
    startY: anchorY,
    endX,
    endY,
    controlX: (anchorX + endX) / 2,
    controlY: (anchorY + endY) / 2 - 24,
  }
}

export function buildSourceOsGuideState(input: BuildSourceOsGuideInput): SourceOsGuideState {
  const currentId = activeStepId(input)
  const activeIndex = STEP_BASE.findIndex((step) => step.id === currentId)
  const safeIndex = activeIndex >= 0 ? activeIndex : 0
  const steps = STEP_BASE.map((step, index): SourceOsGuideStep => ({
    ...step,
    status: index < safeIndex ? 'complete' : index === safeIndex ? 'current' : 'upcoming',
  }))
  const activeStep = steps[safeIndex]
  const caption = stepCaption(activeStep.id, input)

  return {
    steps,
    activeStep,
    activeIndex: safeIndex,
    progress: progressFor(safeIndex, caption.intensity),
    headline: caption.headline,
    caption: caption.caption,
    cta: caption.cta,
    focusTarget: activeStep.target,
    intensity: caption.intensity,
    artifactMode: input.artifactMode,
  }
}
