import { chatCompletion, getLLMConfig } from '../ai/provider'
import { buildUiMuseumPrdContext, type UiMuseumPrdContext } from '../ui-museum/context'
import { buildCouncilCreativeEnhancement, type CouncilCreativeEnhancement } from './creative-enhancement'
import { COUNCIL_PERSONAS, type CouncilPersona } from './personas'
import type { CouncilRuntimeCalibrationPlan } from './runtime-calibration'
import type { CouncilRuntimeWisdomContext } from './runtime-wisdom'
import {
  buildCouncilCollaborationMatrix,
  selectCouncilTeam,
  type CouncilMatchCandidateScore,
  type CouncilMatchDecisionSource,
  type CouncilMatchGate,
  type CouncilMatchPhaseId,
  type CouncilMatchProgressEvent,
  type CouncilMatchProgressStatus,
  type CouncilSeatId,
  type CouncilSelectedSeat,
  type CouncilSelection,
} from './selector'

export type { CouncilMatchProgressEvent } from './selector'

interface CouncilMatchGateRunInput {
  problem: string
  creativeEnhancement?: CouncilCreativeEnhancement
  uiStyleContext?: UiMuseumPrdContext | null
  preferredStyleIds?: string[]
  runtimeWisdomContext?: CouncilRuntimeWisdomContext
  runtimeCalibrationPlan?: CouncilRuntimeCalibrationPlan
}

interface CouncilMatchGateRunOptions {
  onProgress?: (event: CouncilMatchProgressEvent) => void
  judgeCompletion?: (prompt: string) => Promise<string>
}

interface JudgeSeatAssignment {
  seatId: CouncilSeatId
  personaId: string
  reasons?: string[]
}

interface JudgeResponse {
  judgeSummary?: string
  finalTeam?: JudgeSeatAssignment[]
  finalPersonaIds?: string[]
  alternatePersonaIds?: string[]
  explanation?: string[]
}

const MATCH_PHASES: Array<{ id: CouncilMatchPhaseId; label: string }> = [
  { id: 'problem-profile', label: '问题画像' },
  { id: 'creative-dna', label: 'Creative DNA' },
  { id: 'candidate-pool', label: '候选池评分' },
  { id: 'model-judge', label: '模型裁判' },
  { id: 'collaboration-matrix', label: '协作矩阵' },
  { id: 'recommendation', label: '推荐成型' },
]

function now(): number {
  return Date.now()
}

function compact(value: string, max = 320): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function emitProgress(
  trace: CouncilMatchProgressEvent[],
  options: CouncilMatchGateRunOptions | undefined,
  phaseId: CouncilMatchPhaseId,
  status: CouncilMatchProgressStatus,
  detail: string,
  candidatePersonaIds: string[] = [],
  decisionSource?: CouncilMatchDecisionSource,
): CouncilMatchProgressEvent {
  const phase = MATCH_PHASES.find((item) => item.id === phaseId)
  const startedAt = trace.find((item) => item.phaseId === phaseId)?.startedAt || now()
  const event: CouncilMatchProgressEvent = {
    phaseId,
    label: phase?.label || phaseId,
    status,
    detail,
    candidatePersonaIds,
    startedAt,
    endedAt: status === 'running' ? undefined : now(),
    decisionSource,
  }
  trace.push(event)
  options?.onProgress?.(event)
  return event
}

function latestCompletedTrace(trace: CouncilMatchProgressEvent[]): CouncilMatchProgressEvent[] {
  return MATCH_PHASES.map((phase) => [...trace].reverse().find((event) => event.phaseId === phase.id && event.status !== 'running'))
    .filter((event): event is CouncilMatchProgressEvent => Boolean(event))
}

function parseJudgeJson(source: string): JudgeResponse {
  return JSON.parse(source) as JudgeResponse
}

function findBalancedJsonObjectEnd(source: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }
  return -1
}

function sliceLikelyJsonObject(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  const source = fenced || trimmed
  const start = source.indexOf('{')
  if (start >= 0) {
    const balancedEnd = findBalancedJsonObjectEnd(source, start)
    return source.slice(start, balancedEnd > start ? balancedEnd : undefined)
  }
  return source
}

type JsonRepairTokenType = 'string' | 'number' | 'literal' | 'objectStart' | 'objectEnd' | 'arrayStart' | 'arrayEnd' | 'colon' | 'comma'
type JsonRepairFrame = {
  type: 'array' | 'object'
  expecting: 'value' | 'commaOrEnd' | 'keyOrEnd' | 'colon' | 'objectValue'
}

function findJsonStringEnd(source: string, start: number): number {
  let escaped = false
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') return index + 1
  }
  return source.length
}

function classifyJsonToken(source: string, start: number): { type: JsonRepairTokenType; end: number } | null {
  const char = source[start]
  if (char === '"') return { type: 'string', end: findJsonStringEnd(source, start) }
  if (char === '{') return { type: 'objectStart', end: start + 1 }
  if (char === '}') return { type: 'objectEnd', end: start + 1 }
  if (char === '[') return { type: 'arrayStart', end: start + 1 }
  if (char === ']') return { type: 'arrayEnd', end: start + 1 }
  if (char === ':') return { type: 'colon', end: start + 1 }
  if (char === ',') return { type: 'comma', end: start + 1 }
  if (/[0-9-]/.test(char)) {
    const match = source.slice(start).match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (match?.[0]) return { type: 'number', end: start + match[0].length }
  }
  if (source.startsWith('true', start) || source.startsWith('null', start)) {
    return { type: 'literal', end: start + 4 }
  }
  if (source.startsWith('false', start)) return { type: 'literal', end: start + 5 }
  return null
}

function markJsonRepairValueComplete(stack: JsonRepairFrame[]): void {
  const parent = stack[stack.length - 1]
  if (!parent) return
  if (parent.type === 'array') {
    parent.expecting = 'commaOrEnd'
    return
  }
  if (parent.expecting === 'objectValue') parent.expecting = 'commaOrEnd'
}

function shouldInsertMissingComma(stack: JsonRepairFrame[], tokenType: JsonRepairTokenType): boolean {
  const frame = stack[stack.length - 1]
  if (!frame || frame.expecting !== 'commaOrEnd') return false
  if (frame.type === 'array') {
    return tokenType === 'string' || tokenType === 'number' || tokenType === 'literal' || tokenType === 'objectStart' || tokenType === 'arrayStart'
  }
  return tokenType === 'string'
}

function repairMissingCommasByJsonContext(source: string): string {
  const stack: JsonRepairFrame[] = []
  let output = ''
  let index = 0

  while (index < source.length) {
    const token = classifyJsonToken(source, index)
    if (!token) {
      output += source[index]
      index += 1
      continue
    }

    const frame = stack[stack.length - 1]
    if (shouldInsertMissingComma(stack, token.type)) output += ','

    const text = source.slice(index, token.end)
    output += text

    switch (token.type) {
      case 'objectStart':
        stack.push({ type: 'object', expecting: 'keyOrEnd' })
        break
      case 'arrayStart':
        stack.push({ type: 'array', expecting: 'value' })
        break
      case 'objectEnd':
      case 'arrayEnd':
        stack.pop()
        markJsonRepairValueComplete(stack)
        break
      case 'colon':
        if (frame?.type === 'object' && frame.expecting === 'colon') frame.expecting = 'objectValue'
        break
      case 'comma':
        if (frame?.type === 'array') frame.expecting = 'value'
        if (frame?.type === 'object') frame.expecting = 'keyOrEnd'
        break
      case 'string':
        if (frame?.type === 'object' && (frame.expecting === 'keyOrEnd' || frame.expecting === 'commaOrEnd')) {
          frame.expecting = 'colon'
        } else {
          markJsonRepairValueComplete(stack)
        }
        break
      case 'number':
      case 'literal':
        markJsonRepairValueComplete(stack)
        break
    }

    index = token.end
  }

  return output
}

function repairTruncatedJsonStructure(source: string): string {
  let repaired = source.trim()
  const stack: Array<'}' | ']'> = []
  let inString = false
  let escaped = false

  for (let index = 0; index < repaired.length; index += 1) {
    const char = repaired[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') stack.push('}')
    else if (char === '[') stack.push(']')
    else if ((char === '}' || char === ']') && stack[stack.length - 1] === char) stack.pop()
  }

  if (inString) {
    if (escaped && repaired.endsWith('\\')) repaired = repaired.slice(0, -1)
    repaired += '"'
  }

  repaired = repaired.replace(/,\s*$/g, '')
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    repaired += stack[index]
  }
  return repaired.replace(/,\s*([}\]])/g, '$1')
}

function buildTruncatedJsonRepairCandidates(source: string): string[] {
  const candidates = new Set<string>()
  const trimmed = source.trim()
  if (!trimmed) return []
  candidates.add(repairTruncatedJsonStructure(trimmed))

  for (let index = trimmed.length - 1; index >= 0 && candidates.size < 12; index -= 1) {
    const char = trimmed[index]
    if (char !== ',' && char !== '}' && char !== ']') continue
    const slice = trimmed.slice(0, char === ',' ? index : index + 1).trim()
    if (slice.length < 2) continue
    candidates.add(repairTruncatedJsonStructure(slice))
  }

  return Array.from(candidates).filter((candidate) => candidate !== trimmed)
}

function isLikelyTruncatedJsonError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /Unexpected end of JSON input|unterminated|end of data|EOF|Expected ',' or '}' after property value/i.test(message)
}

function isUnbalancedJsonObjectSource(source: string): boolean {
  const start = source.indexOf('{')
  return start >= 0 && findBalancedJsonObjectEnd(source, start) < 0
}

function repairCommonJudgeJsonIssues(source: string): string {
  const repaired = source
    .replace(/^\uFEFF/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([}\]])\s*(?=\{)/g, '$1,')
    .replace(/([}\]])\s*(?="[^"]+"\s*:)/g, '$1,')
    .replace(/("(?:\\.|[^"\\])*"|\b\d+(?:\.\d+)?\b|true|false|null)\s*(?="[^"]+"\s*:)/g, '$1,')
    .replace(/("(?:\\.|[^"\\])*")\s*(?="(?:\\.|[^"\\])*"\s*[,}\]])/g, '$1,')
  return repairMissingCommasByJsonContext(repaired)
}

function normalizeJudgeResponse(value: JudgeResponse): JudgeResponse {
  return {
    judgeSummary: typeof value.judgeSummary === 'string' ? value.judgeSummary : undefined,
    finalTeam: Array.isArray(value.finalTeam)
      ? value.finalTeam
          .filter((item) => item && typeof item.seatId === 'string' && typeof item.personaId === 'string')
          .map((item) => ({
            seatId: item.seatId,
            personaId: item.personaId,
            reasons: Array.isArray(item.reasons) ? item.reasons.map(String).filter(Boolean) : [],
          }))
      : undefined,
    finalPersonaIds: Array.isArray(value.finalPersonaIds) ? value.finalPersonaIds.map(String).filter(Boolean) : undefined,
    alternatePersonaIds: Array.isArray(value.alternatePersonaIds) ? value.alternatePersonaIds.map(String).filter(Boolean) : undefined,
    explanation: Array.isArray(value.explanation) ? value.explanation.map(String).filter(Boolean) : undefined,
  }
}

function extractJsonObject(raw: string): JudgeResponse {
  const source = sliceLikelyJsonObject(raw)
  try {
    return normalizeJudgeResponse(parseJudgeJson(source))
  } catch (firstError) {
    try {
      return normalizeJudgeResponse(parseJudgeJson(repairCommonJudgeJsonIssues(source)))
    } catch {
      if (isLikelyTruncatedJsonError(firstError) || isUnbalancedJsonObjectSource(source)) {
        for (const candidate of buildTruncatedJsonRepairCandidates(source)) {
          try {
            const parsed = normalizeJudgeResponse(parseJudgeJson(repairCommonJudgeJsonIssues(candidate)))
            return {
              ...parsed,
              judgeSummary: parsed.judgeSummary
                ? `${parsed.judgeSummary}（模型输出截断，已从完整 JSON 片段恢复。）`
                : '模型输出截断，已从完整 JSON 片段恢复。',
            }
          } catch {}
        }
      }
      const message = firstError instanceof Error ? firstError.message : '未知解析错误'
      throw new Error(`模型裁判没有返回有效 JSON：${message}`)
    }
  }
}

function ensureUsableJudgeTeam(judge: JudgeResponse): JudgeResponse {
  const finalTeamCount = Array.isArray(judge.finalTeam) ? judge.finalTeam.length : 0
  const finalPersonaCount = Array.isArray(judge.finalPersonaIds) ? judge.finalPersonaIds.length : 0
  if (finalTeamCount > 0 || finalPersonaCount > 0) return judge
  throw new Error('模型裁判没有返回可用编队。')
}

function findCandidate(
  candidateScores: CouncilMatchCandidateScore[],
  seatId: CouncilSeatId,
  personaId: string,
): CouncilMatchCandidateScore | undefined {
  return (
    candidateScores.find((candidate) => candidate.seatId === seatId && candidate.personaId === personaId) ||
    candidateScores.find((candidate) => candidate.personaId === personaId)
  )
}

function localSeatById(selection: CouncilSelection, seatId: CouncilSeatId): CouncilSelectedSeat['seat'] | undefined {
  return selection.seats.find((item) => item.seat.id === seatId)?.seat
}

function buildSelectedSeat(
  local: CouncilSelection,
  personas: CouncilPersona[],
  assignment: JudgeSeatAssignment,
): CouncilSelectedSeat | null {
  const seat = localSeatById(local, assignment.seatId)
  const persona = personas.find((item) => item.id === assignment.personaId)
  if (!seat || !persona) return null
  const candidate = findCandidate(local.matchGate.candidateScores, assignment.seatId, assignment.personaId)
  const localSeat = local.seats.find((item) => item.seat.id === assignment.seatId && item.persona.id === assignment.personaId)
  const fallback = local.seats.find((item) => item.seat.id === assignment.seatId) || local.seats[0]
  return {
    seat,
    persona,
    score: candidate?.score || localSeat?.score || fallback.score,
    scoreFactors: candidate?.scoreFactors || localSeat?.scoreFactors || fallback.scoreFactors,
    reasons: assignment.reasons?.length ? assignment.reasons : candidate?.reasons || localSeat?.reasons || fallback.reasons,
  }
}

function assignmentsFromJudge(judge: JudgeResponse, local: CouncilSelection): JudgeSeatAssignment[] {
  if (Array.isArray(judge.finalTeam) && judge.finalTeam.length > 0) {
    return judge.finalTeam
      .filter((item) => item && item.seatId && item.personaId)
      .map((item) => ({
        seatId: item.seatId,
        personaId: item.personaId,
        reasons: Array.isArray(item.reasons) ? item.reasons.map(String).filter(Boolean) : [],
      }))
  }
  if (Array.isArray(judge.finalPersonaIds) && judge.finalPersonaIds.length > 0) {
    return local.seats.map((seat, index) => ({
      seatId: seat.seat.id,
      personaId: String(judge.finalPersonaIds?.[index] || seat.persona.id),
    }))
  }
  return []
}

function applyJudgeResponse(local: CouncilSelection, judge: JudgeResponse, personas: CouncilPersona[]): CouncilSelection {
  const seen = new Set<string>()
  const selected: CouncilSelectedSeat[] = []
  for (const assignment of assignmentsFromJudge(judge, local)) {
    if (seen.has(assignment.personaId)) continue
    const seat = buildSelectedSeat(local, personas, assignment)
    if (!seat) continue
    selected.push(seat)
    seen.add(assignment.personaId)
  }
  for (const seat of local.seats) {
    if (selected.length >= local.seats.length) break
    if (seen.has(seat.persona.id)) continue
    selected.push(seat)
    seen.add(seat.persona.id)
  }
  if (selected.length < 5) throw new Error('模型裁判没有给出足够完整的编队。')

  const alternateOrder = Array.isArray(judge.alternatePersonaIds) ? judge.alternatePersonaIds.map(String) : []
  const alternateRank = new Map(alternateOrder.map((id, index) => [id, index]))
  const alternates = [...local.alternates]
    .filter((item) => !seen.has(item.persona.id))
    .sort((a, b) => {
      const aRank = alternateRank.get(a.persona.id) ?? 999
      const bRank = alternateRank.get(b.persona.id) ?? 999
      return aRank - bRank || b.score - a.score
    })

  return {
    ...local,
    seats: selected,
    alternates,
  }
}

function decorateMatchGate(
  selection: CouncilSelection,
  trace: CouncilMatchProgressEvent[],
  input: {
    decisionSource: CouncilMatchDecisionSource
    judgeSummary: string
    explanation?: string[]
    creativeDnaUsed: boolean
    styleContextUsed: boolean
  },
): CouncilSelection {
  const finalTeam = selection.seats.map((item) => ({
    seatId: item.seat.id,
    personaId: item.persona.id,
    personaName: item.persona.name,
    role: item.seat.label,
    score: item.score,
    reasons: item.reasons,
  }))
  const alternates = selection.alternates.slice(0, 8).map((item) => {
    const candidate = findCandidate(selection.matchGate.candidateScores, item.seat.id, item.persona.id)
    return {
      seatId: item.seat.id,
      seatLabel: item.seat.label,
      personaId: item.persona.id,
      personaName: item.persona.name,
      score: item.score,
      distillationStatus: candidate?.distillationStatus || selection.matchGate.candidateScores.find((score) => score.personaId === item.persona.id)?.distillationStatus || '已蒸馏',
      scoreFactors: item.scoreFactors,
      reasons: item.reasons,
    }
  })
  const gate: CouncilMatchGate = {
    ...selection.matchGate,
    gateId: `council-match-${now().toString(36)}`,
    stageTrace: latestCompletedTrace(trace),
    judgeSummary: input.judgeSummary,
    decisionSource: input.decisionSource,
    creativeDnaUsed: input.creativeDnaUsed,
    styleContextUsed: input.styleContextUsed,
    finalTeam,
    alternates,
    collaborationMatrix: buildCouncilCollaborationMatrix(selection.seats),
    explanation: input.explanation?.length ? input.explanation : selection.matchGate.explanation,
  }
  return { ...selection, matchGate: gate }
}

function buildJudgePrompt(input: {
  problem: string
  localSelection: CouncilSelection
  creativeEnhancement: CouncilCreativeEnhancement
  uiStyleContext: UiMuseumPrdContext | null
  runtimeWisdomContext?: CouncilRuntimeWisdomContext
  runtimeCalibrationPlan?: CouncilRuntimeCalibrationPlan
}): string {
  const candidateRows = input.localSelection.matchGate.candidateScores
    .slice(0, 24)
    .map((candidate) =>
      [
        candidate.seatId,
        candidate.personaId,
        candidate.personaName,
        `score=${candidate.score}`,
        `reasons=${candidate.reasons.slice(0, 3).join(' / ')}`,
      ].join(' | '),
    )
    .join('\n')
  const localTeam = input.localSelection.seats
    .map((seat) => `${seat.seat.id}: ${seat.persona.id} ${seat.persona.name} score=${seat.score}`)
    .join('\n')
  return `你是小白智囊团 CouncilMatchGate 的模型裁判。请只输出 JSON，不要 Markdown。

目标：从候选大师中选出 5-7 位最高效、最高互补、最能产生突破又能收束 PRD 的编队。
必须保留：主持、产品/战略、技术、用户/市场、反方风险、视觉表达；复杂问题可保留研究或创意席位。
不能为了名气选人；必须看 Nuwa 蒸馏、技能成熟、证据、dream 对齐、反方价值和互补冲突。

Boss 问题：
${input.problem}

Creative DNA：
${compact(input.creativeEnhancement.creativeDnaSummary, 700)}

UI 风格馆：
${input.uiStyleContext ? `${input.uiStyleContext.styleNames.join(' / ')}；${input.uiStyleContext.reasoning}` : '未提供'}

运行智慧反馈：
${input.runtimeWisdomContext?.promptFragment || '暂无历史运行反馈。本轮必须作为第一条严肃证据基线，不得假装已有深度运行。'}

95 真实长跑评测协议：
${input.runtimeCalibrationPlan?.promptFragment || '暂无校准协议。本轮必须记录是否满足 deep-model、120s、完整 trace、90+ 质量门和真实用户验证缺口。'}

本地规则推荐：
${localTeam}

候选评分池：
${candidateRows}

请返回 JSON：
{
  "judgeSummary": "一句话说明这次为什么这样选",
  "finalTeam": [
    {"seatId":"host","personaId":"persona-id","reasons":["为什么必须是它","它要质询谁或被谁质询"]}
  ],
  "alternatePersonaIds": ["persona-id"],
  "explanation": ["选择逻辑1","选择逻辑2","冲突/互补逻辑"]
}`
}

async function completeJudgePrompt(prompt: string, maxTokens: number, options?: CouncilMatchGateRunOptions): Promise<string> {
  return options?.judgeCompletion
    ? await options.judgeCompletion(prompt)
    : await chatCompletion(
        getLLMConfig(),
        [
          { role: 'system', content: '你是严苛的小白智囊团编队裁判。只输出 JSON。' },
          { role: 'user', content: prompt },
        ],
        0.26,
        maxTokens,
      )
}

async function callJudge(prompt: string, options?: CouncilMatchGateRunOptions): Promise<JudgeResponse> {
  const raw = await completeJudgePrompt(prompt, 3600, options)
  try {
    return ensureUsableJudgeTeam(extractJsonObject(raw))
  } catch (firstError) {
    const retryPrompt = `${prompt}

上一次模型裁判输出无法被 JSON.parse 解析。请重新输出完整 JSON：
- 只输出一个完整 JSON object，不要 Markdown，不要解释。
- finalTeam 必须 5-7 个对象，每个对象都有 seatId、personaId、reasons。
- 所有数组和对象必须闭合，禁止省略尾部字段，禁止输出半截 JSON。`
    try {
      return ensureUsableJudgeTeam(extractJsonObject(await completeJudgePrompt(retryPrompt, 4200, options)))
    } catch (secondError) {
      const firstMessage = firstError instanceof Error ? firstError.message : String(firstError)
      const secondMessage = secondError instanceof Error ? secondError.message : String(secondError)
      throw new Error(`${firstMessage}；已自动重试模型裁判仍失败：${secondMessage}`)
    }
  }
}

export async function runCouncilMatchGate(
  input: string | CouncilMatchGateRunInput,
  options?: CouncilMatchGateRunOptions,
): Promise<CouncilSelection> {
  const problem = typeof input === 'string' ? input.trim() : input.problem.trim()
  if (!problem) throw new Error('请输入要交给小白智囊团处理的问题或项目构想。')
  const trace: CouncilMatchProgressEvent[] = []
  const explicit: Partial<CouncilMatchGateRunInput> = typeof input === 'string' ? {} : input

  emitProgress(trace, options, 'problem-profile', 'running', '正在解析问题难度、领域、风险和产物意图。')
  const localSelection = selectCouncilTeam(problem)
  emitProgress(
    trace,
    options,
    'problem-profile',
    'completed',
    `识别到 ${localSelection.profile.domains.join(' / ')}；难度 ${localSelection.profile.difficulty}/5；风险 ${localSelection.profile.riskLevel}。`,
  )

  emitProgress(trace, options, 'creative-dna', 'running', '正在读取创意孵化器画像、Boss 画像和本轮输入。')
  const creativeEnhancement = explicit.creativeEnhancement || await buildCouncilCreativeEnhancement(problem)
  emitProgress(
    trace,
    options,
    'creative-dna',
    'completed',
    `${creativeEnhancement.source}：${compact(creativeEnhancement.creativeDnaSummary, 160)}`,
  )

  emitProgress(trace, options, 'candidate-pool', 'running', '正在生成候选大师评分池和替补名单。')
  const candidateIds = localSelection.matchGate.candidateScores.slice(0, 12).map((candidate) => candidate.personaId)
  emitProgress(
    trace,
    options,
    'candidate-pool',
    'completed',
    `已评分 ${localSelection.matchGate.candidateScores.length} 个候选席位组合，保留前 ${candidateIds.length} 个进入裁判视野。`,
    candidateIds,
  )

  const uiStyleContext =
    explicit.uiStyleContext === undefined
      ? buildUiMuseumPrdContext(
          [problem, creativeEnhancement.promptFragment, localSelection.seats.map((seat) => seat.persona.name).join(' / ')].join('\n\n'),
          explicit.preferredStyleIds || [],
        )
      : explicit.uiStyleContext

  emitProgress(trace, options, 'model-judge', 'running', '正在让模型裁判审查候选池、互补关系、冲突价值和成本速度。', candidateIds)
  try {
    const judge = await callJudge(
      buildJudgePrompt({
        problem,
        localSelection,
        creativeEnhancement,
        uiStyleContext: uiStyleContext || null,
        runtimeWisdomContext: explicit.runtimeWisdomContext,
        runtimeCalibrationPlan: explicit.runtimeCalibrationPlan,
      }),
      options,
    )
    emitProgress(
      trace,
      options,
      'model-judge',
      'completed',
      judge.judgeSummary || '模型裁判已完成编队取舍。',
      candidateIds,
      'deep-model',
    )
    const judgedSelection = applyJudgeResponse(localSelection, judge, COUNCIL_PERSONAS)
    emitProgress(
      trace,
      options,
      'collaboration-matrix',
      'completed',
      `已形成 ${buildCouncilCollaborationMatrix(judgedSelection.seats).length} 条互补/冲突/覆盖关系。`,
      judgedSelection.seats.map((seat) => seat.persona.id),
      'deep-model',
    )
    emitProgress(
      trace,
      options,
      'recommendation',
      'completed',
      `推荐 ${judgedSelection.seats.length} 位大师，等待 Boss 查看理由并确认开会。`,
      judgedSelection.seats.map((seat) => seat.persona.id),
      'deep-model',
    )
    return decorateMatchGate(judgedSelection, trace, {
      decisionSource: 'deep-model',
      judgeSummary: judge.judgeSummary || '模型裁判已完成深度匹配。',
      explanation: judge.explanation,
      creativeDnaUsed: Boolean(creativeEnhancement.creativeDnaSummary),
      styleContextUsed: Boolean(uiStyleContext),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    emitProgress(
      trace,
      options,
      'model-judge',
      'failed',
      `模型裁判失败，使用本地规则安全推荐：${message}`,
      candidateIds,
      'local-fallback',
    )
    emitProgress(
      trace,
      options,
      'collaboration-matrix',
      'completed',
      `已使用本地规则生成 ${localSelection.matchGate.collaborationMatrix.length} 条互补/冲突/覆盖关系。`,
      localSelection.seats.map((seat) => seat.persona.id),
      'local-fallback',
    )
    emitProgress(
      trace,
      options,
      'recommendation',
      'completed',
      `推荐 ${localSelection.seats.length} 位大师，已标记为本地 fallback。`,
      localSelection.seats.map((seat) => seat.persona.id),
      'local-fallback',
    )
    return decorateMatchGate(localSelection, trace, {
      decisionSource: 'local-fallback',
      judgeSummary: `模型裁判未稳定返回，已使用本地规则推荐。原因：${message}`,
      creativeDnaUsed: Boolean(creativeEnhancement.creativeDnaSummary),
      styleContextUsed: Boolean(uiStyleContext),
    })
  }
}
