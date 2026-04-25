# 🌌 Openbasaka / Game of Projects：开发者 99% 复刻指南

这份指南深入代码实现层，剥离表层概念，直指项目核心结构。如果你需要 99% 完美复刻这个系统，请严格按照以下架构、数据流和通信设计进行实施。

---

## 一、 核心技术栈与工程脚手架

本系统是一个重桌面端轻 Web 的架构，极度依赖本地原生能力：
- **核心框架**：React 19 + TypeScript + Vite 8
- **桌面引擎**：Electron 41 + `vite-plugin-electron`（实现前后端同构打包）
- **打包分发**：`electron-builder` (`mac` target, ARM64 优化)
- **本地数据库**：`better-sqlite3`（必须使用此绑定因为需要高性能同步 I/O 与 WAL 模式）
- **视觉风格**：Vanilla CSS (CSS Variables) 配合组件 scoped css，未使用 Tailwind 也不推荐使用。

---

## 二、 完整目录树还原映射

```text
src/
├── App.tsx                     # 顶层状态机，控制 4 大顶级路由挂载
├── main.tsx                    # React Root
├── design/                     # 设计令牌与原子 CSS
│   ├── index.css
│   ├── reset.css, tokens.css, grid-system.css, animations.css
├── components/                 # 高复用木偶组件 (UI呈现为主)
│   ├── AgentAvatar, HexRadar, SearchStatsBar, TerminalBlock 
│   ├── VignetteGlow (暗黑四角泛晕边效果), WarningBanner 等
├── views/                      # 顶级路由与重大业务窗体
│   ├── Onboarding/             # 初次启动身份建立区
│   ├── Openbasaka/             # 默认小窗：AI 副官对话流
│   ├── GhostWidget/            # 副窗：项目推演引擎 (War Room)
│   ├── SandboxMap/             # 战况沙盘大屏面板，包含极其复杂的 Tab 切分
│   │   └── tabs/
│   │       ├── BossTab, ControlPanelTab, KnowledgeVaultTab, MemoryTab
│   │       ├── NeuronsTab, SchedulerTab, SynapsesTab, TeamsTab, WorkflowDiagram, XiaoBaiTab
│   └── Settings/
└── lib/                        # 核心大脑中枢引擎 (纯 TypeScript 逻辑)
    ├── agents/                 # 多人格定义表 (Registry, Soul, Memory)
    ├── ai/                     # LLM 与推理驱动引擎 (非常关键，下述)
    ├── boss/                   # 用户身份侧写与长效记忆 (Anchor, Profile)
    ├── chat/                   # 聊天上下文维护与工具循环 (Tool Loop)
    ├── db/                     # SQLite 层封印 (repository, schema, store)
    ├── game/                   # 生存推演算法 (Progression, Era variables)
    ├── knowledge/              # RAG 与语料摄入系统 (Ingest, Wiki, Query Engine)
    ├── mcp/                    # Anthropic Model Context Protocol 客户端连接
    ├── memory/                 # 记忆宫殿核心 (Search, Graph, Palace, Structural Holes)
    └── workflow/               # 自动化工作流解析引擎
electron/
├── main/
│   ├── index.ts                # 主进程入口：IPC + 窗口生成
│   └── database.ts             # Node 层 SQLite 引擎初始化
└── preload/
    └── index.ts                # Context Isolation 桥接定义 (必须暴露 electronAPI)
```

---

## 三、 数据库设计 (Better-SQLite3 Schema)

所有数据不落云端。复刻时，`src/lib/db/schema.ts` 必须实现以下表结构设计：

1. **基础键值对表**
   - `settings`，`boss_profile` (用于快速读取 API Keys 和 Boss 画像)
2. **多人格与记忆表**
   - `custom_agents` (内置人格+自建人格)，`agent_souls` (覆写 System Prompt)，`agent_memories` (不同 AI 之间的独立记忆隔绝)。
3. **The Game of Projects 模型**
   - `projects`（id, title, survival_grade, radar_json 等多维度状态），`project_versions` (供时光倒流，每次 pivot 的快照)。
   - `project_taxonomy` (行业分类学)，`boss_decisions`，`synapses` (定义 project_A 到 project_B 之间的"突触"类型：互补、冲突、灵感等)。
4. **统一记忆宫殿与语料库 (RAG)**
   - `knowledge_triples` (主谓宾三元组网络)。
   - `memory_rooms` (宫殿房间)，`memory_items` (存放碎片与长文)。
   - **核心搜索**：必须使用 `CREATE VIRTUAL TABLE memory_fts USING fts5` 加上对应的 Insert/Update/Delete **Trigger** 以保持索引实时同步。

---

## 四、 极度关键 IPC 与通信网路机制

为了规避客户端跨域限制并实现桌面最高权限，系统具有极强的 IPC (Inter-Process Communication) 依赖原则：

### 1. `preload/index.ts` 必须抛出以下接口
```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  dbQuery: (sql, params) => ipcRenderer.invoke('db-query', sql, params),
  dbRun: (sql, params) => ipcRenderer.invoke('db-run', sql, params),
  executeCommand: (cmd, timeout) => ipcRenderer.invoke('execute-command', cmd, timeout),
  fetchUrl: (url) => ipcRenderer.invoke('fetch-url', url),
  
  // 流式 AI 响应桥接 (解决直接 fetch 的跨域死结)
  streamAI: (prompt, systemPrompt, callback, configOverrideJson) => {
    ipcRenderer.on('ai-stream-data', (event, data) => callback(data));
    return ipcRenderer.invoke('stream-ai', prompt, systemPrompt, configOverrideJson)
           .finally(() => ipcRenderer.removeAllListeners('ai-stream-data'));
  }
})
```

### 2. AI 网络调度分发 (`src/lib/ai/provider.ts`)
整个 AI 调用**不可直接发送 fetch**（当打包成 app 时，有些厂牌的 CORS 会全部挡下）。
所有需要聊天的入口必须按以下流程执行：
1. **配置独立**：执行 `resolveAgentConfig(role)`，按 `agent_{role}_model` 优先匹配特定专家配置，如果未设置则降级为全局 `llm_model` 配置。
2. 发送 IPC `sendToAI` 或 `streamAI` 到 Node 主进程。
3. 主进程根据厂牌类型（是否为 Anthropic `v1/messages` 兼容接口或 OpenAI `chat/completions` 兼容接口）统一用 Node `fetch` 发出，将 `chunk` 转发回前端 `webContents.send`。

---

## 五、 反幻觉铁律与实时搜索架构

复刻出高智能的"小白"时，这一步是核心。

1. **触发器劫持 (`src/views/Openbasaka/Openbasaka.tsx`)**
   当用户输入触发正则 `/最新|最近|今天|当前|新闻|资讯|情况|时报|局势|动向` 时，前端暂停 AI 请求。
2. **静默连网 (`executeCommand`)**
   通过 IPC 调用底层宿主机器使用 `curl` 抓取相关内容，或者使用集成的桌面级搜索 API。
3. **Prompt 层叠强注 (`src/lib/chat/context.ts`)**
   在组装最终发送给大模型的消息体前，强行将时间戳与搜索反馈塞入 `Layer 10 (Timestamp)`：
   ```text
   【当前时间戳】2026-04-14 11:30:22  
   【最新情报馈送】...
   === 反幻觉铁律 ===
   1. 回复必须携带 [情报日期] 标记。
   2. 无关情报不能用于编造。
   3. 查无资料时直接回答“抱歉，由于无法获取最新数据...”
   ```

---

## 六、 FileReader 式的跨平台重型深层文件夹导入器

在 `KnowledgeVaultTab` 知识库摄入器中，由于 Electron Context Isolation 的安全设计，不能相信 `DataTransfer` 中的 `file.path`。必须按如下完全从浏览器流完成深度读取（规避安全沙盒陷阱）：

**核心复刻逻辑**：
1. 监听 `onDrop` 后，利用 `items[i].webkitGetAsEntry?.()` 检测拖拽是否属于文件夹。
2. 对于 `isDirectory` 的特征对象，创建一个递归的 `FileSystemDirectoryReader`。
3. 不断调用 `reader.readEntries` 穷尽列子级对象。
4. 将所有探测到的内嵌子级 `File` 丢给 `new FileReader().readAsText(file)` 读出原始文本。
5. 通过 `index.ts` 中控管的大型管道 `ingestSource` 解析并使用大模型摘要：
    - 创建 Title/Summary。
    - 抽取知识并压入 Triples 和 Memory Palace。

---

## 七、 多体并发 UI 沙盘交互控制 (React State)

由于涉及到跨窗口与面板通讯，整个状态必须解耦处理。

1. **Tab Router (组件：SandboxMap)**：控制左侧导航点击。
   整个面板依靠 `<SidebarNav>` 组件映射，激活相应的如 `<ControlPanelTab />` 或 `<SynapsesTab />` 组件进行局部重渲染。
2. **样式极客设计**：全局采用了 `VignetteGlow` 层压在底层，并搭配非常多的 CSS 霓虹与像素闪烁效果 (如 `rgba(0, 212, 170, 0.4)` 暗绿发光)，还原赛博朋克深网特工仪表盘的设计语境。

### 复刻结语

掌握以上七大部分的核心引擎、IPC数据桥接路线、独立分发的模型字典算法、反幻觉流劫持以及基于 FileReader 的无限深层拖拽遍历法，你能直接达到 99% 的重现，并具备极度硬核的可拔插能力。
