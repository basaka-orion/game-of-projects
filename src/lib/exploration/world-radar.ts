import type { OperatingLoopBossProfileImpact, OperatingLoopExplorationMode } from '../operating-loop'

export interface WorldExplorationInput {
  title: string
  content: string
  metadata?: {
    explorationMode?: OperatingLoopExplorationMode
  }
}

export interface WorldExplorationSignal {
  mode: OperatingLoopExplorationMode
  label: string
  reason: string
  reviewRequired: boolean
  bossProfileImpact: OperatingLoopBossProfileImpact
}

export interface WorldExplorationModeDefinition {
  id: OperatingLoopExplorationMode
  label: string
  description: string
}

const DEFINITIONS: Record<OperatingLoopExplorationMode, WorldExplorationModeDefinition> = {
  aligned: {
    id: 'aligned',
    label: '贴合当前目标',
    description: '直接服务当前目标或正在推进的项目。',
  },
  adjacent: {
    id: 'adjacent',
    label: '相邻迁移',
    description: '来自相邻领域，可迁移方法、类比或结构。',
  },
  contrarian: {
    id: 'contrarian',
    label: '反共识挑战',
    description: '提供反证、失败预演、盲点或不同立场。',
  },
  serendipity: {
    id: 'serendipity',
    label: '随机奇遇',
    description: '暂时无法归类，但可能激发新连接。',
  },
}

export function getWorldExplorationModeDefinition(mode: OperatingLoopExplorationMode): WorldExplorationModeDefinition {
  return DEFINITIONS[mode]
}

export function classifyWorldExplorationSignal(input: WorldExplorationInput): WorldExplorationSignal {
  const text = `${input.title} ${input.content}`
  if (input.metadata?.explorationMode) {
    const mode = input.metadata.explorationMode
    return {
      mode,
      label: DEFINITIONS[mode].label,
      reason: `元数据指定为「${DEFINITIONS[mode].label}」。`,
      reviewRequired: mode !== 'aligned',
      bossProfileImpact: mode === 'contrarian' ? 'high' : mode === 'adjacent' ? 'medium' : 'low',
    }
  }

  if (/反证|盲点|失败|风险|质疑|挑战|反共识|过拟合|预演/.test(text)) {
    return {
      mode: 'contrarian',
      label: DEFINITIONS.contrarian.label,
      reason: '文本包含反证、失败预演或盲点信号。',
      reviewRequired: true,
      bossProfileImpact: 'high',
    }
  }

  if (/跨界|迁移|类比|映射|范式|相邻|借鉴|移植/.test(text)) {
    return {
      mode: 'adjacent',
      label: DEFINITIONS.adjacent.label,
      reason: '文本包含跨领域迁移或类比信号。',
      reviewRequired: true,
      bossProfileImpact: 'medium',
    }
  }

  if (/目标|当前|项目|主线|执行|验收/.test(text)) {
    return {
      mode: 'aligned',
      label: DEFINITIONS.aligned.label,
      reason: '文本直接贴合当前目标或项目推进。',
      reviewRequired: false,
      bossProfileImpact: 'low',
    }
  }

  return {
    mode: 'serendipity',
    label: DEFINITIONS.serendipity.label,
    reason: '暂时没有稳定归类，作为随机奇遇进入人工复核。',
    reviewRequired: true,
    bossProfileImpact: 'medium',
  }
}
