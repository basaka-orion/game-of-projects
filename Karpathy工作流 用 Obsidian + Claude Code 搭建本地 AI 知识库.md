---
title: "Karpathy工作流: 用 Obsidian + Claude Code 搭建本地 AI 知识库"
source: "https://flowus.cn/ziho/share/230f20ba-1592-47b7-9a25-a9861aae99b1"
author:
published:
created: 2026-04-07
description: "课程资源:"
tags:
  - "clippings"
---
## 课程资源:

WIKI规则，放到项目claude.md中

  

## 介绍

前特斯拉 AI 总监 Karpathy 分享了他的个人知识库工作流：把每天刷到的碎片内容，沉淀成本地的 AI 知识库，越用越智能。  

整个流程分三步：数据采集 → AI 整理 → 问答输出。  

## 工具准备[Obsidian](https://obsidian.md/)

：本地 Markdown 笔记软件  

Claude Code：AI 编码助手（通过 Obsidian 插件集成）  

### 安装步骤

1

下载并安装 Obsidian  

2

新建一个目录，命名为 my-knowledge-base，这就是你的知识库根目录  

3

在 Obsidian 插件市场搜索「claudian」，找到对应 GitHub 仓库  

4

复制仓库地址，让 Claude Code 自动安装，完成集成  

## 第一步：采集原始内容

安装 Obsidian Web Clipper 插件。看到高价值内容时，一键保存进 raw/ 文件夹，不用再靠收藏夹吃灰。  

也可以手动复制粘贴，或通过 Claude Code 命令批量导入文档。  

## 第二步：AI 整理成 Wiki

Wiki 是什么：可以简单理解为知识库的索引文件，帮助大模型快速定位和理解本地内容。  

什么时候需要构建 Wiki：  

内容较少时（< 50 篇）可以跳过，Claude 会自动搜索上下文  

内容积累多了之后，建议配置 CLAUDE.md，让 AI 按你的规则整理归纳  

怎么配置：Karpathy 只提到 Wiki 应包含 raw/ 目录中所有数据的摘要和链接，没有给出具体实现。你可以在 CLAUDE.md 中写明构建规则，然后让 Claude Code 执行构建。  

## 第三步：问问题，把答案存回来

这是最关键的一步，也是让知识库越用越智能的地方。  

示例问法：  

"基于这个知识库，我对 XX 话题最大的认知盲区是什么？"  [WIKI规则，放到项目claude.md中](https://flowus.cn/fbe4228f-7bb8-470a-8d6c-338c15c2b2a2)