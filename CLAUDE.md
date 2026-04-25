# Project Instructions — Openbasaka / 项目的游戏

## 1. 项目身份

这是一个 Electron (41) + React 19 + TypeScript 6 + Vite 8 + better-sqlite3 的
本地桌面 AI 操作系统。代号：Openbasaka / Game of Projects。

核心技术约束：
- 样式：Vanilla CSS (CSS Variables)，禁止 Tailwind
- 状态管理：React useState/useReducer，XiaoBai 模块可用 Zustand
- 数据库：better-sqlite3 WAL 模式，同步 API
- AI：provider.ts 统一入口，所有 LLM 请求必须走 Electron IPC 绕 CORS
- 设计：Hermes Dark 设计系统 (tokens.css + animations.css)
- 窗口：Ghost (520x780 悬浮) + Sandbox (1400x900 全屏)

## 2. 自主执行规则

### 两次确认，然后放飞
1. **方向确认** — 简述思路和技术选型，等确认
2. **计划确认** — 生成 implementation_plan.md，等批准
3. **确认后完全自动** — 不停不问，一路到底
4. **卡住了就换路** — 3分钟解决不了就切方案
5. **简单任务直接做** — 改bug、调配置、回答问题不走流程

## 3. 架构关键路径

### 核心数据流
```
用户输入 → Openbasaka.tsx → context.ts (上下文组装)
  → knowledge-middleware.ts (RAG 注入)
  → router.ts (Agent 路由)
  → tool-loop.ts (ReAct 循环，最多5轮)
  → provider.ts (走 Electron IPC → main process → 厂商API)
  → 流式回显
```

### 三大核心系统

#### Hermes Agent 架构（底层）
系统基于 Hermes Agent (nousresearch.com/hermes-agent) 架构构建：
- `tool-loop.ts` → ReAct 循环（Think → Act → Observe）
- `skills/evolution.ts` → 技能自动进化（使用率+成功率→LLM优化prompt）
- `self-nudge.ts` → 自我知识持久化（对话后自动提取经验→MemPalace）
- `knowledge-graph.ts` → 三元组知识图谱 + 社区检测
- `personality.ts` → 人格切换系统（default/creative/analyst/mentor/challenger）
- `cron-engine.ts` → 定时自主任务（wiki-compile/memory-decay/lint）

#### MemPalace 记忆宫殿（记忆层）
完全移植自 mempalace 项目，三层架构：
- **Wing (翼楼)**: experience / knowledge / insight / identity / emotion / default
- **Hall (大厅)**: Wing 内的子分类
- **Drawer (抽屉)**: 无损原始记忆条目（mempalace_drawers 表）
- 核心文件: `mempalace.ts` (统一入口) / `wake-up.ts` (上下文加载) / `drawer.ts` (CRUD)
- 旧的 memory_rooms/memory_items 表保留但不再主用

#### Karpathy 知识库（知识层）
严格遵循 Karpathy 工作流（Obsidian + Claude Code）：
- **Clippings (生肉)**: `mempalace_drawers` — 零LLM，逐字保留原始内容
- **Wiki (结晶)**: `wiki_pages` — LLM 异步编译，[[双链]] + ^[Drawer:ID] 溯源锚点
- **Outputs (产出)**: `outputs.ts` — 高质量Q&A 自动存档为 Wiki 页面
- **INDEX.md**: 每次编译后自动重建，按 category 分组索引

### 关键文件清单
| 文件 | 角色 | 行数 |
|------|------|------|
| `electron/main/index.ts` | IPC 总线 | ~915 |
| `src/lib/ai/provider.ts` | LLM 抽象层 | ~562 |
| `src/lib/ai/personality.ts` | 人格切换系统 | ~160 |
| `src/lib/chat/context.ts` | Prompt 组装 | ~500 |
| `src/lib/chat/tool-loop.ts` | ReAct 循环 | ~189 |
| `src/lib/db/schema.ts` | 数据库DDL | ~800 |
| `src/lib/memory/mempalace.ts` | MemPalace 统一入口 | ~250 |
| `src/lib/memory/wake-up.ts` | 记忆唤醒加载器 | ~120 |
| `src/lib/knowledge/drawer.ts` | 无损抽屉 CRUD | ~309 |
| `src/lib/knowledge/wiki-compiler.ts` | Karpathy 编译器 | ~420 |
| `src/lib/knowledge/outputs.ts` | 问答存档层 | ~120 |
| `src/lib/memory/knowledge-graph.ts` | 图谱核心 | ~500 |
| `src/lib/synapse/swarm.ts` | 群体智能 | ~600 |

### 巨型组件注意
以下文件体积较大，修改时注意精确定位：
- ControlPanelTab.tsx — 枢纽控制面板
- KnowledgeVaultTab.tsx — 知识库投喂舱
- TeamsTab.tsx — Agent 团队管理
- XiaoBaiTab.tsx — 小白 AI 助手

## 4. Karpathy WIKI 规则

### 直读原则
AI 回答问题时，**优先直接读取 Wiki 页面内容**，而非使用复杂的 RAG pipeline。
读取优先级：INDEX.md → 相关 Wiki 页面 → FTS5 搜索 → 向量搜索

### 知识库结构
```
Clippings (mempalace_drawers)  → 生肉，零LLM处理
Wiki (wiki_pages)              → 结晶，LLM 编译
Outputs (wiki_activity_log)    → 产出，Q&A 存档
INDEX.md (wiki_pages is_index) → 目录，自动重建
```

### 编辑规则
- 每个 Wiki 页面必须包含 `^[Drawer:ID]` 溯源锚点
- 使用 `[[页面名称]]` 进行双向链接
- INDEX.md 由系统在每次编译后自动重建，禁止手动编辑
- 高质量 Q&A (quality >= 4) 自动归档为 output 类型 Wiki 页面

## 5. 代码风格

```typescript
// ✅ 正确：中文注释 + JSDoc + 显式类型
/** 计算项目生存概率 */
function calcSurvivalRate(project: Project): number {
  // 基于多维度雷达加权
  return weightedAvg(project.radar)
}

// ❌ 错误：any 类型、无注释、magic number
function calc(p: any) {
  return p.x * 0.7
}
```

规则：
- 所有导出函数必须有 JSDoc 注释
- 禁止 `any`，必须定义 interface
- 常量提取，禁止 magic number
- 错误处理：catch 中必须记录日志或 re-throw，不能空 catch
- CSS 变量使用 `var(--hd-*)` 系列 Hermes Dark 令牌
- 文件命名：组件 PascalCase，工具函数 kebab-case

## 6. 测试要求

- 测试框架：Vitest
- 每次修改核心逻辑（lib/下的.ts文件）后，补充对应测试
- 运行 `npm run typecheck` 确保无类型错误
- 运行 `npm run test` 确保测试通过

## 7. Git 提交规范

```
feat(知识库): 添加 PDF 直接拖拽导入
fix(provider): GLM 流式解析漏字问题
refactor(sandbox): ControlPanelTab 拆分子组件
test(tool-loop): 补充 ReAct 循环单元测试
chore: 配置 ESLint + Prettier
```

## 8. 性能红线

- 首屏加载 < 3s（electron 冷启动）
- SQLite 查询 < 100ms（除全文搜索外）
- React 重渲染：列表组件使用 React.memo + useMemo
- 长列表（>100项）使用虚拟滚动

## 9. 安全红线

- API Key 存储：使用 Electron safeStorage 加密
- SQL 查询：所有参数必须用参数化查询（`?` 占位符）
- 命令执行：exec 的 command 限白名单命令
- CSP：渲染进程禁止 eval/inline script

