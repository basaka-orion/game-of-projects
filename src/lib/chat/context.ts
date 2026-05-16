/**
 * 上下文组装管道 — Hermes 风格 10 层 Prompt 组装
 *
 * 移植自 Hermes Agent 的 prompt_builder.py 架构：
 * Layer 1:  Soul 灵魂（身份核心 — Hermes SOUL.md，第一优先级）
 * Layer 2:  Tool Guidance（工具使用引导）
 * Layer 3:  Memory Snapshot（Agent 记忆快照 — MEMORY.md）
 * Layer 4:  Boss Profile / USER.md（用户画像 — Hermes USER.md）
 * Layer 5:  最近决策（最近 5 个）
 * Layer 6:  活跃项目（pursuit 状态）
 * Layer 7:  最近洞察（7 天内 boss_memory）
 * Layer 8:  时代变量 + 突触连接
 * Layer 9:  Skills Index（技能索引）
 * Layer 10: Timestamp（时间戳）
 *
 * 总预算 ~2500 tokens, 超出时从 Layer 10 向上裁剪
 * 采用 Hermes 冻结快照模式：会话开始时加载，中途修改不实时更新 prompt
 */
import { query } from '../db/repository'
import { getSetting } from '../db/store'
import { loadBossState, calculateBossLevel, getBossTitle } from '../boss/profile'
import { renderCognitivePrompt } from '../boss/cognitive-profile'
import { renderProfilingContext } from '../boss/profiling/summary'
import { getEraVariables, buildEraContext } from '../game/era-variables'
import { buildToolPrompt } from './tool-loop'
import { LLMConfig, getDefaultConfig } from '../ai/provider'
import { getExpertConfig, ExpertRole } from './router'
import { getSoul, renderSoulPrompt } from '../agents/soul'
import { loadAgentMemory, renderMemoryPrompt, renderL0Identity, renderL1Essential, renderL2OnDemand } from '../agents/agent-memory'
import { loadSkills, buildSkillsIndexPrompt } from '../skills/registry'
import { queryEntity, renderGraphPrompt } from '../memory/knowledge-graph'
import { buildToolPrompt as buildHermesToolPrompt, getEnabledTools } from '../tools'
import { getRoomItems, getRoomByType } from '../memory/palace'

interface ContextLayer {
  priority: number  // 1 = 最高
  label: string
  content: string
  tokens: number    // 粗略估算: content.length / 2
}

/** 组装完整上下文 — Hermes 风格分层注入 */
export async function assembleContext(
  projects: Array<{ title: string; survivalRate: number; survivalGrade: string; oneLiner: string }>,
  expertRole?: ExpertRole,
  userMessage?: string
): Promise<string> {
  const layers: ContextLayer[] = []
  const boss = await loadBossState()

  // Layer 0: Boss Recognition（优先级 0，永不裁剪）
  if (boss.name && boss.name !== 'Boss') {
    const bossLevel = calculateBossLevel(boss)
    const bossTitle = getBossTitle(bossLevel)
    layers.push({
      priority: 0,
      label: 'boss_recognition',
      content: `<boss-recognition>\nThis application belongs to ${boss.name}.\nThey have been using this system since their first day.\nCurrent level: ${bossLevel} (${bossTitle}).\nTotal evaluations: ${boss.projectsEvaluated}. Total decisions: ${boss.projectsPursued + boss.projectsAbandoned + boss.projectsPivoted}.\nCore preferences: ${boss.interests.slice(0, 5).join(', ') || 'exploring'}.\nAlways address them as "${boss.name}". Never forget who they are.\n</boss-recognition>`,
      tokens: 0,
    })
  }

  // Layer 1: Soul 灵魂（Hermes SOUL.md — 第一优先级，始终存在）
  try {
    const soul = await getSoul(expertRole || 'general')
    const soulPrompt = renderSoulPrompt(soul)
    layers.push({
      priority: 1,
      label: 'soul',
      content: soulPrompt,
      tokens: 0,
    })
  } catch { /* fallback to legacy identity */ }

  // Layer 1.5: 兼容旧的身份注入（如果 Soul 加载失败）
  if (!layers.find(l => l.label === 'soul')) {
    const expertConfig = getExpertConfig(expertRole || 'general')
    const identityContent = expertConfig.identity
      .replace(/\$\{bossName\}/g, boss.name)
      .replace(/\$\{interests\}/g, boss.interests.join('、') || '全领域')
      + (boss.dislikes.length > 0 ? `\n${boss.dislikes.join('、')}` : '')
      + '\n\n## 输出风格\n- 中文回复，简洁有力\n- 重要信息用**加粗**标注\n- 不要过度客套，直接给干货'
    + '\n\n## 铁律：反幻觉 + 强制搜索\n- 关于时事、最新数据、版本号、未公开信息——你 MUST 立即调用 web_search 工具搜索，不要自己编\n- 用户问"最新""最近""今天""现在"类问题时，你 MUST 先调用 {"tool": "web_search", "params": {"query": "搜索关键词"}} 获取实时信息\n- 搜索结果返回后，基于真实数据给出回答\n- 绝对不允许编造看似专业的虚假信息（假模型名、假版本号、假新闻）\n- 宁可承认不知道+调用搜索，也不准用编造的信息来显得博学'
    layers.push({
      priority: 1,
      label: 'identity',
      content: identityContent,
      tokens: 0,
    })
  }

  // Layer 2: Tool Guidance（工具使用引导）
  try {
    const toolPrompt = await buildToolPrompt([])
    if (toolPrompt) {
      layers.push({
        priority: 2,
        label: 'tool_guidance',
        content: toolPrompt,
        tokens: 0,
      })
    }
  } catch { /* ignore */ }

  // Layer 2.5: Hermes Tools（工具注册表）
  try {
    const enabledTools = getEnabledTools()
    const toolPrompt = buildHermesToolPrompt(enabledTools)
    if (toolPrompt) {
      layers.push({
        priority: 2,
        label: 'hermes_tools',
        content: toolPrompt,
        tokens: 0,
      })
    }
  } catch { /* ignore */ }

  // Layer 3: Memory Snapshot（Agent 记忆 — MemPalace L0+L1+L2）
  try {
    const memory = await loadAgentMemory(expertRole || 'general')
    // L0: 身份压缩（从 Soul 提取第一句）
    const soulLayer = layers.find(l => l.label === 'soul')
    if (soulLayer) {
      const l0 = renderL0Identity(soulLayer.content)
      if (l0) {
        layers.push({
          priority: 3,
          label: 'memory_l0_identity',
          content: `<identity-core>${l0}</identity-core>`,
          tokens: 0,
        })
      }
    }
    // L1: 核心故事（自动从 Agent Memory 提取重要条目）
    const l1 = renderL1Essential(memory)
    if (l1) {
      layers.push({
        priority: 3,
        label: 'memory_l1_essential',
        content: `<memory-essential>\n${l1}\n</memory-essential>`,
        tokens: 0,
      })
    }
    // L2: 按需检索（如果有活跃项目标题作为关键词）
    if (projects.length > 0) {
      const keywords = projects.slice(0, 3).flatMap(p => p.title.split(/\s+/)).filter(k => k.length > 1)
      const l2 = renderL2OnDemand(memory, keywords)
      if (l2) {
        layers.push({
          priority: 3,
          label: 'memory_l2_ondemand',
          content: `<memory-relevant>\n${l2}\n</memory-relevant>`,
          tokens: 0,
        })
      }
    }
  } catch { /* ignore */ }

  // Layer 4: Boss Profile / USER.md（用户画像）
  const bossParts: string[] = []
  if (boss.name && boss.name !== 'Boss') bossParts.push(`Boss: ${boss.name}`)
  if (boss.interests.length > 0) bossParts.push(`兴趣: ${boss.interests.join('、')}`)
  if (boss.preferredStyle) bossParts.push(`沟通风格: ${boss.preferredStyle}`)
  if (boss.riskTolerance) bossParts.push(`风险偏好: ${boss.riskTolerance}`)
  if (boss.currentFocus) bossParts.push(`当前焦点: ${boss.currentFocus}`)
  if (boss.longTermVision) bossParts.push(`长期愿景: ${boss.longTermVision}`)
  if (bossParts.length > 0) {
    layers.push({
      priority: 4,
      label: 'user_profile',
      content: `## USER PROFILE (who the user is)\n${bossParts.join('\n')}`,
      tokens: 0,
    })
  }

  const cognitivePrompt = renderCognitivePrompt(boss.cognitiveProfile, 'context')
  if (cognitivePrompt) {
    layers.push({
      priority: 4,
      label: 'boss_cognition',
      content: cognitivePrompt,
      tokens: 0,
    })
  }

  const profilingPrompt = renderProfilingContext(
    boss.profilingSummaryText
      ? {
          headline: boss.profilingHeadline,
          narrative: '',
          keyStrengths: [],
          watchouts: [],
          recommendedAgents: [],
          recommendedResearchTopics: [],
          recommendedProjectDirections: [],
          promptSummary: boss.profilingSummaryText,
        }
      : null
  )
  if (profilingPrompt) {
    layers.push({
      priority: 4,
      label: 'boss_profiling',
      content: profilingPrompt,
      tokens: 0,
    })
  }

  // Layer 5: 最近决策
  try {
    const decisions = await query<{ decision_type: string; reasoning: string; created_at: string }>(
      'SELECT decision_type, reasoning, created_at FROM boss_decisions ORDER BY created_at DESC LIMIT 5'
    )
    if (decisions.length > 0) {
      const lines = decisions.map(d => `- [${d.decision_type.toUpperCase()}] ${d.reasoning}`).join('\n')
      layers.push({
        priority: 5,
        label: 'recent_decisions',
        content: `## 最近决策：\n${lines}`,
        tokens: 0,
      })
    }
  } catch { /* ignore */ }

  // Layer 6: 活跃项目
  if (projects.length > 0) {
    const lines = projects.slice(0, 5).map(p =>
      `- 「${p.title}」存活率 ${p.survivalRate}% [${p.survivalGrade}] — ${p.oneLiner}`
    ).join('\n')
    layers.push({
      priority: 6,
      label: 'active_projects',
      content: `## 已有项目推演记录：\n${lines}`,
      tokens: 0,
    })
  }

  // Layer 7: 最近洞察
  try {
    const memories = await query<{ category: string; content: string }>(
      "SELECT category, content FROM boss_memory WHERE created_at > datetime('now', '-7 days') ORDER BY created_at DESC LIMIT 10"
    )
    if (memories.length > 0) {
      const lines = memories.map(m => `- [${m.category}] ${m.content}`).join('\n')
      layers.push({
        priority: 7,
        label: 'recent_insights',
        content: `## 最近洞察：\n${lines}`,
        tokens: 0,
      })
    }
  } catch { /* ignore */ }

  // Layer 8: 时代变量 + 突触连接
  try {
    const provider = getSetting('llm_provider', 'deepseek')
    const defaults = getDefaultConfig(provider)
    const config: LLMConfig = {
      provider: provider as LLMConfig['provider'],
      apiKey: getSetting('llm_api_key', ''),
      baseUrl: getSetting('llm_base_url', defaults.baseUrl),
      model: getSetting('llm_model', defaults.model),
    }
    const era = await getEraVariables(config)
    layers.push({
      priority: 8,
      label: 'era_variables',
      content: buildEraContext(era),
      tokens: 0,
    })
  } catch { /* ignore */ }

  try {
    const synapses = await query<{ source_id: string; target_id: string; type: string; strength: number; reason: string }>(
      'SELECT source_id, target_id, type, strength, reason FROM synapses ORDER BY strength DESC LIMIT 5'
    )
    if (synapses.length > 0) {
      const lines = synapses.map(s => `- ${s.type} (${Math.round(s.strength)}%): ${s.reason}`).join('\n')
      layers.push({
        priority: 8,
        label: 'synapses',
        content: `## 已发现突触连接：\n${lines}`,
        tokens: 0,
      })
    }
  } catch { /* ignore */ }

  // Layer 8.5: Knowledge Graph（知识图谱 — MemPalace + Graphify）
  try {
    // 获取与活跃项目相关的知识三元组
    const projectTitles = projects.slice(0, 3).map(p => p.title)
    const allTriples: Awaited<ReturnType<typeof queryEntity>> = []
    for (const title of projectTitles) {
      const triples = await queryEntity(title)
      allTriples.push(...triples.slice(0, 3))
    }
    const graphPrompt = renderGraphPrompt(allTriples, 400)
    if (graphPrompt) {
      layers.push({
        priority: 8,
        label: 'knowledge_graph',
        content: graphPrompt,
        tokens: 0,
      })
    }
  } catch { /* ignore */ }

  // Layer 8.7: Memory Palace 主题增强检索
  try {
    const palaceParts: string[] = []
    // 从 Innovation Lab 获取最近突破
    const innovationRoom = await getRoomByType('innovation')
    if (innovationRoom) {
      const items = await getRoomItems(innovationRoom.id, 3)
      for (const item of items) {
        if (item.importance >= 5) {
          palaceParts.push(`- ${item.content}`)
        }
      }
    }
    // 从 Boss's Patterns 获取行为模式
    const bossRoom = await getRoomByType('boss')
    if (bossRoom) {
      const items = await getRoomItems(bossRoom.id, 3)
      for (const item of items) {
        palaceParts.push(`- ${item.content}`)
      }
    }
    // 按项目标题关键词从 War Room 匹配
    if (projects.length > 0) {
      const warRoom = await getRoomByType('war_room')
      if (warRoom) {
        const warItems = await getRoomItems(warRoom.id, 10)
        const keywords = projects.slice(0, 3).flatMap(p => p.title.split(/\s+/)).filter(k => k.length > 1)
        const matched = warItems.filter(item =>
          keywords.some(kw => item.content.includes(kw))
        ).slice(0, 3)
        for (const item of matched) {
          palaceParts.push(`- ${item.content}`)
        }
      }
    }
    if (palaceParts.length > 0) {
      layers.push({
        priority: 8,
        label: 'memory_palace',
        content: `<memory-palace>\n${palaceParts.slice(0, 8).join('\n')}\n</memory-palace>`,
        tokens: 0,
      })
    }
  } catch { /* ignore */ }

  // Layer 8.8: 统一知识注入（Wiki + Drawer + 三元组 + 记忆宫殿 + Sources）
  try {
    const { retrieveAndInject } = await import('./knowledge-middleware')
    const { promptFragment } = await retrieveAndInject({
      userMessage: userMessage || '',
      agentId: expertRole,
      projectTitles: projects.map(p => p.title),
      tokenBudget: 1200,
      depth: 'standard',
    })
    if (promptFragment) {
      layers.push({
        priority: 8,
        label: 'knowledge_context',
        content: promptFragment,
        tokens: 0,
      })
    }
  } catch { /* ignore */ }

  // Layer 8.9: Raw Drawer Recall（条件性原始记忆回溯 — 海马体下钻）
  try {
    const detailSignals = ['debug', 'error', 'trace', '过程', '细节', '原始', '为什么', 'how', 'why', 'log', 'stack', '报错']
    const hasDetailNeed = projects.some(p =>
      detailSignals.some(s =>
        p.title.toLowerCase().includes(s) || p.oneLiner.toLowerCase().includes(s)
      )
    )

    if (hasDetailNeed) {
      const { searchDrawers } = await import('../knowledge/drawer')
      const keywords = projects.slice(0, 2).flatMap(p => p.title.split(/\s+/)).filter(k => k.length > 1)
      if (keywords.length > 0) {
        const drawerMatches = await searchDrawers(keywords.join(' '), 3)
        if (drawerMatches.length > 0) {
          const drawerParts = drawerMatches.slice(0, 3).map(d =>
            `- [Drawer:${d.id}] ${d.title}: ${d.rawContent.slice(0, 300)}`
          )
          layers.push({
            priority: 9,
            label: 'raw_drawers',
            content: `<raw-memory>\n${drawerParts.join('\n')}\n</raw-memory>`,
            tokens: 0,
          })
        }
      }
    }
  } catch { /* ignore */ }

  // Layer 9: Skills Index（技能索引 — Hermes 风格）
  try {
    const skills = loadSkills()
    const skillIndex = buildSkillsIndexPrompt(skills)
    if (skillIndex) {
      layers.push({
        priority: 9,
        label: 'skills_index',
        content: skillIndex,
        tokens: 0,
      })
    }
  } catch { /* ignore */ }

  // Layer 10: Timestamp + 反幻觉铁律（永远存在）
  layers.push({
    priority: 10,
    label: 'timestamp',
    content: `Current time: ${new Date().toISOString()}

## 铁律：反幻觉
- 涉及时事、新闻、实时数据时，如果上下文中没有 <realtime-search-results> 搜索结果，你必须明确告知用户"我目前无法获取实时信息"
- 绝对不允许编造新闻、人物动态、股价、发布会内容等时效性信息
- 宁可承认不知道，也不许用编造的信息来显得博学
- 如果有 <search-status> 标签，如实向用户说明搜索状态`,
    tokens: 0,
  })

  // 计算token估算并裁剪
  const MAX_TOKENS = 2500
  let totalTokens = 0
  for (const layer of layers) {
    layer.tokens = Math.ceil(layer.content.length / 2)
    totalTokens += layer.tokens
  }

  // 从最低优先级开始裁剪（priority 数字越大越先被裁剪）
  while (totalTokens > MAX_TOKENS) {
    const lowest = layers.reduce((a, b) => a.priority > b.priority ? a : b)
    totalTokens -= lowest.tokens
    const idx = layers.indexOf(lowest)
    if (idx >= 0) layers.splice(idx, 1)
    else break
  }

  return layers.map(l => l.content).join('\n\n')
}

/** 检测用户消息是否包含项目构想 */
export function detectProjectIdea(message: string): boolean {
  const signals = [
    /我有一个(项目|想法|idea|产品)/i,
    /我想做(一个|个)/i,
    /帮我评估(这个|一下)/i,
    /这个(项目|产品|idea)/i,
    /商业(模式|计划)/i,
    /创业|start up|startup/i,
    /目标用户|痛点|商业模式/i,
    /PRD|需求文档|产品需求/i,
  ]
  return signals.some(r => r.test(message))
}
