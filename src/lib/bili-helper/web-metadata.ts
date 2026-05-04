export interface FetchedUrlMetadata {
  title: string
  content: string
  author: string
  description: string
  url: string
  cover: string
  siteName: string
  canonicalUrl: string
  favicon: string
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
}

function textFromHtml(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
  text = text.replace(/<[^>]+>/g, ' ')
  return decodeHtmlEntities(text).replace(/\s+/g, ' ').trim().slice(0, 50000)
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRegex = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
  let match: RegExpExecArray | null
  while ((match = attrRegex.exec(tag))) {
    attrs[match[1].toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '').trim()
  }
  return attrs
}

function resolveUrl(value: string, baseUrl: string): string {
  if (!value) return ''
  try {
    return new URL(value, baseUrl).href
  } catch {
    return ''
  }
}

function titleFromHtml(html: string, fallbackUrl: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return decodeHtmlEntities(match?.[1] || '').replace(/\s+/g, ' ').trim() || fallbackUrl
}

function firstMeta(meta: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = meta[key.toLowerCase()]
    if (value) return value
  }
  return ''
}

export function extractFetchedUrlMetadata(html: string, url: string): FetchedUrlMetadata {
  const meta: Record<string, string> = {}
  const links: Array<Record<string, string>> = []
  const metaTags = html.match(/<meta\b[^>]*>/gi) || []
  const linkTags = html.match(/<link\b[^>]*>/gi) || []

  for (const tag of metaTags) {
    const attrs = parseAttributes(tag)
    const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase()
    if (key && attrs.content && !meta[key]) meta[key] = attrs.content
  }

  for (const tag of linkTags) {
    links.push(parseAttributes(tag))
  }

  const canonicalUrl = resolveUrl(
    links.find((link) => /\bcanonical\b/i.test(link.rel || ''))?.href || '',
    url,
  )
  const imageSrc = links.find((link) => /\bimage_src\b/i.test(link.rel || ''))?.href || ''
  const appleIcon = links.find((link) => /\bapple-touch-icon\b/i.test(link.rel || ''))?.href || ''
  const icon = links.find((link) => /\b(icon|shortcut icon)\b/i.test(link.rel || ''))?.href || ''
  const cover = resolveUrl(firstMeta(meta, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']) || imageSrc, url)
  const favicon = resolveUrl(appleIcon || icon || '/favicon.ico', url)
  const description = firstMeta(meta, ['description', 'og:description', 'twitter:description'])
  const siteName = firstMeta(meta, ['og:site_name', 'application-name'])
  const author = firstMeta(meta, ['author', 'article:author', 'twitter:creator'])
  const title = firstMeta(meta, ['og:title', 'twitter:title']) || titleFromHtml(html, url)

  return {
    title: title.replace(/\s+/g, ' ').trim(),
    content: textFromHtml(html),
    author,
    description,
    url,
    cover: cover || favicon,
    siteName,
    canonicalUrl: canonicalUrl || url,
    favicon,
  }
}
