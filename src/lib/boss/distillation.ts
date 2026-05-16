import { dbSaveMemory } from '../db/repository'
import { getBossProfile, setBossProfile } from '../db/store'
import { dbSaveOperatingEvent } from '../db/repository'

const STORAGE_KEY = 'gop_boss_distillation_proposals'

export type BossDistillationDimension =
  | 'mission'
  | 'value'
  | 'preference'
  | 'cognitive_style'
  | 'learning_mode'
  | 'expression_dna'
  | 'energy_rhythm'
  | 'emotion_weight'
  | 'emotion_triggers'
  | 'relationship_boundary'
  | 'boundary'
  | 'decision_pattern'
  | 'project_taste'
  | 'aesthetic_taste'
  | 'authorization_boundary'
  | 'anti_patterns'
  | 'anti_pattern'

export type BossDistillationEvidenceTier =
  | 'boss_verbatim'
  | 'boss_action'
  | 'boss_assessment'
  | 'derived_inference'
  | 'external_context'
export type BossDistillationTemporalScope = 'momentary' | 'stage' | 'long_term'
export type BossDistillationStatus = 'pending' | 'approved' | 'rejected'

export interface BossDistillationEvidenceRef {
  sourceKind: string
  sourceId: string
  quote: string
  locator?: string
}

export interface BossDistillationClaim {
  id: string
  dimension: BossDistillationDimension
  claim: string
  evidenceTier: BossDistillationEvidenceTier
  evidenceRefs: BossDistillationEvidenceRef[]
  confidence: number
  temporalScope: BossDistillationTemporalScope
  affectsProfileKeys?: string[]
  status: BossDistillationStatus | 'proposed'
  sourceKind?: string
  sourceId?: string
}

export interface BossDistillationMemoryWrite {
  category: 'preference' | 'pattern' | 'insight' | 'correction' | 'goal' | 'emotion'
  content: string
  confidence?: number
}

export interface BossDistillationProposal {
  id: string
  title: string
  rationale: string
  proposedBy?: string
  status: BossDistillationStatus
  source?: {
    kind: string
    sourceId: string
    title: string
  }
  claims: BossDistillationClaim[]
  profilePatch?: Record<string, string>
  memoryWrites?: BossDistillationMemoryWrite[]
  decisionReason?: string
  createdAt: string
  updatedAt: string
}

export interface BossDistillationDraft {
  id?: string
  title: string
  rationale: string
  proposedBy?: string
  source?: BossDistillationProposal['source']
  claims: Array<Omit<BossDistillationClaim, 'id' | 'status'> & Partial<Pick<BossDistillationClaim, 'id' | 'status'>>>
  profilePatch?: Record<string, string>
  memoryWrites?: BossDistillationMemoryWrite[]
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function loadProposals(): BossDistillationProposal[] {
  if (!canUseStorage()) return []
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as BossDistillationProposal[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveProposals(proposals: BossDistillationProposal[]) {
  if (!canUseStorage()) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(proposals))
}

function compactId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\u4e00-\u9fa5-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || `distill_${Date.now().toString(36)}`
}

function normalizeClaim(
  claim: BossDistillationDraft['claims'][number],
  index: number,
  source: BossDistillationProposal['source'],
): BossDistillationClaim {
  return {
    ...claim,
    id: claim.id || `claim_${Date.now().toString(36)}_${index}`,
    status: claim.status || 'proposed',
    confidence: Math.max(0, Math.min(1, claim.confidence ?? 0.6)),
    evidenceRefs: claim.evidenceRefs || [],
    sourceKind: claim.evidenceRefs?.[0]?.sourceKind || source?.kind,
    sourceId: claim.evidenceRefs?.[0]?.sourceId || source?.sourceId,
  }
}

function assertProfilePatchAllowed(draft: BossDistillationDraft) {
  if (!draft.profilePatch || Object.keys(draft.profilePatch).length === 0) return
  const claims = draft.claims || []
  const hasBossEvidence = claims.some((claim) =>
    claim.evidenceTier === 'boss_verbatim' ||
    claim.evidenceRefs?.some((ref) => ref.sourceKind === 'whiteboard' || ref.sourceKind === 'conversation' || ref.sourceKind === 'boss'),
  )
  if (!hasBossEvidence) {
    throw new Error('外部参照不能直接写入 Boss profile，需要 Boss 原话或明确确认。')
  }
}

async function recordDistillationEvent(proposal: BossDistillationProposal, summary: string, stage: 'review' | 'remember') {
  await dbSaveOperatingEvent({
    id: `op_boss_distill_${proposal.id}_${Date.now().toString(36)}`,
    type: 'boss_signal',
    stage,
    signalKind: 'cognitive_style',
    summary,
    profileImpact: proposal.profilePatch && Object.keys(proposal.profilePatch).length > 0 ? 'high' : 'medium',
    source: {
      kind: (proposal.source?.kind || 'manual') as never,
      sourceId: proposal.source?.sourceId || proposal.id,
      title: proposal.source?.title || proposal.title,
    },
    confidence: Math.max(...proposal.claims.map((claim) => claim.confidence), 0.6),
    entities: ['boss-distillation', proposal.id, ...proposal.claims.map((claim) => claim.dimension)],
  })
}

export async function proposeBossDistillation(draft: BossDistillationDraft): Promise<BossDistillationProposal> {
  assertProfilePatchAllowed(draft)
  const now = new Date().toISOString()
  const proposal: BossDistillationProposal = {
    id: draft.id || compactId(draft.title),
    title: draft.title,
    rationale: draft.rationale,
    proposedBy: draft.proposedBy,
    status: 'pending',
    source: draft.source,
    claims: draft.claims.map((claim, index) => normalizeClaim(claim, index, draft.source)),
    profilePatch: draft.profilePatch,
    memoryWrites: draft.memoryWrites,
    createdAt: now,
    updatedAt: now,
  }

  const proposals = loadProposals().filter((item) => item.id !== proposal.id)
  saveProposals([proposal, ...proposals])
  await recordDistillationEvent(proposal, `Boss 蒸馏提案待确认：${proposal.title}`, 'review')
  return proposal
}

export async function getBossDistillationProposal(id: string): Promise<BossDistillationProposal | undefined> {
  return loadProposals().find((proposal) => proposal.id === id)
}

export async function listBossDistillationProposals(status?: BossDistillationStatus): Promise<BossDistillationProposal[]> {
  return loadProposals()
    .filter((proposal) => !status || proposal.status === status)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function listBossDistillationClaims(options: {
  status?: BossDistillationStatus | 'proposed'
  limit?: number
} = {}): Promise<BossDistillationClaim[]> {
  const claims = loadProposals()
    .flatMap((proposal) => proposal.claims.map((claim) => ({
      ...claim,
      status: proposal.status === 'approved' ? 'approved' : claim.status,
      sourceKind: claim.sourceKind || proposal.source?.kind,
      sourceId: claim.sourceId || proposal.source?.sourceId,
    })))
    .filter((claim) => !options.status || claim.status === options.status)
  return claims.slice(0, options.limit || 50)
}

export async function approveBossDistillation(id: string, reason = ''): Promise<BossDistillationProposal | undefined> {
  const proposals = loadProposals()
  const index = proposals.findIndex((proposal) => proposal.id === id)
  if (index < 0) return undefined

  const updated: BossDistillationProposal = {
    ...proposals[index],
    status: 'approved',
    decisionReason: reason,
    claims: proposals[index].claims.map((claim) => ({ ...claim, status: 'approved' })),
    updatedAt: new Date().toISOString(),
  }
  proposals[index] = updated
  saveProposals(proposals)

  if (updated.profilePatch) {
    setBossProfile({ ...getBossProfile(), ...updated.profilePatch })
  }
  for (const item of updated.memoryWrites || []) {
    await dbSaveMemory(item.category, item.content, `boss-distillation:${updated.id}`, item.confidence ?? 0.78)
  }
  await recordDistillationEvent(updated, `Boss 蒸馏提案已确认：${updated.title}`, 'remember')
  return updated
}

export async function rejectBossDistillation(id: string, reason = ''): Promise<BossDistillationProposal | undefined> {
  const proposals = loadProposals()
  const index = proposals.findIndex((proposal) => proposal.id === id)
  if (index < 0) return undefined

  const updated: BossDistillationProposal = {
    ...proposals[index],
    status: 'rejected',
    decisionReason: reason,
    claims: proposals[index].claims.map((claim) => ({ ...claim, status: 'rejected' })),
    updatedAt: new Date().toISOString(),
  }
  proposals[index] = updated
  saveProposals(proposals)
  await recordDistillationEvent(updated, `Boss 蒸馏提案已拒绝：${updated.title}`, 'review')
  return updated
}

export async function loadApprovedBossDistillationContext(): Promise<string> {
  const claims = await listBossDistillationClaims({ status: 'approved', limit: 40 })
  if (claims.length === 0) return ''
  return [
    '<boss-distillation>',
    ...claims.map((claim) => `- [${claim.dimension}] ${claim.claim}（证据: ${claim.evidenceTier}，置信度: ${claim.confidence.toFixed(2)}）`),
    '</boss-distillation>',
  ].join('\n')
}
