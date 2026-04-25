/**
 * PRD 深度解析引擎
 * 输入：原始 PRD 文本 → 输出：结构化项目数据
 */
import { chatCompletion, LLMConfig, ChatMessage } from './provider'
import { PROMPTS } from './prompts'

export interface ParsedPRD {
  title: string
  oneLiner: string
  targetAudience: string
  painPoint: string
  businessModel: string
  techStack: string[]
  competitors: string[]
  uniqueValue: string
  risks: string[]
  tags: string[]
}

/** 从原始文本解析结构化 PRD */
export async function parsePRD(
  config: LLMConfig,
  rawText: string
): Promise<ParsedPRD> {
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: PROMPTS.prdParser },
      {
        role: 'user',
        content: `请解析以下 PRD 文档：\n\n---\n${rawText.slice(0, 8000)}\n---`,
      },
    ]

    const response = await chatCompletion(config, messages, 0.3, 2048)

    // 尝试从响应中提取 JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ParsedPRD
    }
  } catch {
    // LLM 调用失败，使用智能 fallback
  }

  return fallbackParse(rawText)
}

/** 智能 Markdown 结构化 fallback — 无需 LLM 也能提取关键信息 */
function fallbackParse(text: string): ParsedPRD {
  const lines = text.split('\n')

  // 提取标题（第一个 # 标题）
  const titleLine = lines.find(l => /^#{1,2}\s/.test(l.trim()))
  const title = titleLine
    ? titleLine.replace(/^#{1,2}\s*/, '').replace(/[：:].*/, '').trim()
    : '未命名项目'

  // 提取各个段落
  const getSection = (keywords: string[]): string => {
    for (const kw of keywords) {
      const idx = lines.findIndex(l =>
        l.toLowerCase().includes(kw.toLowerCase())
      )
      if (idx >= 0) {
        const content: string[] = []
        for (let i = idx + 1; i < lines.length && i < idx + 5; i++) {
          const line = lines[i].replace(/^[-*•]\s*/, '').trim()
          if (line && !line.startsWith('#')) content.push(line)
          else if (line.startsWith('#')) break
        }
        if (content.length) return content.join('；')
        // 检查同行内容
        const sameLine = lines[idx].split(/[：:]/)[1]?.trim()
        if (sameLine) return sameLine
      }
    }
    return '未明确'
  }

  const getList = (keywords: string[]): string[] => {
    for (const kw of keywords) {
      const idx = lines.findIndex(l =>
        l.toLowerCase().includes(kw.toLowerCase())
      )
      if (idx >= 0) {
        const items: string[] = []
        // 检查同行的逗号分隔列表
        const sameLine = lines[idx].split(/[：:]/)[1]?.trim()
        if (sameLine) {
          items.push(...sameLine.split(/[,，、]/).map(s => s.trim()).filter(Boolean))
        }
        // 检查后续行的列表项
        for (let i = idx + 1; i < lines.length && i < idx + 8; i++) {
          const line = lines[i].replace(/^[-*•]\s*/, '').trim()
          if (line && !line.startsWith('#')) items.push(line)
          else if (line.startsWith('#')) break
        }
        if (items.length) return items.slice(0, 6)
      }
    }
    return []
  }

  return {
    title,
    oneLiner: getSection(['一句话', '定位', 'slogan', '简介']),
    targetAudience: getSection(['目标用户', '受众', 'target', '用户群']),
    painPoint: getSection(['痛点', '问题', 'pain', '需求']),
    businessModel: getSection(['商业模式', '盈利', 'business', '变现']),
    techStack: getList(['技术栈', 'tech', '技术方案', '架构']),
    competitors: getList(['竞品', 'competitor', '竞争', '对手']),
    uniqueValue: getSection(['差异化', '独特', 'unique', '优势', '亮点']),
    risks: getList(['风险', 'risk', '挑战', '威胁']),
    tags: [title.slice(0, 4)],
  }
}

