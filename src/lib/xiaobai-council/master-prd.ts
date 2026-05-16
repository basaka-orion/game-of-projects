import type { CouncilLaunchReadinessPack } from './action-pack'
import type { CouncilDebateScene, CouncilVerdictLedger } from './debate-theater'
import type { CouncilSelection } from './selector'

export interface CouncilMasterPrdMetadata {
  problem: string
  generatedAt?: number | string | Date
  version?: string
  selection?: CouncilSelection | null
}

export interface CouncilMasterPrdRequiredSection {
  id: string
  label: string
  patterns: RegExp[]
}

export interface CouncilMasterPrdValidation {
  score: number
  hitLabels: string[]
  missedLabels: string[]
  sections: Array<{ id: string; label: string; present: boolean }>
}

export interface CouncilConsensusTraceItem {
  id: string
  sceneNo: number
  phaseLabel: string
  speakerName: string
  claim: string
  objection: string
  prdImpact: string
  absorbedAs: string
  cutOrRisk: string
  sourceMessageIds: string[]
  taskRefs: string[]
}

export interface CouncilConsensusTraceLane {
  id: 'claim' | 'challenge' | 'absorb' | 'cut'
  label: string
  summary: string
  items: CouncilConsensusTraceItem[]
}

export interface CouncilConsensusTrace {
  generatedAt: string
  summary: string
  totalScenes: number
  sourcedScenes: number
  totalTasks: number
  lanes: CouncilConsensusTraceLane[]
}

export const COUNCIL_MASTER_PRD_REQUIRED_SECTIONS: CouncilMasterPrdRequiredSection[] = [
  { id: 'product-positioning', label: '产品定位与北极星', patterns: [/产品定位|一句话定位|北极星|愿景|核心目标/i] },
  { id: 'users-journey', label: '目标用户与端到端旅程', patterns: [/目标用户|用户画像|用户旅程|核心场景|首次进入/i] },
  { id: 'scope-priorities', label: 'P0/P1/P2 与不做清单', patterns: [/P0|P1|P2|不做清单|暂缓|优先级/i] },
  { id: 'experience-ia', label: '信息架构、页面与组件状态', patterns: [/信息架构|页面|组件|空态|加载|失败态|交互/i] },
  { id: 'frontend-stack', label: '前端技术栈与状态管理', patterns: [/前端|React|Vue|SwiftUI|状态管理|路由|组件架构/i] },
  { id: 'backend-stack', label: '后端服务与领域边界', patterns: [/后端|服务|Node|API 服务|领域|鉴权|队列|任务/i] },
  { id: 'database-storage', label: '数据库、存储与数据模型', patterns: [/数据库|SQLite|Postgres|数据模型|表结构|存储|索引/i] },
  { id: 'api-contracts', label: 'API、接口草案与错误码', patterns: [/API|接口|请求|响应|错误码|幂等|schema/i] },
  { id: 'ai-model-strategy', label: 'AI/模型策略与提示词边界', patterns: [/AI|模型|LLM|prompt|提示词|RAG|事实校验|降级/i] },
  { id: 'security-privacy', label: '权限、隐私、安全与审计', patterns: [/权限|隐私|安全|密钥|审计|合规|授权/i] },
  { id: 'deployment-ops', label: '部署、运维、性能与回滚', patterns: [/部署|运维|性能|监控|日志|回滚|灰度|发布/i] },
  { id: 'testing-acceptance', label: '测试矩阵与验收标准', patterns: [/测试矩阵|验收|单元|集成|E2E|smoke|视觉回归|可访问性/i] },
  { id: 'milestones', label: '里程碑与任务拆解', patterns: [/里程碑|任务拆解|Day\s*1|Week|排期|路线图|交付物/i] },
  { id: 'consensus-trace', label: '角色共识、裁决与来源追溯', patterns: [/共识|裁决|来源|追溯|主张|质询|吸收|保留的分歧/i] },
]

function compact(value: string, max = 180): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

export function formatCouncilPrdDate(value: number | string | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return formatCouncilPrdDate(new Date())
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function stripExistingMetadata(markdown: string): string {
  return markdown
    .replace(/^#\s+.*(?:PRD|产品需求文档).*\n+/i, '')
    .replace(/^\*\*(?:项目代号|文档版本|最后更新|执行权限|共识机制|用户问题)\*\*[：:]\s*.*\n?/gim, '')
    .trim()
}

function missingSectionAppendix(validation: CouncilMasterPrdValidation): string {
  if (!validation.missedLabels.length) return ''
  return [
    '## 自动补齐清单：仍需人工复验的 PRD 章节',
    '',
    '以下章节是大师级 PRD 的硬性结构要求。如果模型正文没有明确写出，系统先把它们列为返修清单，后续质量闸门必须继续补齐：',
    '',
    ...validation.missedLabels.map((label, index) => `${index + 1}. ${label}`),
  ].join('\n')
}

function validationCorpus(markdown: string): string {
  return markdown.replace(/\n##\s+自动补齐清单：仍需人工复验的 PRD 章节[\s\S]*?(?=\n##\s+|$)/i, '\n')
}

export function isCouncilMasterPrdSynthesisFailure(markdown: string): boolean {
  const text = markdown.replace(/\s+/g, ' ').trim()
  if (!text) return true
  const failureSignals = [
    /PRD\s*成稿生成失败/i,
    /模型主持人没有稳定返回/i,
    /没有生成可交付的[「"]?PRD/i,
    /模型错误摘要/i,
    /所有模型路由都失败/i,
    /不是可交付的[「"]?PRD/i,
    /本轮只保留失败说明/i,
  ]
  return failureSignals.some((pattern) => pattern.test(text))
}

export function validateCouncilMasterPrd(markdown: string): CouncilMasterPrdValidation {
  if (isCouncilMasterPrdSynthesisFailure(markdown)) {
    const sections = COUNCIL_MASTER_PRD_REQUIRED_SECTIONS.map((section) => ({
      id: section.id,
      label: section.label,
      present: false,
    }))
    return {
      score: 0,
      hitLabels: [],
      missedLabels: sections.map((section) => section.label),
      sections,
    }
  }

  const corpus = validationCorpus(markdown)
  const sections = COUNCIL_MASTER_PRD_REQUIRED_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    present: section.patterns.some((pattern) => pattern.test(corpus)),
  }))
  const hitLabels = sections.filter((section) => section.present).map((section) => section.label)
  const missedLabels = sections.filter((section) => !section.present).map((section) => section.label)
  return {
    score: Math.round((hitLabels.length / Math.max(1, sections.length)) * 100),
    hitLabels,
    missedLabels,
    sections,
  }
}

export function normalizeCouncilMasterPrdMarkdown(markdown: string, metadata: CouncilMasterPrdMetadata): string {
  const generatedAt = formatCouncilPrdDate(metadata.generatedAt || new Date())
  const roster = metadata.selection?.seats
    .map((seat) => `${seat.persona.shortName || seat.persona.name}｜${seat.seat.label}`)
    .join('、')
  const body = stripExistingMetadata(markdown || '尚未生成 PRD 正文。')
    .replace(/\*\*最后更新\*\*[：:]\s*\d{4}-\d{2}-\d{2}/g, `**最后更新**: ${generatedAt}`)
    .replace(/最后更新[：:]\s*\d{4}-\d{2}-\d{2}/g, `最后更新: ${generatedAt}`)
  const header = [
    '# 小白智囊团大师共识 PRD',
    '',
    `**项目代号**: ${compact(metadata.problem, 48) || 'XiaoBai Council Master PRD'}`,
    `**文档版本**: ${metadata.version || 'v1.0.0'}`,
    `**最后更新**: ${generatedAt}`,
    '**共识机制**: 六阶段多角色严苛脑暴 -> 独立主张 -> 发散 -> 冲突质询 -> 主持裁决 -> 共识成稿',
    '**执行权限**: 自动抽取执行任务与追溯证据；不自动改代码、不跑外部命令、不替 Boss 执行高风险动作。',
    roster ? `**入选智囊**: ${roster}` : '',
    '',
  ].filter(Boolean).join('\n')
  const normalized = `${header}${body}`.trim()
  const validation = validateCouncilMasterPrd(normalized)
  const appendix = missingSectionAppendix(validation)
  return appendix ? `${normalized}\n\n${appendix}` : normalized
}

function sceneTaskRefs(scene: CouncilDebateScene, actionPack?: CouncilLaunchReadinessPack | null): string[] {
  if (!actionPack) return []
  const source = `${scene.claim}\n${scene.objection}\n${scene.verdictImpact}`.toLowerCase()
  const sharedKeywords = ['接口', 'api', '数据库', '前端', '后端', '测试', '验收', '安全', '部署', '状态', '页面']
    .filter((keyword) => source.includes(keyword))
  return actionPack.taskGroups
    .flatMap((group) => group.tasks)
    .filter((task) => {
      const taskSource = `${task.title}\n${task.acceptance}\n${task.source}\n${task.area}`.toLowerCase()
      return (
        taskSource.includes(scene.phaseLabel.toLowerCase()) ||
        sharedKeywords.some((keyword) => taskSource.includes(keyword))
      )
    })
    .slice(0, 3)
    .map((task) => `${task.priority} ${task.title}`)
}

function traceItem(scene: CouncilDebateScene, actionPack?: CouncilLaunchReadinessPack | null): CouncilConsensusTraceItem {
  const source = `${scene.claim}\n${scene.objection}\n${scene.verdictImpact}`
  const cutText = /裁掉|不做|暂缓/.test(scene.verdictImpact)
    ? scene.verdictImpact
    : scene.objection || scene.verdictImpact || scene.claim
  return {
    id: scene.id,
    sceneNo: scene.sceneNo,
    phaseLabel: scene.phaseLabel,
    speakerName: scene.speakerName,
    claim: scene.claim || '本幕未抽取到明确主张。',
    objection: scene.objection || (/质询|反对|风险|裁掉/.test(source) ? compact(source, 180) : ''),
    prdImpact: scene.verdictImpact || '等待主持裁决映射到 PRD 条款。',
    absorbedAs: scene.verdictImpact || scene.claim || '待吸收',
    cutOrRisk: /裁掉|不做|暂缓|风险|失败|过度|漏洞/.test(source)
      ? compact(cutText, 180)
      : '',
    sourceMessageIds: scene.sourceMessageIds,
    taskRefs: sceneTaskRefs(scene, actionPack),
  }
}

function lane(
  id: CouncilConsensusTraceLane['id'],
  label: string,
  items: CouncilConsensusTraceItem[],
  summary: string,
): CouncilConsensusTraceLane {
  return { id, label, items, summary }
}

export function buildCouncilConsensusTrace(input: {
  scenes: CouncilDebateScene[]
  verdictLedger?: CouncilVerdictLedger | null
  actionPack?: CouncilLaunchReadinessPack | null
  generatedAt?: string
}): CouncilConsensusTrace {
  const realScenes = input.scenes.filter((scene) => scene.sourceMessageIds.length > 0)
  const items = realScenes.map((scene) => traceItem(scene, input.actionPack))
  const claimItems = items.filter((item) => /独立主张|追问|发散|主张/.test(`${item.phaseLabel}\n${item.claim}`)).slice(0, 8)
  const challengeItems = items.filter((item) => item.objection || /冲突|质询|反对|风险/.test(item.phaseLabel)).slice(0, 8)
  const absorbItems = items.filter((item) => item.prdImpact || /主持裁决|共识成稿|吸收/.test(item.phaseLabel)).slice(0, 8)
  const cutItems = items.filter((item) => item.cutOrRisk).slice(0, 8)
  const verdictCount =
    (input.verdictLedger?.kept.length || 0) +
    (input.verdictLedger?.cut.length || 0) +
    (input.verdictLedger?.revised.length || 0) +
    (input.verdictLedger?.prdImpacts.length || 0)
  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    totalScenes: input.scenes.length,
    sourcedScenes: realScenes.length,
    totalTasks: input.actionPack?.taskGroups.reduce((sum, group) => sum + group.tasks.length, 0) || 0,
    summary: `已把 ${realScenes.length}/${input.scenes.length} 幕来源发言整理为主张、质询、吸收、裁掉四条证据线，并连接 ${verdictCount} 条裁决账本记录。`,
    lanes: [
      lane('claim', '独立主张', claimItems.length ? claimItems : items.slice(0, 4), '每个人物先给不可替代判断，防止一开始和稀泥。'),
      lane('challenge', '反方质询', challengeItems, '把漏洞、过度设计、证据缺口和失败路径显性化。'),
      lane('absorb', '裁决吸收', absorbItems, '把被采纳的智慧落到 PRD 条款、技术方案或验收标准。'),
      lane('cut', '明确裁掉', cutItems, '记录为什么不做，避免后续又把复杂度带回来。'),
    ],
  }
}

export function renderCouncilConsensusTraceMarkdown(trace: CouncilConsensusTrace): string {
  return [
    '## 共识形成追溯',
    '',
    `- summary: ${trace.summary}`,
    `- scenes: ${trace.sourcedScenes}/${trace.totalScenes}`,
    `- actionTasks: ${trace.totalTasks}`,
    '',
    ...trace.lanes.map((laneItem) =>
      [
        `### ${laneItem.label}`,
        '',
        laneItem.summary,
        '',
        ...(laneItem.items.length
          ? laneItem.items.map((item) =>
              [
                `- 第 ${item.sceneNo} 幕｜${item.phaseLabel}｜${item.speakerName}`,
                `  - 主张: ${item.claim}`,
                item.objection ? `  - 质询: ${item.objection}` : '',
                `  - 吸收为: ${item.absorbedAs}`,
                item.cutOrRisk ? `  - 裁掉/风险: ${item.cutOrRisk}` : '',
                item.taskRefs.length ? `  - 关联任务: ${item.taskRefs.join(' / ')}` : '',
                item.sourceMessageIds.length ? `  - 来源: ${item.sourceMessageIds.join(' / ')}` : '',
              ].filter(Boolean).join('\n'),
            )
          : ['- 暂无明确记录。']),
      ].join('\n'),
    ),
  ].join('\n')
}
