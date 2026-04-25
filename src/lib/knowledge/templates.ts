/**
 * Wiki 捕获模板 — 内置模板定义 + CRUD
 *
 * 模板定义来源内容的结构化格式，
 * 参考 Obsidian Web Clipper 的模板系统
 */
import { query, run } from '../db/repository'
import { generateId } from '../db/schema'

// ─── 接口 ───

export interface WikiTemplate {
  id: string
  name: string
  nameEn: string
  icon: string
  description: string
  frontmatterSchema: Record<string, unknown>
  contentTemplate: string
  category: string
  isBuiltin: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// ─── 内置模板定义 ───

const BUILTIN_TEMPLATES: Array<Omit<WikiTemplate, 'id' | 'createdAt' | 'updatedAt'>> = [
  {
    name: '文章',
    nameEn: 'Article',
    icon: '📄',
    description: '网页文章、博客、新闻',
    category: 'general',
    isBuiltin: true,
    sortOrder: 0,
    frontmatterSchema: {
      title: { type: 'string', required: true },
      author: { type: 'string' },
      url: { type: 'string' },
      date_published: { type: 'string' },
      tags: { type: 'array', items: 'string' },
    },
    contentTemplate: `# {{title}}

> 作者: {{author}} | 来源: {{url}} | 日期: {{date_published}}

## 摘要

{{summary}}

## 正文

{{content}}

## 关键要点

{{key_points}}`,
  },
  {
    name: '研究论文',
    nameEn: 'Research Paper',
    icon: '🎓',
    description: '学术论文、研究报告',
    category: 'academic',
    isBuiltin: true,
    sortOrder: 1,
    frontmatterSchema: {
      title: { type: 'string', required: true },
      authors: { type: 'string' },
      doi: { type: 'string' },
      year: { type: 'string' },
      abstract: { type: 'string' },
    },
    contentTemplate: `# {{title}}

**作者**: {{authors}} | **年份**: {{year}} | **DOI**: {{doi}}

## 摘要

{{abstract}}

## 研究方法

{{methodology}}

## 主要发现

{{findings}}

## 对我的意义

{{significance}}`,
  },
  {
    name: '代码参考',
    nameEn: 'Code Reference',
    icon: '💻',
    description: '代码片段、API 文档、技术参考',
    category: 'tech',
    isBuiltin: true,
    sortOrder: 2,
    frontmatterSchema: {
      title: { type: 'string', required: true },
      language: { type: 'string' },
      library: { type: 'string' },
      version: { type: 'string' },
      api_type: { type: 'string' },
    },
    contentTemplate: `# {{title}}

**语言**: {{language}} | **库**: {{library}} | **版本**: {{version}}

## 用途

{{purpose}}

## 代码

\`\`\`{{language}}
{{code}}
\`\`\`

## 说明

{{explanation}}

## 注意事项

{{caveats}}`,
  },
  {
    name: '概念',
    nameEn: 'Concept',
    icon: '💡',
    description: '概念解释、术语定义、知识条目',
    category: 'concept',
    isBuiltin: true,
    sortOrder: 3,
    frontmatterSchema: {
      title: { type: 'string', required: true },
      domain: { type: 'string' },
      difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
      related_concepts: { type: 'array', items: 'string' },
    },
    contentTemplate: `# {{title}}

**领域**: {{domain}} | **难度**: {{difficulty}}

## 定义

{{definition}}

## 核心原理

{{principles}}

## 应用场景

{{applications}}

## 相关概念

{{related_concepts}}`,
  },
  {
    name: '决策记录',
    nameEn: 'Decision Record',
    icon: '⚖️',
    description: '技术决策、架构选择的记录',
    category: 'decision',
    isBuiltin: true,
    sortOrder: 4,
    frontmatterSchema: {
      title: { type: 'string', required: true },
      context: { type: 'string' },
      alternatives: { type: 'array', items: 'string' },
      chosen: { type: 'string' },
      rationale: { type: 'string' },
    },
    contentTemplate: `# {{title}}

## 背景

{{context}}

## 候选方案

{{alternatives}}

## 选择

**{{chosen}}**

## 理由

{{rationale}}

## 影响

{{impact}}`,
  },
  {
    name: '学习笔记',
    nameEn: 'Learning Note',
    icon: '📖',
    description: '学习过程记录、课程笔记',
    category: 'learning',
    isBuiltin: true,
    sortOrder: 5,
    frontmatterSchema: {
      title: { type: 'string', required: true },
      source: { type: 'string' },
      topic: { type: 'string' },
      mastery_level: { type: 'string', enum: ['novice', 'learning', 'competent', 'proficient', 'expert'] },
    },
    contentTemplate: `# {{title}}

**来源**: {{source}} | **主题**: {{topic}} | **掌握程度**: {{mastery_level}}

## 关键知识点

{{key_points}}

## 我的理解

{{my_understanding}}

## 待深入

{{open_questions}}`,
  },
  {
    name: '对话摘要',
    nameEn: 'Conversation Summary',
    icon: '💬',
    description: 'AI 对话自动生成的摘要',
    category: 'auto',
    isBuiltin: true,
    sortOrder: 6,
    frontmatterSchema: {
      title: { type: 'string', required: true },
      participants: { type: 'string' },
      date: { type: 'string' },
      topics: { type: 'array', items: 'string' },
    },
    contentTemplate: `# {{title}}

**参与者**: {{participants}} | **日期**: {{date}}

## 讨论要点

{{topics}}

## 关键结论

{{conclusions}}

## 后续行动

{{action_items}}`,
  },
]

// ─── 初始化内置模板 ───

/** 初始化内置模板（幂等） */
export async function initBuiltinTemplates(): Promise<void> {
  for (const tmpl of BUILTIN_TEMPLATES) {
    await run(
      `INSERT OR IGNORE INTO wiki_templates (id, name, name_en, icon, description, frontmatter_schema, content_template, category, is_builtin, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `tmpl_builtin_${tmpl.nameEn.toLowerCase().replace(/\s+/g, '_')}`,
        tmpl.name,
        tmpl.nameEn,
        tmpl.icon,
        tmpl.description,
        JSON.stringify(tmpl.frontmatterSchema),
        tmpl.contentTemplate,
        tmpl.category,
        tmpl.isBuiltin ? 1 : 0,
        tmpl.sortOrder,
      ]
    )
  }
}

// ─── CRUD ───

/** 获取所有模板 */
export async function getAllTemplates(): Promise<WikiTemplate[]> {
  await initBuiltinTemplates()
  const rows = await query<{
    id: string; name: string; name_en: string; icon: string;
    description: string; frontmatter_schema: string; content_template: string;
    category: string; is_builtin: number; sort_order: number;
    created_at: string; updated_at: string
  }>('SELECT * FROM wiki_templates ORDER BY sort_order, name')

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    nameEn: r.name_en,
    icon: r.icon,
    description: r.description,
    frontmatterSchema: JSON.parse(r.frontmatter_schema || '{}'),
    contentTemplate: r.content_template,
    category: r.category,
    isBuiltin: !!r.is_builtin,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

/** 按 ID 获取模板 */
export async function getTemplateById(id: string): Promise<WikiTemplate | undefined> {
  await initBuiltinTemplates()
  const rows = await query<{
    id: string; name: string; name_en: string; icon: string;
    description: string; frontmatter_schema: string; content_template: string;
    category: string; is_builtin: number; sort_order: number;
    created_at: string; updated_at: string
  }>('SELECT * FROM wiki_templates WHERE id = ?', [id])

  if (rows.length === 0) return undefined
  const r = rows[0]
  return {
    id: r.id,
    name: r.name,
    nameEn: r.name_en,
    icon: r.icon,
    description: r.description,
    frontmatterSchema: JSON.parse(r.frontmatter_schema || '{}'),
    contentTemplate: r.content_template,
    category: r.category,
    isBuiltin: !!r.is_builtin,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** 创建自定义模板 */
export async function createTemplate(t: Partial<WikiTemplate>): Promise<string> {
  const id = generateId()
  await run(
    `INSERT INTO wiki_templates (id, name, name_en, icon, description, frontmatter_schema, content_template, category, is_builtin, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      id,
      t.name || '新模板',
      t.nameEn || '',
      t.icon || '📄',
      t.description || '',
      JSON.stringify(t.frontmatterSchema || {}),
      t.contentTemplate || '',
      t.category || 'general',
      t.sortOrder || 99,
    ]
  )
  return id
}

/** 更新模板 */
export async function updateTemplate(id: string, updates: Partial<WikiTemplate>): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = []

  if (updates.name !== undefined) { sets.push('name = ?'); params.push(updates.name) }
  if (updates.nameEn !== undefined) { sets.push('name_en = ?'); params.push(updates.nameEn) }
  if (updates.icon !== undefined) { sets.push('icon = ?'); params.push(updates.icon) }
  if (updates.description !== undefined) { sets.push('description = ?'); params.push(updates.description) }
  if (updates.frontmatterSchema !== undefined) { sets.push('frontmatter_schema = ?'); params.push(JSON.stringify(updates.frontmatterSchema)) }
  if (updates.contentTemplate !== undefined) { sets.push('content_template = ?'); params.push(updates.contentTemplate) }
  if (updates.category !== undefined) { sets.push('category = ?'); params.push(updates.category) }
  if (updates.sortOrder !== undefined) { sets.push('sort_order = ?'); params.push(updates.sortOrder) }

  if (sets.length === 0) return
  sets.push("updated_at = datetime('now','localtime')")
  params.push(id)
  await run(`UPDATE wiki_templates SET ${sets.join(', ')} WHERE id = ?`, params)
}

/** 删除模板（不允许删除内置） */
export async function deleteTemplate(id: string): Promise<boolean> {
  const existing = await query<{ is_builtin: number }>('SELECT is_builtin FROM wiki_templates WHERE id = ?', [id])
  if (existing.length > 0 && existing[0].is_builtin) return false
  await run('DELETE FROM wiki_templates WHERE id = ?', [id])
  return true
}

/** 渲染模板 — 替换 {{placeholder}} */
export function renderTemplate(template: WikiTemplate, data: Record<string, string>): string {
  let result = template.contentTemplate
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '')
  }
  // 清除未替换的占位符
  result = result.replace(/\{\{[^}]+\}\}/g, '')
  return result
}
