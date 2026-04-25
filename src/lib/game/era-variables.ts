/**
 * 时代变量系统
 * 定期更新的全局修正器，影响推演评分上下文
 */
import { chatCompletion, LLMConfig, ChatMessage } from '../ai/provider'
import { dbGetSetting, dbSetSetting } from '../db/repository'

export interface EraState {
  currentEra: string
  globalModifiers: {
    techHypeLevel: number
    fundingClimate: string
    regulatoryPressure: number
    talentAvailability: number
  }
  trendingDomains: string[]
  coldDomains: string[]
  lastUpdated: string
}

const ERA_PROMPT = `你是时代趋势分析引擎。基于你的知识，描述当前的技术和市场环境。

输出 JSON：
{
  "current_era": "时代名称（如 'AI Spring 2025'）",
  "tech_hype_level": 0-100,
  "funding_climate": "freeze|cautious|normal|hot|bubble",
  "regulatory_pressure": 0-100,
  "talent_availability": 0-100,
  "trending_domains": ["当前热门领域1", "热门领域2", "热门领域3", "热门领域4", "热门领域5"],
  "cold_domains": ["正在降温的领域1", "降温领域2", "降温领域3"]
}

规则：
- 基于 2025-2026 年的实际趋势判断
- tech_hype_level 越高表示技术炒作越热
- funding_climate 反映投资者情绪
- trending_domains 要具体（如 'AI Agent', '具身智能'）
- cold_domains 列出曾经热门但现在降温的`

/** 获取当前时代变量（缓存 24 小时） */
export async function getEraVariables(config: LLMConfig): Promise<EraState> {
  const cached = await dbGetSetting('era_variables', '')
  const cachedTime = await dbGetSetting('era_updated_at', '0')

  // 24 小时缓存
  const cacheAge = Date.now() - parseInt(cachedTime)
  if (cached && cacheAge < 24 * 60 * 60 * 1000) {
    try {
      return JSON.parse(cached) as EraState
    } catch { /* recompute */ }
  }

  return refreshEraVariables(config)
}

/** 强制刷新时代变量 */
export async function refreshEraVariables(config: LLMConfig): Promise<EraState> {
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: ERA_PROMPT },
      { role: 'user', content: '请分析当前（2025-2026）的技术和市场时代变量。' },
    ]

    const response = await chatCompletion(config, messages, 0.5, 1024)
    const match = response.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Failed to parse era variables')

    const data = JSON.parse(match[0]) as Record<string, unknown>

    const state: EraState = {
      currentEra: (data.current_era as string) || 'AI Transition Era',
      globalModifiers: {
        techHypeLevel: clamp((data.tech_hype_level as number) ?? 70),
        fundingClimate: (data.funding_climate as string) || 'normal',
        regulatoryPressure: clamp((data.regulatory_pressure as number) ?? 50),
        talentAvailability: clamp((data.talent_availability as number) ?? 60),
      },
      trendingDomains: (data.trending_domains as string[]) || ['AI', 'Agent'],
      coldDomains: (data.cold_domains as string[]) || [],
      lastUpdated: new Date().toISOString(),
    }

    await dbSetSetting('era_variables', JSON.stringify(state))
    await dbSetSetting('era_updated_at', String(Date.now()))

    return state
  } catch {
    return getDefaultEraState()
  }
}

function clamp(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)))
}

function getDefaultEraState(): EraState {
  return {
    currentEra: 'AI Spring 2025',
    globalModifiers: {
      techHypeLevel: 75,
      fundingClimate: 'hot',
      regulatoryPressure: 45,
      talentAvailability: 55,
    },
    trendingDomains: ['AI Agent', '具身智能', '多模态', 'AI Coding', '合成数据'],
    coldDomains: ['NFT', '元宇宙概念', '加密货币挖矿'],
    lastUpdated: new Date().toISOString(),
  }
}

/** 生成注入到战争室 prompt 的时代上下文 */
export function buildEraContext(era: EraState): string {
  return `
## 当前时代变量：${era.currentEra}
- 技术热度：${era.globalModifiers.techHypeLevel}/100
- 融资环境：${era.globalModifiers.fundingClimate}
- 监管压力：${era.globalModifiers.regulatoryPressure}/100
- 人才可用性：${era.globalModifiers.talentAvailability}/100
- 热门领域：${era.trendingDomains.join('、')}
- 降温领域：${era.coldDomains.join('、')}

请将以上时代变量纳入评估考量。`
}
