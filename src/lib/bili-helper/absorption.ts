import { getLLMConfig } from '../ai/provider'
import { query } from '../db/repository'
import { ingestSource, type IngestParams, type IngestResult } from '../knowledge/ingest'
import { requestWikiCompile } from '../knowledge/wiki-compile-queue'
import type {
  BiliVideoWorkspace,
  OpenbasakaFusionResult,
  WanxiangLearningResult,
} from './types'

export type WanxiangArchiveSourceType = IngestParams['sourceType']

export interface WanxiangAbsorptionResult {
  sourceId: string
  drawerId: string
  queueEventId?: string
  promptPatchCount: number
}

export interface WanxiangArchiveResult {
  sourceId: string
  drawerId: string
  queueEventId?: string
}

export interface WanxiangAbsorbedCapability {
  sourceId: string
  title: string
  absorptionScore: number
  absorptionVerdict: string
  targetSubsystems: string[]
  systemTransformationPrompt: string
  promptPatches: OpenbasakaFusionResult['promptPatches']
  reusableAssets: OpenbasakaFusionResult['reusableAssets']
}

function safeText(value: unknown, fallback = ''): string {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim()
}

function rawSourceText(workspace: BiliVideoWorkspace): string {
  return workspace.transcript || workspace.video.contentText || workspace.video.description || workspace.video.title
}

function workspaceWithResult(workspace: BiliVideoWorkspace, result: WanxiangLearningResult): BiliVideoWorkspace {
  return { ...workspace, wanxiang: result }
}

export function mapWanxiangSourceType(workspace: BiliVideoWorkspace): WanxiangArchiveSourceType {
  if (workspace.video.inputType === 'file' || workspace.video.filePath) return 'file'
  if (workspace.video.inputType === 'url' || /^https?:\/\//i.test(workspace.video.canonicalUrl || workspace.video.url)) return 'url'
  if (workspace.video.sourceKind === 'webpage' || workspace.video.sourceKind === 'social' || workspace.video.sourceKind === 'cloud') return 'url'
  return 'paste'
}

export function buildSystemTransformationPrompt(result: WanxiangLearningResult, _workspace?: BiliVideoWorkspace): string {
  return result.openbasakaFusion.systemTransformationPrompt || result.openbasakaFusion.masterPrompt
}

export function buildPromptPatches(result: WanxiangLearningResult, _workspace?: BiliVideoWorkspace): OpenbasakaFusionResult['promptPatches'] {
  return result.openbasakaFusion.promptPatches || []
}

export function buildWanxiangArchiveMarkdown(result: WanxiangLearningResult, workspace: BiliVideoWorkspace): string {
  const raw = rawSourceText(workspace)
  return `${result.markdown || `# ${workspace.video.title}`}

## 普通资料归档说明

这是一份“万象学习三结果”的普通资料保存：保留教程、系统吸收说明、导图 Markdown、原始来源与证据。它不等于 Openbasaka 已经吸收这份资料的系统能力。

## 原始来源

${raw || '暂无正文。'}`
}

export function buildOpenbasakaAbsorptionMarkdown(result: WanxiangLearningResult, workspace: BiliVideoWorkspace): string {
  const prompt = buildSystemTransformationPrompt(result, workspace)
  return `# 系统能力补丁：${workspace.video.title}

Source: ${workspace.video.url}
Platform: ${workspace.video.platformName}
Source kind: ${workspace.video.sourceKind}
Source ID: ${workspace.video.bvid}
Owner: ${workspace.video.owner}
Absorption score: ${Math.round(result.openbasakaFusion.absorptionScore)} / 100
Absorption verdict: ${result.openbasakaFusion.absorptionVerdict}

## 这不是普通归档

这份内容来自用户确认的一键吸收动作。它的用途是把来源精华转成 Openbasaka 可召回、可追溯、可回滚的系统能力 Prompt 包。

## 系统改造 Prompt

${prompt}

## Prompt Patches

${result.openbasakaFusion.promptPatches.map((patch) => `### ${patch.title}\n\n- target: ${patch.target}\n- evidence: ${patch.evidenceRefs.map((ref) => ref.id).join(', ') || 'verification_required'}\n\n${patch.prompt}`).join('\n\n')}

## 可复用资产

${result.openbasakaFusion.reusableAssets.map((asset) => `### ${asset.title}\n\n- kind: ${asset.kind}\n- evidence: ${asset.evidenceRefs.map((ref) => ref.id).join(', ') || 'verification_required'}\n\n${asset.content}`).join('\n\n')}

## 融入步骤

${result.openbasakaFusion.integrationSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

## 教学判定与教程入口

- 教学资料：${result.teaching.isTeaching ? '是' : '否'}
- 置信度：${Math.round(result.teaching.confidence * 100)}%

${result.teaching.isTeaching ? `${result.teaching.beginnerTutorial || ''}\n\n${result.teaching.modelTutorial || ''}` : result.teaching.nonTeachingDigest || ''}

## 导图 Markdown

${result.mindMap.markdown}

## 来源证据

${result.teaching.evidenceRefs.map((ref) => `- ${ref.id}${ref.time ? ` ${ref.time}` : ''}: ${ref.quote}`).join('\n')}

## 原始来源

${rawSourceText(workspace) || '暂无正文。'}`
}

function buildTags(result: WanxiangLearningResult, workspace: BiliVideoWorkspace, extra: string[] = []): string[] {
  return Array.from(
    new Set([
      ...(result.openbasakaFusion.archiveTags || []),
      '万象学习',
      result.teaching.isTeaching ? '教学资料' : '资料理解',
      workspace.video.platformName,
      workspace.video.sourceKind,
      ...workspace.video.tags,
      ...extra,
    ].map((item) => safeText(item)).filter(Boolean)),
  ).slice(0, 14)
}

function baseMetadata(result: WanxiangLearningResult, workspace: BiliVideoWorkspace, tags: string[], folderPath: string): Record<string, unknown> {
  return {
    folderPath,
    tags,
    wanxiangLearning: true,
    sourceId: result.sourceId,
    sourceTitle: result.sourceTitle,
    teaching: {
      isTeaching: result.teaching.isTeaching,
      confidence: result.teaching.confidence,
      evidenceRefs: result.teaching.evidenceRefs,
    },
    openbasakaFusion: {
      applicable: result.openbasakaFusion.applicable,
      absorptionScore: result.openbasakaFusion.absorptionScore,
      absorptionVerdict: result.openbasakaFusion.absorptionVerdict,
      targetSubsystems: result.openbasakaFusion.targetSubsystems,
      risks: result.openbasakaFusion.risks,
    },
    mindMapLayout: result.mindMap.layout,
    platform: workspace.video.platform,
    platformName: workspace.video.platformName,
    originalSourceKind: workspace.video.sourceKind,
    originalInputType: workspace.video.inputType,
    originalUrl: workspace.video.canonicalUrl || workspace.video.url,
    originalFilePath: workspace.video.filePath || '',
  }
}

async function ingestWanxiangSource(params: IngestParams): Promise<IngestResult> {
  return ingestSource(params, getLLMConfig())
}

export async function absorbIntoOpenbasaka(result: WanxiangLearningResult, workspace: BiliVideoWorkspace): Promise<WanxiangAbsorptionResult> {
  const scopedWorkspace = workspaceWithResult(workspace, result)
  const folderPath = result.openbasakaFusion.folderPath || '知识+大佬/万象学习'
  const tags = buildTags(result, scopedWorkspace, ['系统能力补丁', '一键吸收', 'Prompt化改造'])
  const source = await ingestWanxiangSource({
    sourceType: 'auto',
    title: `系统能力补丁：${workspace.video.title}`,
    content: buildOpenbasakaAbsorptionMarkdown(result, scopedWorkspace),
    rawContent: rawSourceText(scopedWorkspace),
    url: workspace.video.canonicalUrl || workspace.video.url,
    filePath: workspace.video.filePath || '',
    author: workspace.video.owner,
    metadata: {
      ...baseMetadata(result, scopedWorkspace, tags, folderPath),
      folderPath,
      tags,
      wing: 'openbasaka',
      hall: 'system-absorption',
      room: 'prompt-patches',
      archiveOnly: false,
      absorptionConfirmed: true,
      absorptionPackage: true,
      systemTransformationPrompt: buildSystemTransformationPrompt(result, scopedWorkspace),
      promptPatches: buildPromptPatches(result, scopedWorkspace),
      reusableAssets: result.openbasakaFusion.reusableAssets,
      integrationSteps: result.openbasakaFusion.integrationSteps,
    },
    mode: 'fast',
  })
  const queueEventId = await requestWikiCompile({
    trigger: 'wanxiang-absorption',
    sourceIds: [source.sourceId],
    drawerIds: [source.drawerId],
    sourceTitle: workspace.video.title,
  }).catch(() => undefined)

  return {
    sourceId: source.sourceId,
    drawerId: source.drawerId,
    queueEventId,
    promptPatchCount: result.openbasakaFusion.promptPatches.length,
  }
}

export async function archiveWanxiangResult(result: WanxiangLearningResult, workspace: BiliVideoWorkspace): Promise<WanxiangArchiveResult> {
  const scopedWorkspace = workspaceWithResult(workspace, result)
  const sourceType = mapWanxiangSourceType(scopedWorkspace)
  const folderPath = result.openbasakaFusion.folderPath || '知识+大佬/万象学习'
  const tags = buildTags(result, scopedWorkspace, ['归档三结果'])
  const source = await ingestWanxiangSource({
    sourceType,
    title: workspace.video.title,
    content: buildWanxiangArchiveMarkdown(result, scopedWorkspace),
    rawContent: rawSourceText(scopedWorkspace),
    url: workspace.video.canonicalUrl || workspace.video.url,
    filePath: workspace.video.filePath || '',
    author: workspace.video.owner,
    metadata: {
      ...baseMetadata(result, scopedWorkspace, tags, folderPath),
      folderPath,
      tags,
      wing: 'knowledge',
      hall: 'wanxiang-learning',
      room: 'archive',
      archiveOnly: true,
      absorptionConfirmed: false,
      sourceType,
    },
    mode: 'fast',
  })
  const queueEventId = await requestWikiCompile({
    trigger: 'wanxiang-archive',
    sourceIds: [source.sourceId],
    drawerIds: [source.drawerId],
    sourceTitle: workspace.video.title,
  }).catch(() => undefined)

  return {
    sourceId: source.sourceId,
    drawerId: source.drawerId,
    queueEventId,
  }
}

function parseJsonObject<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value || '{}') as T
  } catch {
    return fallback
  }
}

function rowToCapability(row: {
  id: string
  title: string
  metadata_json: string
}): WanxiangAbsorbedCapability | null {
  const metadata = parseJsonObject<Record<string, unknown>>(row.metadata_json, {})
  if (metadata.wanxiangLearning !== true || metadata.absorptionConfirmed !== true) return null
  const fusion = metadata.openbasakaFusion && typeof metadata.openbasakaFusion === 'object'
    ? (metadata.openbasakaFusion as Record<string, unknown>)
    : {}
  return {
    sourceId: row.id,
    title: row.title,
    absorptionScore: Number(fusion.absorptionScore) || 0,
    absorptionVerdict: safeText(fusion.absorptionVerdict, 'absorb'),
    targetSubsystems: Array.isArray(fusion.targetSubsystems) ? (fusion.targetSubsystems as string[]) : [],
    systemTransformationPrompt: safeText(metadata.systemTransformationPrompt),
    promptPatches: Array.isArray(metadata.promptPatches) ? (metadata.promptPatches as OpenbasakaFusionResult['promptPatches']) : [],
    reusableAssets: Array.isArray(metadata.reusableAssets) ? (metadata.reusableAssets as OpenbasakaFusionResult['reusableAssets']) : [],
  }
}

export async function loadWanxiangAbsorptionIndex(limit = 5): Promise<WanxiangAbsorbedCapability[]> {
  const rows = await query<{ id: string; title: string; metadata_json: string }>(
    `SELECT id, title, metadata_json
       FROM wiki_sources
      WHERE metadata_json LIKE '%"wanxiangLearning":true%'
        AND metadata_json LIKE '%"absorptionConfirmed":true%'
      ORDER BY created_at DESC
      LIMIT ?`,
    [limit],
  ).catch(() => [])
  return rows.map(rowToCapability).filter(Boolean) as WanxiangAbsorbedCapability[]
}

export async function searchWanxiangAbsorbedCapabilities(keywords: string[], limit = 5): Promise<WanxiangAbsorbedCapability[]> {
  const terms = keywords.map((item) => safeText(item)).filter(Boolean).slice(0, 5)
  if (terms.length === 0) return []
  const conditions = terms.map(() => '(title LIKE ? OR content LIKE ? OR metadata_json LIKE ?)')
  const params = terms.flatMap((term) => [`%${term}%`, `%${term}%`, `%${term}%`])
  const rows = await query<{ id: string; title: string; metadata_json: string }>(
    `SELECT id, title, metadata_json
       FROM wiki_sources
      WHERE metadata_json LIKE '%"wanxiangLearning":true%'
        AND metadata_json LIKE '%"absorptionConfirmed":true%'
        AND (${conditions.join(' OR ')})
      ORDER BY created_at DESC
      LIMIT ?`,
    [...params, limit],
  ).catch(() => [])
  return rows.map(rowToCapability).filter(Boolean) as WanxiangAbsorbedCapability[]
}
