# 有机智能系统融合计划：Graphify / Hermes / Notes / Openbasaka

审视日期：2026-04-26

目标不是把项目改成另一个 Hermes Agent 或 Graphify，而是在现有 Openbasaka / Game of Projects 基础上，把它推进成更可信、更有韧性、能陪 Boss 持续探索世界的有机智能系统。

参考材料：

- https://www.aivi.fyi/llms/graphify
- https://www.aivi.fyi/llms/hermes-wiki
- https://www.aivi.fyi/llms/hermes-agent-advanced
- 本地参考项目：`/Users/apple/Desktop/【项目的游戏】/hermes-agent`
- Boss 过往笔记：`/Users/apple/Desktop/【项目的游戏】/Notes`

## 1. 当前系统真实状态

### 1.1 代码与工程

- 技术栈是 Electron + React + TypeScript + SQLite，定位明确：本地优先的个人外脑 OS。
- `npm` 在当前 shell 不可用，但用 bundled Node 可直接运行本地工具。
- 已验证：
  - `tools/project-health-check.mjs` 通过。
  - `tsc --noEmit` 通过。
  - `vitest run src/lib/vision/__tests__/alignment.test.ts src/lib/mcp/__tests__/registry.test.ts` 通过，2 个测试文件、11 个测试通过。
- 当前仓库只有 `Notes/` 未跟踪，说明大量个人语料还没有纳入 git 管理。
- 当前机器上有两组 Electron/Vite 进程同时运行同一项目，容易造成重复调度、状态误判和 SQLite 写入竞争。

### 1.2 数据层快照

来自 `~/Library/Application Support/game-of-projects/game-of-projects.db`：

| 数据对象 | 数量 | 判断 |
| --- | ---: | --- |
| projects | 2 | 项目神经元明显不足，且存在一条异常/乱码项目标题 |
| project_taxonomy | 2 | 当前项目已分类，但样本太少 |
| synapses | 0 | 项目突触网络尚未启动 |
| boss_memory | 1752 | Boss 画像燃料很强 |
| wiki_sources | 6602 | Notes 语料大规模进入来源层 |
| wiki_pages | 6482 | Wiki 页面规模已大，但多数还没形成知识网 |
| wiki_chunks | 549 | 分块覆盖不足 |
| wiki_vectors | 0 | 向量层尚未落地 |
| mempalace_drawers | 160 | 记忆宫殿抽屉已成形，但与 6602 sources 不匹配 |
| uncompiled_drawers | 0 | 抽屉自身无积压 |
| custom_agents | 0 | 自定义 Agent 实体未真正使用 |
| agent_memories | 23 | Agent 记忆很薄 |
| teams | 1 | 有团队雏形：创意坊 |
| scheduled_tasks | 6 | 有节律框架，但任务质量需要清洗 |
| operating_events | 0 | 主循环账本已建表，但真实事件尚未开始沉淀 |
| wiki_lint_open | 6434 | 绝大多数页面是孤岛，需要组织和链接修复 |

最关键的矛盾：系统已经吃进了大量材料，但图谱化、可引用、可复盘、可行动的组织层还远远不够。

### 1.3 Notes 语料

- `Notes/MemoMind Markdown Vault/INDEX.md` 显示总计 6787 篇笔记。
- 本地 `find Notes -type f -name '*.md'` 得到 6788 个 Markdown 文件。
- 主体目录结构较扁平：`Notes/Notes` 占 6773 篇。
- 语料中包含大量项目构想、Agent 协作反思、自我认知、技术操作、审美/创作要求，也夹杂敏感 token / key / bot token 类内容，需要进入知识库前做敏感信息隔离与红action。

## 2. 项目优势

### 2.1 北极星正确

项目的主线不是普通聊天工具，而是：

`Boss -> 项目 -> 记忆 -> Wiki 编译 -> Agent 可复用上下文 -> 自动化/复盘/演化`

这个方向与 Boss 的长期表达一致，也已经写入 `docs/愿景对齐与迭代路线图.md`、`src/lib/vision/alignment.ts`、`src/lib/chat/context.ts`。

### 2.2 数据主权强

SQLite + 本地 Electron 的底座非常适合个人外脑：

- 数据可导出、可备份。
- 可以直接读本地 Notes、Wiki、项目、Agent 结果。
- 可接 Telegram 等外部入口，不被单一云产品锁死。

### 2.3 Boss 建模已有真实燃料

`boss_profile` 已有姓名、自我别名、长期愿景、当前焦点、认知画像、画像摘要；`boss_memory` 有 1752 条。这个体量足以支撑“根据 Boss 的认知方式来组织世界”。

### 2.4 Karpathy Wiki 的骨架已经在

现有代码已经有：

- `wiki_sources`
- `wiki_pages`
- `wiki_page_links`
- `wiki_activity_log`
- `wiki_lint_issues`
- `wiki_chunks`
- `mempalace_drawers`
- `wiki-compiler`
- `lint`
- `query-engine`

问题不是没有架构，而是当前数据质量和链接密度没跟上。

### 2.5 Hermes 式 Agent 栈不是空想

现有代码已经有：

- Soul / Agent Memory
- Tool Loop
- MCP bridge
- scheduled_tasks / cron
- execution receipt / review
- skill_evolution
- Telegram handler

这说明下一阶段可以做“打通和可信化”，不用从零重建。

## 3. 当前短板

### 3.1 知识库是“大量页面”，还不是“可导航世界模型”

6482 个 wiki pages 里只有 2 个页面链接、2 个有 backlinks、6434 个 open orphan。这个状态下，LLM Wiki 的“知识复利”并没有真正发生。

必须从“生成页面”升级为“维护结构”：

- index / log / hot / schema
- 自动链接
- 未链接实体发现
- 孤岛合并
- 矛盾/过期/重复治理
- 每次高质量问答回写 Wiki

### 3.2 Graph 层薄弱

`knowledge_triples` 有 377 条，但面对 6602 个 sources 明显不足；`synapses` 为 0；`wiki_vectors` 为 0；`wiki_chunks` 只覆盖少部分来源。当前缺少一张跨 Notes、Wiki、Projects、Boss、Agent Actions 的统一图。

### 3.3 Agent 协作目前是“能力陈列”，不是“部门制执行”

用户过往笔记已经明确：Miya 应该是协调员，不应直接完成任务；设计、开发、研究、复盘应进入不同群/不同工作区/不同产物形态。

当前系统有 Teams 和模板，但：

- `custom_agents = 0`
- Agent 专属记忆很薄
- 项目只有 2 个
- operating_events 为空
- 执行收据还没形成真实复盘队列

### 3.4 自动化有节律，但缺少可信运行治理

`scheduled_tasks` 有 6 个，其中存在中文时间表达和玩笑任务。需要区分：

- 系统必需任务：wiki compile、wiki lint、memory decay、daily brief
- Boss 订阅任务：AI 趋势、项目调研
- 临时玩具任务：笑话类任务

调度应该有 owner、目的、证据、下游写入、失败重试，而不是只记录 cron。

### 3.5 数据安全必须升级

Notes 语料里存在疑似 API key、bot token、订阅链接、OAuth 等敏感文本。Graphify / Hermes 的安全设计都强调 secret redaction、路径保护、外泄防护。这个项目如果要让 Agent 自主读全库，必须先建立：

- secret scanner
- vault quarantine
- source sensitivity level
- tool permission policy
- 输出 redaction
- 分享/导出脱敏

### 3.6 失败时假成功仍是硬伤

`src/views/GhostWidget/GhostWidget.tsx` 中 LLM 失败后会用随机数生成本地模拟推演，并可能写入项目库。这会污染外脑，破坏信任。对于这个系统，“不知道”比“看起来完成了”更高级。

## 4. 从三篇大神内容吸收什么

### 4.1 从 Graphify 学

不是只学可视化，而是学“可计算的知识拓扑”：

- 双通道提取：代码/结构走确定性 AST；文档/图片/论文走语义 LLM。
- 边的置信度：EXTRACTED / INFERRED / AMBIGUOUS，系统必须诚实标注事实与推断。
- 图拓扑社区：用社区发现来识别真实主题簇，不只靠文件夹。
- 增量缓存：SHA / content hash，只处理变化内容。
- GRAPH_REPORT：输出上帝节点、惊人连接、建议问题、结构风险。
- MCP/导出：让其他 Agent 可以查询图，而不是只有 UI 能看。

结合本项目后，应形成 `Openbasaka Graph Layer`：

`Notes / Sources / Wiki / Projects / Boss / Agents -> Graph Extractor -> Typed Edges -> Community -> Graph Report -> Agent Query Tools`

### 4.2 从 Hermes Wiki 学

不是再造一个 RAG，而是把 Wiki 当“可持续维护的外脑器官”：

- raw/source 不可变，作为事实源头。
- wiki pages 由 Agent 维护，可编辑、可合并、可重构。
- schema 是协同进化的纪律文档，约束 LLM 怎么写、怎么链、怎么问。
- index 负责内容导航。
- log 负责时间线。
- hot 负责近期上下文热缓存。
- query 的好答案要回写 Wiki，成为新知识。
- lint 是系统免疫层，定期清理 orphan、dead link、矛盾、缺元数据、过期索引。

结合本项目后，`Notes` 不应该只是 6602 个 sources，而应该进入：

`Notes raw -> source registry -> memory palace wing/hall/drawer -> wiki compile -> index/log/hot/schema -> query/output -> wiki feedback`

### 4.3 从 Hermes Agent Advanced 学

重点不是照搬微信，而是学 Hermes 的运行治理：

- Gateway：一个统一入口连接 Telegram / WebUI / API / CLI。
- OpenAI-compatible API：把 Agent 系统暴露成可被 Open WebUI 或其他前端调用的服务。
- 主副模型分工：主模型用于高价值对话，副模型用于 compression、title、memory flush、web extract、vision、approval 等辅助任务。
- 配置先备份再修改，失败可回滚。
- `doctor` 式诊断：配置、模型、gateway、工具连通性都要可验证。
- 不要明文 key，统一 env 引用。

结合本项目后，Telegram/openbasaka agent bot 应该不是“外接聊天口”，而是：

`Telegram -> Gateway Router -> Agent Role -> Boss Context + Wiki Context + Tool Policy -> Execution Receipt -> Operating Events -> Memory/Wiki Feedback`

## 5. 新总架构：有机智能七层

### Layer 0: Trust & Safety

负责 secret 扫描、权限、路径、命令风险、外泄防护、脱敏导出。

### Layer 1: Raw Capture

负责 Notes、Telegram、Openbasaka 对话、Clipper、文件、网页、项目文档的原始采集。原始内容必须不可变或版本化。

### Layer 2: Memory Palace

负责按 Boss 的记忆宫殿规则归档：wing / hall / room / drawer / facet / tags / sensitivity / sourceId。

### Layer 3: LLM Wiki

负责 source -> page -> links -> index/log/hot/schema -> outputs。不是简单总结，而是可追问、可引用、可维护的知识编译。

### Layer 4: Graph Intelligence

负责把项目、知识、记忆、Boss 模式、Agent 行动连成图：typed nodes、typed edges、confidence、community、god nodes、structural holes、surprise links。

### Layer 5: Agent Operating System

负责 Teams、Miya coordinator、role-specific models、tool policy、MCP、Telegram bot、execution receipt、review queue。

### Layer 6: Boss Strategic Surface

负责把复杂系统变成 Boss 可内化的界面：每日简报、愿景对齐、项目神经网络、知识地图、下一步行动。

## 6. 分阶段计划

### Phase 1: 信任地基和数据体检

目标：先保证外脑不会污染自己。

任务：

- 清理重复 Electron/Vite 进程，只允许一个 dev runtime。
- 给 DB 增加 `schema_migrations` / `user_version`，不要只靠 `CREATE TABLE IF NOT EXISTS`。
- 给 Notes ingest 增加 secret scanner，疑似 key/token 进入 quarantine，不进入 Agent 默认上下文。
- 禁止 LLM 失败后写入随机模拟项目数据；改成 blocked/error 状态和重试建议。
- 给 `operating_events` 写入第一批真实系统事件：health check、schema init、wiki lint baseline。

验收：

- 新增或运行 `health:check` 后能看到 schema、DB、进程、secret、event ledger 状态。
- `operating_events > 0`。
- Graph/Wiki/Agent 输出里不会泄露敏感 token。

### Phase 2: Notes -> Memory Palace 规则重建

目标：让 6787 篇 Notes 从扁平材料变成 Boss 的记忆宫殿。

任务：

- 建立 Notes 分类映射：创意、项目、技术、情绪、世界观、关系、自我画像、操作凭证、归档垃圾。
- 为每条 source 生成 wing/hall/room/facet/sensitivity/source quality。
- 把 folder_path 从当前的 `.` 重建成真实来源路径或逻辑路径。
- 对敏感/凭证类 Notes 只记录元数据，不进入全文召回。
- 抽样人工审阅 100 篇，校正分类器。

验收：

- 至少 90% Notes 有 wing/hall/facet/sensitivity。
- 凭证类内容不会出现在普通知识问答引用中。
- Boss 可以问“我的项目构想有哪些类型”，系统按内容而非文件夹回答。

### Phase 3: LLM Wiki 免疫系统

目标：把 6482 个孤岛页转成可导航 Wiki。

任务：

- 生成 `wiki_index`、`wiki_log`、`wiki_hot`、`wiki_schema` 四类特殊页。
- 建立自动链接器：实体、概念、项目、人物、工具、模型、应用名。
- Lint 从统计升级为行动：orphan 修复、重复合并建议、missing page、unlinked mention。
- 高质量问答写回 `outputs` 类型页面，并反链到来源。
- 给页面建立 `status = draft / reviewed / trusted / deprecated`。

验收：

- open orphan 从 6434 降到 3000 以下作为第一里程碑。
- `wiki_page_links` 从 2 增长到至少 1000。
- 每个回答有 page/source/drawer/chunk 证据链。

### Phase 4: Openbasaka Graph Layer

目标：把 Graphify 的精神内化到本系统。

任务：

- 增加 typed graph tables：`graph_nodes`、`graph_edges`、`graph_reports`、`graph_communities`。
- 节点类型：BossPattern、Project、Note、WikiPage、Source、Agent、Task、Tool、Concept、Person、Model、App。
- 边类型：mentions、supports、contradicts、derived_from、similar_to、blocks、inspires、belongs_to、executes、produced。
- 边置信度：extracted / inferred / ambiguous。
- 每日生成 Graph Report：上帝节点、惊人连接、结构洞、孤岛社区、建议探索问题。

验收：

- 沙盘能展示“今天最值得探索的 5 个连接”。
- Agent 回答项目/自我/知识问题时可查询图，而不是只做全文搜索。

### Phase 5: Telegram / Agent Gateway 重构

目标：把聊天入口变成外脑主循环入口。

任务：

- Telegram 不照搬微信方案，保留 Telegram bot 作为主要外部通道。
- 参考 Hermes gateway，把每条消息变成 `InputEvent`。
- 增加 chat/thread -> agent/team mapping：私聊、研究群、设计群、开发群、复盘群。
- Miya 定义为 coordinator，只拆解、派发、追踪，不直接产出最终作品。
- 每个 Agent 有模型、工具权限、工作区、输出目标、记忆域。
- 所有 Agent 输出写入 execution receipt 和 operating_events。

验收：

- Boss 在 Telegram 发项目需求，系统能明确产生：计划、研究文件、设计任务、开发任务、复盘收据。
- 失败能重试或转人工确认。
- 不同 Agent 不共享污染上下文，但共享 Boss/Wiki/Graph 的只读事实层。

### Phase 6: 主副模型与成本治理

目标：高价值推理用强模型，机械任务用便宜快模型。

任务：

- 建立 model_roles：
  - primary_reasoning
  - cheap_summarizer
  - classifier
  - embedding
  - vision
  - web_extract
  - code_agent
  - safety_guard
- 每次调用记录 model、token/cost 估算、latency、result confidence。
- 配置修改前自动备份，失败可回滚。
- 增加 doctor 页面：provider、baseUrl、model、API key presence、gateway、MCP、cron、DB。

验收：

- 每个 scheduled task 和 Agent 能说明自己用什么模型、为什么。
- 系统能把 expensive model 留给真正需要的任务。

### Phase 7: Boss Strategic Surface

目标：每天打开一次，就知道系统知道什么、缺什么、该做什么。

任务：

- 每日简报升级为四块：昨日沉淀、今日探索、系统免疫、行动队列。
- 愿景对齐中枢显示七层架构健康度。
- 项目神经网络纳入 Notes/Wiki/Agent 行动节点。
- 所有页面遵循：结论、证据、下一步、来源。

验收：

- Boss 不需要理解数据库，也能清楚知道系统状态。
- 每个建议都能点击到来源和行动入口。

## 7. 优先级

P0：

- 停止失败假成功。
- Secret scanner / quarantine。
- operating_events 真实写入。
- Notes 分类与敏感隔离。

P1：

- Wiki 链接修复和 index/log/hot/schema。
- Graph layer typed nodes/edges。
- Telegram gateway -> event ledger。
- Agent execution receipt 全链路。

P2：

- 主副模型治理。
- Open WebUI / API 兼容层。
- Graph report UI。
- 多群/多工作区 Agent 部门制。

## 8. 一句话判断

这个项目最大的优势是愿景和底座都对：本地数据、Boss 建模、Wiki、记忆宫殿、Agent、Telegram、自动化都已经出现。

最大的问题是“量”已经进来了，“秩序”还没长出来：Notes 很多、Wiki 很多、Boss memory 很多，但链接、图谱、事件、执行收据、Agent 责任边界不足。

下一阶段不是继续加页面，而是建立免疫系统、图谱系统、事件账本和 Agent 部门制。做到这四件事，Openbasaka 才会从“功能很多的本地 AI 应用”变成真正有机、可靠、能陪 Boss 长期探索世界的智能系统。
