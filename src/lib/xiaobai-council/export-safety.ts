const GENERIC_TITLE_PATTERNS = [
  /小白智囊团/,
  /本地\s*Nuwa/,
  /大师共识\s*PRD/,
  /方法论共识/,
  /未命名/,
]

export function redactSensitiveText(value: string): string {
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, '$1[REDACTED]')
    .replace(/(sk-)[A-Za-z0-9_-]{16,}/g, '$1[REDACTED]')
    .replace(/\b[A-Za-z0-9]{20,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_API_KEY]')
    .replace(
      /((?:deepseek|glm|zhipu|openai|api[-_\s]?key|apikey|secret|token|密钥|key)[^：:=\n]{0,32}[：:=]\s*)([^\s\n]+)/gi,
      '$1[REDACTED]',
    )
}

function cleanTitle(value: string): string {
  return redactSensitiveText(value)
    .replace(/^#+\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/[「」"'“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isUsableTitle(value: string): boolean {
  const title = cleanTitle(value)
  if (title.length < 4 || title.length > 42) return false
  return !GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(title))
}

function headingTitle(markdown: string): string {
  const headings = markdown.match(/^#\s+.+$/gm) || []
  for (const heading of headings) {
    const title = cleanTitle(heading)
    if (isUsableTitle(title)) return title.split(/[｜|]/)[0].trim()
  }
  return ''
}

export function deriveCouncilProjectTitle(problem: string, finalPrd = ''): string {
  const prdTitle = headingTitle(finalPrd)
  if (prdTitle) return prdTitle

  const source = `${problem}\n${finalPrd}`
  if (/女性|女生|女孩|girl|woman|women/i.test(source) && /天气|晴雨|weather/i.test(source) && /包包|包里|出门|外出|bag/i.test(source)) {
    return '包里晴雨签 iOS App'
  }
  if (/soul\.md|mempalace|记忆宫殿|几千篇|文章|自我蒸馏|最了解我|认知、感知|认知感知/i.test(source)) {
    return 'Soul.md 记忆宫殿 Mac App'
  }
  if (/PRD|产品需求|需求文档/i.test(problem) && /小白|智囊团|agent|智能体/i.test(problem)) {
    return '小白智囊团 PRD 引擎'
  }
  if (/Mac|macOS|桌面端/i.test(source) && /app|应用/i.test(source)) return 'OpenBasaka Mac App'
  if (/iOS|iphone/i.test(source) && /app|应用/i.test(source)) return 'OpenBasaka iOS App'
  return 'OpenBasaka 项目共识 PRD'
}

export function sanitizeCouncilFileBaseName(value: string): string {
  const cleaned = cleanTitle(value)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[^\p{L}\p{N}._ -]+/gu, '')
    .replace(/\s+/g, '_')
    .slice(0, 48)
  return cleaned || 'OpenBasaka_PRD'
}
