---
title: "WIKI规则，放到项目claude.md中"
source: "https://flowus.cn/ziho/share/fbe4228f-7bb8-470a-8d6c-338c15c2b2a2"
author:
published:
created: 2026-04-07
description: "Knowledge Base Schema"
tags:
  - "clippings"
---
## Knowledge Base Schema

## 🚀 快速开始

👉 首先打开： \[\[wiki/INDEX.md\]\]  

从这里开始导航和搜索你的知识库。  

## 📖 三种使用方式

  

### 1️⃣ 浏览知识

Plain Text

```
xxxxxxxxxx
```

```
打开 [[wiki/INDEX.md]]
```

```
↓
```

```
选择主题
```

```
↓
```

```
阅读文章
```

  

### 2️⃣ 搜索知识

Plain Text

```
xxxxxxxxxx
```

```
问题：告诉 AI 你想知道什么
```

```
↓
```

```
AI 优先读 [[wiki/INDEX.md]] 理解结构
```

```
↓
```

```
搜索相关文章（Claude 自动完成）
```

```
↓
```

```
综合答案存储到 outputs/
```

  

### 3️⃣ 添加新内容

Plain Text

```
xxxxxxxxxx
```

```
新链接、笔记、文章
```

```
↓
```

```
保存到 Clippings/
```

```
↓
```

```
Claude 自动编译为 wiki/articles/
```

```
↓
```

```
INDEX.md 自动更新
```

  

## 📂 文件结构

Plain Text

```
xxxxxxxxxx
```

```
vault/
```

```
├── Clippings/              # 原始数据
```

```
├── wiki/
```

```
│   ├── INDEX.md           # ⭐ 从这里开始
```

```
│   └── articles/          # 92 篇文章
```

```
└── outputs/               # 查询结果
```

  

## ✅ 核心规则

优先使用 wiki，不需要复杂 RAG  

你的 wiki 有 92 篇文章，LLM 可以直接读完，所以：  

✓ AI 会自动读所有文章  

✓ 无需向量数据库  

✓ 无需相似度计算  

做什么：  

✓ 从 \[\[wiki/INDEX.md\]\] 开始  

✓ 向 Claude 提问关于 wiki 的内容