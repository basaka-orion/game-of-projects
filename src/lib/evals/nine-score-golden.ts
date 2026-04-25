import { formatBossCognitionTargets } from '../boss/cognition-impact.ts'
import { buildExecutionLearningDeck } from '../agents/execution-review.ts'
import type { AgentExecutionReceipt } from '../agents/execution-receipt.ts'
import type { OperatingEventRow } from '../db/repository.ts'
import { buildDailyBriefDeck } from '../operating-loop/daily-brief.ts'
import { buildProjectNeuralNetwork } from '../operating-loop/project-neural-network.ts'
import { analyzeKnowledgeQuery } from '../knowledge/query-analysis.ts'
import { rankAndFilterRelationItems } from '../knowledge/relation-evidence.ts'
import { rankPersonalAffectionItems, rankPersonalDiscoveryItems } from '../knowledge/personal-evidence.ts'
import { classifyQimengText } from '../memory/qimeng-taxonomy.ts'

export interface GoldenEvalResult {
  id: string
  title: string
  passed: boolean
  detail: string
}

function pass(id: string, title: string, detail: string): GoldenEvalResult {
  return { id, title, passed: true, detail }
}

function fail(id: string, title: string, detail: string): GoldenEvalResult {
  return { id, title, passed: false, detail }
}

function expectResult(id: string, title: string, condition: boolean, detail: string): GoldenEvalResult {
  return condition ? pass(id, title, detail) : fail(id, title, detail)
}

function makeReceipt(overrides: Partial<AgentExecutionReceipt> = {}): AgentExecutionReceipt {
  return {
    id: 'receipt-golden-1',
    subject: 'WarRoom｜行动复盘',
    agentId: 'strategy',
    status: 'completed',
    inputPreview: '检查项目是否形成行动闭环。',
    outputPreview: '本次行动有知识证据和下一步复盘节奏。',
    tools: [{ id: 'team-engine', label: 'Team Engine', risk: 'low', status: 'completed' }],
    evidenceRefs: [{ kind: 'knowledge', id: 'wiki-1', title: 'Wiki 证据' }],
    cost: { inputChars: 12, outputChars: 16, note: '本地估算。' },
    retry: { recommended: false, reason: '已完成', nextStep: '沉淀为项目操作手册。' },
    trust: { risk: 'low', confidence: 0.86, rationale: '带证据的完成结果。' },
    ...overrides,
  }
}

function makeEvent(id: string, receipt: AgentExecutionReceipt): OperatingEventRow {
  return {
    id,
    type: 'agent_action',
    stage: 'execute',
    title: `Agent 执行：${receipt.subject}`,
    summary: receipt.outputPreview,
    source_kind: 'agent',
    source_id: receipt.agentId,
    source_title: receipt.subject,
    confidence: receipt.trust.confidence,
    entities_json: JSON.stringify([receipt.agentId]),
    project_ids_json: '[]',
    payload_json: JSON.stringify({ receipt }),
    created_at: '2026-04-25T00:00:00.000Z',
    updated_at: '2026-04-25T00:00:00.000Z',
  }
}

export function runNineScoreGoldenEvals(): GoldenEvalResult[] {
  const collection = analyzeKnowledgeQuery('只言片语我一共写了多少篇，怎么去归类它们呢，从内容出发')
  const relation = analyzeKnowledgeQuery('圆与莎什么关系')
  const relationRanked = rankAndFilterRelationItems(
    [
      {
        title: '希望你现在是睡眠模式啦，莎^_^～',
        text: '我很喜欢你，也信任我们俩的陪伴与相互扶持。',
        score: 70,
      },
      {
        title: '4-14',
        text: '2030年的圆依然会让自己更睿智。',
        score: 90,
      },
      {
        title: '韩莎莎资料',
        text: '这是一个和关系问题无关的单名资料页。',
        score: 80,
      },
    ],
    ['圆', '莎'],
    {
      getTitle: (item) => item.title,
      getText: (item) => item.text,
      getSearchScore: (item) => item.score,
      selfAliases: ['圆', '阿圆'],
    },
  )
  const affectionRanked = rankPersonalAffectionItems(
    [
      {
        title: '✉️我亲爱的小笨蛋：',
        text: '杨弘，我喜欢你。我希望那时你还能在我身边。',
        importance: 90,
      },
      {
        title: '一个真正喜欢你的人',
        text: '一个真正喜欢你的人会如何表达关心，这是泛化建议。',
        importance: 95,
      },
    ],
    {
      getTitle: (item) => item.title,
      getText: (item) => item.text,
      getSearchScore: (item) => item.importance,
      selfAliases: ['圆', '阿圆'],
    },
  )
  const valueRanked = rankPersonalDiscoveryItems(
    [
      {
        title: '我真正看重什么',
        text: '我最在乎的是信任、真诚和长期主义。这是我的原则。',
        importance: 88,
      },
      {
        title: '任何人都应该善良',
        text: '这个社会需要价值观，每个人都应该真诚。',
        importance: 95,
      },
    ],
    'value',
    {
      getTitle: (item) => item.title,
      getText: (item) => item.text,
      getSearchScore: (item) => item.importance,
      selfAliases: ['圆', '阿圆'],
    },
  )
  const archive = classifyQimengText({
    content: '我想把 Openbasaka、记忆宫殿、知识库和 Agent 做成真正长期成长的个人智能系统。',
    agentRole: 'technical',
  })
  const cognitionTargets = formatBossCognitionTargets()
  const learningDeck = buildExecutionLearningDeck([
    makeEvent('op-good', makeReceipt()),
    makeEvent(
      'op-failed',
      makeReceipt({
        id: 'receipt-golden-failed',
        subject: 'Telegram｜搜索',
        status: 'failed',
        outputPreview: 'MCP timeout',
        tools: [{ id: 'web_search', label: 'Web Search', risk: 'medium', status: 'failed' }],
        evidenceRefs: [{ kind: 'tool', title: 'Web Search' }],
        retry: { recommended: true, reason: '超时', nextStep: '检查 MCP 后重试。' },
        trust: { risk: 'medium', confidence: 0.32, rationale: '失败结果不能作为事实。' },
      }),
    ),
  ])
  const dailyBrief = buildDailyBriefDeck({
    now: new Date('2026-04-25T08:00:00.000Z'),
    projectCount: 4,
    classifiedProjectCount: 3,
    synapseCount: 3,
    highSignalSynapseCount: 1,
    bossMemoryCount: 6,
    decisionCount: 2,
    pendingArchiveCount: 6313,
    operatingEvents: [makeEvent('op-brief', makeReceipt())],
    executionSummary: learningDeck.summary,
  })
  const projectNetwork = buildProjectNeuralNetwork({
    projects: [
      {
        id: 'project-openbasaka',
        title: 'Openbasaka',
        oneLiner: '本地优先外脑 OS。',
        tags: ['外脑', 'Agent'],
        survivalRate: 90,
        taxonomyLabel: 'personal intelligent system',
      },
      {
        id: 'project-mempalace',
        title: 'MemPalace',
        oneLiner: '记忆宫殿。',
        tags: ['记忆', '归档'],
        survivalRate: 82,
      },
    ],
    synapses: [
      {
        id: 'syn-golden',
        source_id: 'project-openbasaka',
        target_id: 'project-mempalace',
        type: '复用',
        strength: 88,
        reason: '记忆宫殿支撑外脑沉淀。',
        action_items_json: '[]',
        created_at: '2026-04-25T00:00:00.000Z',
      },
    ],
    memories: [
      {
        category: 'openbasaka',
        content: 'Openbasaka 需要把启蒙、知识、Agent 都串成外脑闭环。',
        confidence: 0.9,
        created_at: '2026-04-25T00:00:00.000Z',
      },
    ],
    operatingEvents: [
      {
        ...makeEvent('op-network-agent', makeReceipt()),
        project_ids_json: JSON.stringify(['project-openbasaka']),
      },
      {
        ...makeEvent('op-network-knowledge', makeReceipt()),
        type: 'knowledge_source',
        stage: 'compile',
        source_kind: 'wiki',
        source_title: 'Openbasaka 架构笔记',
        summary: '知识库补上 Openbasaka 的证据链。',
        project_ids_json: JSON.stringify(['project-openbasaka']),
      },
    ],
  })

  return [
    expectResult(
      'knowledge.collection-count',
      '集合统计与内容归类意图不能退化',
      Boolean(
        collection.countIntent &&
        collection.countIntent.term === '只言片语' &&
        collection.countIntent.mode === 'items' &&
        collection.countIntent.wantsGrouping &&
        collection.wantsClassification,
      ),
      JSON.stringify(collection.countIntent),
    ),
    expectResult(
      'knowledge.self-anchor-relation',
      '自我锚点关系问题要保留目标关系证据',
      relation.relationEntities.join('/') === '圆/莎' &&
        relationRanked.length === 1 &&
        relationRanked[0].title.includes('莎'),
      relationRanked.map((item) => item.title).join(' | '),
    ),
    expectResult(
      'knowledge.personal-affection',
      '个人情感召回要压过泛化建议',
      Boolean(affectionRanked[0]?.title.includes('小笨蛋') && affectionRanked.length === 1),
      affectionRanked.map((item) => item.title).join(' | '),
    ),
    expectResult(
      'knowledge.personal-values',
      '自我原则召回要压过泛化道德文本',
      Boolean(valueRanked[0]?.title === '我真正看重什么' && valueRanked.length === 1),
      valueRanked.map((item) => item.title).join(' | '),
    ),
    expectResult(
      'qimeng.archive-routing',
      '启蒙归档要识别外脑系统材料',
      archive.wing === 'openbasaka' && archive.hall === 'technical' && archive.room === '项目-个人智能系统',
      `${archive.wing}/${archive.hall}/${archive.room}`,
    ),
    expectResult(
      'boss.context-targets',
      'Boss 画像更新必须覆盖所有 Agent 入口',
      ['Openbasaka', 'Knowledge Query', 'Teams', 'WarRoom', 'Telegram Bot', 'XiaoBai Diagnose'].every((target) =>
        cognitionTargets.includes(target),
      ),
      cognitionTargets,
    ),
    expectResult(
      'agent.execution-learning',
      '执行收据必须进入可排序复盘队列',
      learningDeck.summary.total === 2 &&
        learningDeck.summary.retryRecommended === 1 &&
        learningDeck.reviews[0].priority === 'intervene',
      `${learningDeck.summary.total}/${learningDeck.summary.retryRecommended}/${learningDeck.reviews[0]?.priority}`,
    ),
    expectResult(
      'sandbox.daily-brief',
      '沙盘每日简报必须把入口、缺口和 Agent 建议串成每日主线',
      dailyBrief.sections.map((section) => section.title).join('/') === '昨日沉淀/今日行动/系统缺口/Agent 建议' &&
        dailyBrief.focus.includes('启蒙收件箱') &&
        dailyBrief.sections.some((section) =>
          section.items.some((item) => item.title === '今日入口' && item.value === 6313),
        ),
      `${dailyBrief.focus} | ${dailyBrief.sections.map((section) => section.title).join('/')}`,
    ),
    expectResult(
      'sandbox.project-neural-network',
      '项目神经网络必须把项目、记忆、知识和 Agent 行动连成图',
      projectNetwork.summary.projectNodes === 2 &&
        projectNetwork.summary.memoryNodes === 1 &&
        projectNetwork.summary.knowledgeNodes === 1 &&
        projectNetwork.summary.agentNodes === 1 &&
        ['复用', '记忆指向', '知识支撑', '行动回写'].every((label) =>
          projectNetwork.links.some((link) => link.label === label),
        ),
      `${projectNetwork.nodes.length}/${projectNetwork.links.map((link) => link.label).join('|')}`,
    ),
  ]
}
