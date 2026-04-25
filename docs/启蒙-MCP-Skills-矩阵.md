# 《启蒙》MCP / Skills 能力矩阵

更新时间：2026-04-22

## 1. 立即必需的 Runtime MCP

这些是《启蒙》工程第一阶段就应在线的能力。

| MCP | 优先级 | 用途 | 备注 |
| --- | --- | --- | --- |
| `MemPalace` | P0 | 官方长期记忆协议、drawer 读写、知识图谱、agent diary | 《启蒙》的第一底座 |
| `Filesystem` | P0 | 扫描 6000+ 原文目录、读写索引、落盘导入日志 | 批量 ingest 必需 |
| `SQLite` | P0 | 直查 Openbasaka 本地库、分类统计、迁移核对 | 校验与运维必需 |
| `MarkItDown` | P0 | PDF / Office / 图片转 Markdown | 异构资料导入必需 |
| `Fetch` | P1 | 抓取指定 URL 原文 | 外部补强与来源回填 |
| `Brave Search` | P1 | 广域实时搜索 | 时效信息补强 |
| `Exa Search` | P1 | 语义搜索与网页抽取 | 高质量研究补强 |
| `Context7` | P1 | 技术文档与库文档查询 | 工程实现期很重要 |
| `Playwright` | P2 | 网页交互、截图、自动核验 | 归档流与 UI 验证 |
| `Sequential Thinking` | P2 | 长链推理 | 用于复杂分类与冲突整合 |

结论：

- `MemPalace / Filesystem / SQLite / MarkItDown` 是《启蒙》最小可行底座
- `Fetch / Brave / Exa / Context7` 是二级补强层
- `Playwright / Sequential Thinking` 是复杂场景增强层

## 2. 运行时技能角色

这些不是“漂亮名字”，而是系统里必须存在的工作角色。

| 角色 | 责任 | 是否第一阶段必须 |
| --- | --- | --- |
| `Archive Gatekeeper` | 只生成归档候选，不擅自入宫；负责点击确认前的预审 | 是 |
| `Palace Taxonomist` | 负责 `wing / room / hall / facet` 分类 | 是 |
| `Verbatim Ingestor` | 确保原文逐字入 drawer，保留来源与路径 | 是 |
| `Wiki Crystallizer` | 将高价值 drawer 编译为 Wiki 页面 | 是 |
| `Contradiction Auditor` | 发现互相冲突的旧认知、新认知、项目叙事 | 否，二期 |
| `Profiling Navigator` | 用画像工坊结果调整归档优先级与召回顺序 | 是 |
| `Project Synapse Curator` | 将创意项目视为探索世界的方法，建立跨翼连接 | 是 |
| `Agent Diary Steward` | 为不同 agent 维持稳定 diary 流 | 否，三期 |

## 3. 当前仓库中应重点保留/强化的内建能力

| 现有能力 | 处理方式 |
| --- | --- |
| `memory-palace` | 语义说明改为 `wing / room / hall / drawer + L0-L3` |
| `semantic-recall` | 保留并继续强化 scoped recall |
| `memory-extractor` | 从“自动入库”转向“候选生成器” |
| `knowledge-graph` | 保留，后续承接跨翼事实与时序 |
| `auto-research` | 保留，用于外部补强，不替代《启蒙》 |
| `war-room` | 保留，用于项目侧推演，与《启蒙》互相回写 |

## 4. 开发期推荐使用的 Codex / Claude Skills

这些是本仓库继续推进《启蒙》工程时最有价值的开发技能。

| Skill | 用途 |
| --- | --- |
| `build-web-apps:frontend-skill` | 做出不平庸的归档门、宫殿导航、时间线与证据 UI |
| `build-web-apps:react-best-practices` | 保持 React 19 / Vite 代码质量与性能 |
| `build-web-apps:web-design-guidelines` | 审核可用性、信息密度、可读性 |
| `github:github` | 后续整理 issue / PR / repo 工作流 |
| `github:gh-fix-ci` | 修复 CI 失败 |
| `github:gh-address-comments` | 处理代码审查反馈 |
| `imagegen` | 画像工坊、宫殿地图、概念视觉草图 |
| `openai-docs` | 涉及 OpenAI 接入时查询最新官方资料 |

## 5. 不建议一开始就接入的能力

| 能力 | 原因 |
| --- | --- |
| 泛化“自动记忆” | 会绕开点击式归档门，破坏你的主观阈值 |
| 纯向量式黑箱记忆插件 | 会削弱《启蒙》的结构可走入性 |
| 大量额外 Agent 人格 | 在分类法和归档门没稳定前，只会放大混乱 |
| 复杂工作流编排 | 在原始数据尚未入宫前，自动化只会加速错误 |

## 6. 本轮准备动作

本轮准备应只做三件事：

1. 补上官方 `MemPalace` MCP 预设
2. 冻结《启蒙》分类法与点击式归档规则
3. 让现有记忆相关描述从旧模型收敛到新的稳定契约

在这三件事完成前，不做大规模内容迁移。
