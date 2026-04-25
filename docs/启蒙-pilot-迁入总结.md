# 《启蒙》Pilot 迁入总结

生成时间：2026/4/22

## 当前结果
- 语料根目录：`/Users/apple/Documents/Openbasaka_Brain/Wiki`
- 已迁入 pilot：`144` 篇
- 已写入 `wiki_sources`：`144`
- 已写入 `mempalace_drawers`：`144`
- 原始 source chunks：`397`
- 结构化 page chunks：`94`
- 去重验证：首批 `12` 篇 dry-run 回放结果为 `12 skipped / 0 imported`
- 已结晶 wiki 页面：`22`
- 已生成 pilot index：`1`
- 已记录 compile activity logs：`22`

## 当前翼楼分布
- `worldview`：27
- `openbasaka`：23
- `profiling`：23
- `identity`：16
- `creation`：15
- `wishes`：15
- `dialogue`：13
- `method`：12

## 当前大厅分布
- `emotions`：51
- `consciousness`：48
- `technical`：24
- `family`：15
- `identity`：5
- `memory`：1

## 本轮落成
- 新增共享语料工具：[tools/qimeng-corpus.ts](/Users/apple/Desktop/【项目的游戏】/tools/qimeng-corpus.ts:1)
- 新增 pilot 迁入器：[tools/qimeng-pilot-import.ts](/Users/apple/Desktop/【项目的游戏】/tools/qimeng-pilot-import.ts:1)
- 新增 pilot 编译器：[tools/qimeng-pilot-compile.ts](/Users/apple/Desktop/【项目的游戏】/tools/qimeng-pilot-compile.ts:1)
- 新增 page chunk 回填器：[tools/qimeng-page-chunks.ts](/Users/apple/Desktop/【项目的游戏】/tools/qimeng-page-chunks.ts:1)
- 新增回滚器：[tools/qimeng-import-rollback.ts](/Users/apple/Desktop/【项目的游戏】/tools/qimeng-import-rollback.ts:1)
- 修复大文本分块尾块死循环：[src/lib/knowledge/chunker.ts](/Users/apple/Desktop/【项目的游戏】/src/lib/knowledge/chunker.ts:203)
- 分段迁入批次报告：`docs/qimeng-imports/`
- 分段编译批次报告：`docs/qimeng-compiles/`
- pilot 索引页：`qimeng-pilot-index`

## 下一步
- 在 Openbasaka 侧补“归档前可微调 room/tags/facet”的预览层。
- 为《启蒙》结构页补双链解析与更细的主题 index。
- 把 pilot 验证过的导入/编译规则推广到 `6427` 篇全量迁入。
