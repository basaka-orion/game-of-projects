# 项目架构与核心运行流程全景指南 (Openbasaka / Game of Projects)

本项目被称为 **项目的游戏 (Game of Projects) / Openbasaka**，是一个定位极其深度的**个人元宇宙外脑操作系统**与**现实世界战略推演沙盘**。

整个系统采用了 **Electron + React 19 + Vite + TypeScript + Native SQLite (better-sqlite3)** 的本地客户端架构。

---

## 1. 顶层架构与多窗口模型

项目的核心生命周期在桌面端运行，拥有高度的本地权限（如直接写入 SQLite，读写本地文件），规避了纯 Web 应用的 CORS 瓶颈以及存储容量限制。

### 初始化启动

1. **Electron Main Process (`electron/main/index.ts`)**

   - 监听 `app.whenReady()`。
   - 初始化本地 SQLite 数据库（存储于系统的 User Data 目录 `game-of-projects.db`），开启 WAL (Write-Ahead Logging) 提升并发性能，创建各种数据表。
   - 打开主要的工作窗口（见下）。
   - 创建**系统托盘** (TrayIcon)，支持快速呼出、隐藏窗口，以及执行重要管理操作（**导出、导入 JSON 数据库备份**）。
   - 提供 IPC (Inter-Process Communication) 通信：封装 LLM 直接调用接口（避免渲染进程直接发请求导致的 CORS 问题）、执行本机 shell 终端命令。
2. **Electron 渲染进程形态（多窗体）**

   - **👻 Ghost Window (副官小窗)**：520x780 尺寸的默认助手界面，背景颜色极暗 (`#041c1c`)，支持 `alwaysOnTop`（悬浮置顶），提供无任务栏侵扰的沉浸式对话（即 `Openbasaka` 核心唤起页）。
   - **🔮 Sandbox Window (战情沙盘大屏)**：1400x900 尺寸的全屏系统面板界面，通常占据全屏或辅助显示器，由控制台界面唤出，主要用于查看各种仪表盘与资源详情。

---

## 2. 路由与前端入口 (App.tsx)

在 `src/App.tsx` 中，应用通过 Hash Router 实现客户端路由分发。
系统在首次启动时，会检查是否经历过 **Onboarding**（首次初始化校验 Boss 身份锚点），未注册时强制进行 Onboarding。

成功进入系统后，包含四大核心面板（对应四个组件树）：

* `#/` 或 `#/openbasaka`：**Openbasaka** (`Openbasaka.tsx`)
  * 全天候陪伴型数字副官，AI 对话核心。
* `#/ghost`：**GhostWidget**
  * 即“项目的游戏”战略推演引擎。
* `#/sandbox`：**SandboxMap**
  * 战况沙盘引擎，包含系统的高级管理和各种 Tab（资源看板、模块配置）。
* `#/settings`：**Settings**
  * 系统基础常规设置。

---

## 3. SQLite 数据流与 Schema (数据库模型)

**数据库通过 `src/lib/db/schema.ts` 强力构造本地超级外脑大脑。** 核心业务表涵盖多维立体空间：

### A. 对话与 LLM 模型

* `conversations` / `messages`: 对话存储与持久化，支持重连上下文。
* `boss_profile` / `settings`: 针对主人的长期资料沉淀与 LLM 配置参数。

### B. 项目及推演生存模型 (The Game of Projects)

* `projects`: 管理用户各个"正在做的项目"，含生存概率 (`survival_rate`)，健康度评级。
* `project_versions`: 项目重启、枢轴转变时的版本历史（留作快照记录避免数据丢失）。
* `project_taxonomy` / `synapses`: 项目归类及**项目之间的图谱关联**（比如某个项目可以承接另外项目的技能/思路）。
* `boss_decisions`: 记录 Boss 主人的裁决历史（抛弃/转向/追求）。

### C. 记忆宫殿系统 (Memory Palace)

* **FTS5 全文搜索赋能**：通过 SQLite 虚表 `memory_fts` 实现瞬时超级联想搜索。
* `memory_rooms`: "不同主题的记忆殿堂"。
* `memory_items`: 碎片资料、感触、提要保存，分为高/中/低权重 (`importance`) 保存在不同房间中。

### D. 知识体系 (Knowledge Graph)

* `knowledge_triples`: （主体 - 关系 - 客体）组成的三元组语义网系统，由 LLM 自动提取存入。

### E. 多 Agent 与工作流矩阵

* `custom_agents`: 支持自建专属 AI 人格引擎。
* `agent_souls` / `agent_memories`: 系统中各个 Agent（如小白、战略专家、情报专家）分别拥有的专属长期记忆通道。
* `workflows`: 自动化任务调度编排定义。

---

## 4. LLM 集成与通讯网络架构

LLM 网络层通过 `provider.ts` 与 Electron IPC 彻底贯通，解决一切渲染环境不一致导致的网络或权限问题。

### 1. 通用模型基座

系统兼容并开放 OpenAI 与 Anthropic 格式范式的各类厂商（通过更改 `BaseURL`）：

1. Deepseek
2. Minimax
3. Zhipu AI (GLM)
4. Ollama (本地大模型，断网外脑)

### 2. 独立配置原则 (Per-Agent Config Override)

* 每名 Agent（全局配置 vs 某个具体的垂直专家）**均有自身独享的配置映射字典**。小白可以跑 Minimax，推演专家可以跑 GLM，它们独立解耦。

### 3. "反幻觉" 强制搜索链 (`autoSearchIfNeeded`)

由拦截器与 LLM 共同工作的严苛工作流体系。
如果用户提问带有“时事、资讯、最新情报”等指令性关键字，Openbasaka 在进行答复前，会在后台**强行劫持对话流**：

1. 触发 `autoSearchIfNeeded`（使用 Electron 或直接 `fetch` 实时网络结果）。
2. 在 System Prompt 最末端插入 **Layer 10：Timestamp + 反幻觉铁律**：强迫 LLM 将最新的资讯加上当日日期戳打印，并且**严禁**随意乱编。查不到坚决承认"无相关情报"。

---

## 5. 文件资料与库藏流水线 (Ingest Pipeline)

这套系统的核心亮点是 **自动知识摄取机制 (`ingest.ts`)**。

当用户通过拖拽 (`SandboxMap -> KnowledgeVaultTab`)、黏贴、或发送链接等形式输送外源资料时：

1. **扫描与接收** (Dropzone)
   - 包含刚才完成实现的全新原生流：即使是含有大量文件的**深层文件夹**，也通过原版浏览器底层 `FileSystemEntry` 和 `FileReader` 自动递归遍历、读取所有受支持格式的内容。不受限于 Electron Context Isolation 控制的空路径制约。
2. **入库溯源创建** (`createSource`)
   - 记录其为 URL/本地 File 或是 Clipper，并进入 `processing` 队列。
3. **LLM 高维压缩与提取** (`llmProcessContent`)
   - 原文交给大模型，按照严格 Prompt 系统化地把非结构化的信息产出以下对象：
     * 精确的 Title 和 一句话 Summary
     * Importance 分级（1~100 打分）
     * 三个左右的 **Triples（知识三元组）**。
4. **入驻殿堂**
   - 生成格式正规统一的 "Wiki Page"。
   - 如果 LLM 判断此素材非常重要 (`Importance >= 80`)，将它直接写入 **记忆宫殿 (`palace.ts`)**。
   - 提取的三元组落入图谱 `knowledge_triples` 表中。

---

## 6. Sandbox 的核心控制枢纽面板

沙盘界面 `SandboxMap` 下，被严格切分出了多个专门管控特定功能的 Tab 界面，通过它们管理这个巨大系统的全貌：

| 窗体组件                  | 用途及功能描述                                               |
| ------------------------- | ------------------------------------------------------------ |
| `KnowledgeVaultTab`       | 知识库投喂舱。支持批量文件、文件夹无感知智能摄入，也是外围数据的输入前哨站。 |
| `ControlPanelTab`         | 枢纽控制区。管理所有的 LLM Provider 参数，测试模型连通性，切换并分配模型服务。 |
| `MemoryTab`               | 记忆查看区。用来提取并翻阅记忆碎片、梳理宫殿内部的陈列。     |
| `SynapsesTab`             | 神经突触连结器。查看、管理不同项目之间的依存关联性与相互促进关系。 |
| `XiaoBaiTab`              | “小白”管理页面。这是一个特别设立的核心助手实体，属于系统内置的重要伴生人工智能单元。 |
| `TeamsTab` & `NeuronsTab` | 多模态团队以及神经元组件的高级编辑面板，支持自定义扩展自动化技能。 |
| `SchedulerTab`            | 管控系统定期运行或监控的任务自动化周期，Cron Job 管理入口。  |
| `BossTab`                 | Boss 首长资料中心，你的专属性格与履历，确保不同项目切换时，AI 对主人的价值观认知保持核心一致。 |

---

## 7. 系统的灵魂：从应用到 "外脑战略操作系统"

整个 `Game of Projects` (Openbasaka) 被设计为超越简单 Chatbot 的核心在于：

1. **强本地控制权**：SQLite 握于手心，永远不需要担忧服务商关停导致数据毁灭，可以随时将自己几千条记忆碎片备份出 `.json` 重建。
2. **知识自我繁衍**：随意向它丢掷文件夹、链接，系统便会在后台悄悄通过 LLM 把重点摘录并分发进记忆宫殿与三元组。它自己整理。
3. **隔离解耦**：每个模块高度低耦合。不管是你想加入新模型厂家、定制新型专精领域的 Agent、乃至变更推演流程，皆拥有独立数据表进行追踪，而不需要整体推倒重构。

**这就是这座元宇宙数字堡垒目前的总成形貌。**