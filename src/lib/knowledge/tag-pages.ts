import {
  createPage,
  generateSlug,
  getAllPagesUnbounded,
  getAllSourcesUnbounded,
  getPageByTitle,
  updatePage,
  type WikiPage,
  type WikiSource,
} from './wiki'

export const TAG_PAGE_FOLDER = '知识标签'

export function normalizeKnowledgeTag(tag: string): string {
  return tag
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

export function parseKnowledgeTagsText(value: string): string[] {
  return uniqueStrings(value.split(/[,，、\n#]+/).map(normalizeKnowledgeTag))
}

export async function ensureTagPagesForKnowledgeTags(tags: string[]): Promise<string[]> {
  const normalizedTags = uniqueStrings(tags.map(normalizeKnowledgeTag)).filter((tag) => !isSystemTag(tag))
  if (normalizedTags.length === 0) return []

  const [pages, sources] = await Promise.all([getAllPagesUnbounded(500), getAllSourcesUnbounded(500)])
  const changedPageIds: string[] = []

  for (const tag of normalizedTags) {
    const tagTitle = buildTagPageTitle(tag)
    const relatedPages = pages.filter((page) => page.title !== tagTitle && hasTag(page.tags, tag)).slice(0, 30)
    const relatedSources = sources.filter((source) => hasTag(source.tags, tag)).slice(0, 40)
    const content = buildTagPageContent(tag, relatedPages, relatedSources)
    const summary = `自动整理「${tag}」标签下的 Wiki 页面与原始来源。`
    const existing = await getPageByTitle(tagTitle)

    if (existing) {
      await updatePage(existing.id, {
        content,
        summary,
        category: 'tag',
        tags: uniqueStrings(['tag-index', tag, ...(existing.tags || [])]),
        folderPath: TAG_PAGE_FOLDER,
        metadata: {
          ...(existing.metadata || {}),
          tagPage: true,
          tag,
          relatedPageCount: relatedPages.length,
          relatedSourceCount: relatedSources.length,
        },
      })
      changedPageIds.push(existing.id)
    } else {
      const id = await createPage({
        title: tagTitle,
        slug: generateSlug(tagTitle),
        content,
        summary,
        category: 'tag',
        tags: ['tag-index', tag],
        folderPath: TAG_PAGE_FOLDER,
        importance: 62,
        confidence: 0.9,
        metadata: {
          tagPage: true,
          tag,
          relatedPageCount: relatedPages.length,
          relatedSourceCount: relatedSources.length,
        },
      })
      changedPageIds.push(id)
    }
  }

  return changedPageIds
}

function buildTagPageTitle(tag: string): string {
  return `标签：${tag}`
}

function buildTagPageContent(tag: string, pages: WikiPage[], sources: WikiSource[]): string {
  const pageLines =
    pages.length > 0
      ? pages.map((page) => `- [[${page.title}]]${page.summary ? `：${page.summary.slice(0, 80)}` : ''}`)
      : ['- 暂无已编译 Wiki 页面']

  const sourceLines =
    sources.length > 0
      ? sources.map((source) => {
          const name = source.title || source.filePath || source.url || source.id
          const location = source.url || source.filePath || source.folderPath || source.sourceType
          return `- ${name}${location ? ` ｜ ${location}` : ''}`
        })
      : ['- 暂无原始来源']

  return `# ${tag}

> 这是知识库自动维护的标签专题页。给页面或来源加上「${tag}」标签后，它会出现在这里。

## Wiki 页面

${pageLines.join('\n')}

## 原始来源

${sourceLines.join('\n')}

## 使用方式

- 把相关内容继续标记为「${tag}」
- 从这里进入相关页面，继续拆分成更小的概念、项目或大佬技能
`
}

function hasTag(tags: string[], tag: string): boolean {
  const normalizedTag = normalizeKnowledgeTag(tag).toLowerCase()
  return tags.some((item) => normalizeKnowledgeTag(item).toLowerCase() === normalizedTag)
}

function isSystemTag(tag: string): boolean {
  return ['tag-index', 'auto-archived', 'qa'].includes(tag.toLowerCase())
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = value.trim()
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}
