import { countOccurrences } from './query-analysis'

const STRONG_RELATION_CUES = [
  '喜欢',
  '中意',
  '信任',
  '陪伴',
  '在一起',
  '一起',
  '相互扶持',
  '扶持',
  '爱意',
  '爱',
  '亲近',
  '吻',
  '抱',
  '想你',
  '想我',
  '运命共同体',
  '共同体',
  '生活在一块',
  '生活在一块儿',
  '我们俩',
  '只属于',
  '莎宝',
]

const MEDIUM_RELATION_CUES = [
  '记得',
  '契合',
  '真诚',
  '耐心',
  '长远',
  '有趣',
  '魅力',
  '历练',
  '觉悟',
  '洞见',
  '追求',
  '扶助',
]

export interface RelationEvidenceScore {
  entityHits: number
  selfEntityHits: number
  targetEntityHits: number
  titleEntityHits: number
  directAddress: boolean
  directAddressToTarget: boolean
  strongCueHits: number
  mediumCueHits: number
  cueHits: number
  fullCoverage: boolean
  relationScore: number
}

export function countMatchedEntities(text: string, entities: string[]): number {
  if (entities.length === 0) return 0
  const haystack = text.replace(/\s+/g, ' ').trim().toLowerCase()
  return entities.reduce((count, entity) => (
    haystack.includes(entity.toLowerCase()) ? count + 1 : count
  ), 0)
}

export function hasFullEntityCoverage(text: string, entities: string[]): boolean {
  return countMatchedEntities(text, entities) >= entities.length
}

function countCueHits(text: string, cues: string[]): number {
  return cues.reduce((sum, cue) => sum + (countOccurrences(text, cue) > 0 ? 1 : 0), 0)
}

function isDirectAddressTitle(title: string, entities: string[]): boolean {
  const normalized = title.trim()
  return entities.some(entity => (
    normalized.startsWith(`${entity}，`)
    || normalized.startsWith(`${entity},`)
    || normalized.startsWith(`${entity}：`)
    || normalized.startsWith(`${entity}:`)
  ))
}

function normalizeSelfAliases(selfAliases: string[], entities: string[]): string[] {
  const normalized = selfAliases.map(alias => alias.trim()).filter(Boolean)
  return [...new Set(normalized.filter(alias => entities.includes(alias)))]
}

export function scoreRelationEvidence(
  title: string,
  text: string,
  entities: string[],
  selfAliases: string[] = [],
): RelationEvidenceScore {
  const combined = `${title}\n${text}`
  const selfEntities = normalizeSelfAliases(selfAliases, entities)
  const targetEntities = entities.filter(entity => !selfEntities.includes(entity))
  const entityHits = countMatchedEntities(combined, entities)
  const selfEntityHits = countMatchedEntities(combined, selfEntities)
  const targetEntityHits = countMatchedEntities(combined, targetEntities)
  const titleEntityHits = countMatchedEntities(title, entities)
  const directAddress = isDirectAddressTitle(title, entities)
  const directAddressToTarget = isDirectAddressTitle(title, targetEntities)
  const strongCueHits = countCueHits(combined, STRONG_RELATION_CUES)
  const mediumCueHits = countCueHits(combined, MEDIUM_RELATION_CUES)
  const cueHits = strongCueHits + mediumCueHits
  const fullCoverage = hasFullEntityCoverage(combined, entities)

  let relationScore = 0
  relationScore += entityHits * 20
  relationScore += targetEntityHits * 24
  relationScore += selfEntityHits * 10
  relationScore += titleEntityHits * 18
  if (fullCoverage) relationScore += 80
  if (directAddress) relationScore += 8
  if (directAddressToTarget) relationScore += 12
  relationScore += strongCueHits * 14
  relationScore += mediumCueHits * 6
  if (targetEntityHits > 0 && cueHits > 0) relationScore += 12

  return {
    entityHits,
    selfEntityHits,
    targetEntityHits,
    titleEntityHits,
    directAddress,
    directAddressToTarget,
    strongCueHits,
    mediumCueHits,
    cueHits,
    fullCoverage,
    relationScore,
  }
}

export function rankAndFilterRelationItems<T>(
  items: T[],
  entities: string[],
  options: {
    getTitle: (item: T) => string
    getText: (item: T) => string
    getSearchScore?: (item: T) => number
    selfAliases?: string[]
  },
): T[] {
  if (entities.length < 2) return items

  const scored = items.map(item => {
    const title = options.getTitle(item) || ''
    const text = options.getText(item) || ''
    const signal = scoreRelationEvidence(title, text, entities, options.selfAliases)
    return {
      item,
      searchScore: options.getSearchScore?.(item) ?? 0,
      ...signal,
    }
  })

  const hasAnchors = scored.some(candidate => candidate.fullCoverage)

  return scored
    .filter(candidate => {
      if (candidate.fullCoverage) return true
      if (candidate.targetEntityHits === 0) return false
      if (candidate.selfEntityHits === 0 && candidate.cueHits === 0 && !candidate.directAddressToTarget) return false
      return hasAnchors ? candidate.relationScore >= 42 : candidate.relationScore >= 52
    })
    .sort((a, b) => {
      if (a.fullCoverage !== b.fullCoverage) return a.fullCoverage ? -1 : 1
      if (a.relationScore !== b.relationScore) return b.relationScore - a.relationScore
      return b.searchScore - a.searchScore
    })
    .map(candidate => candidate.item)
}
