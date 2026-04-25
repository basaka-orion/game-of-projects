import type { WikiPage } from '../../../../lib/knowledge/wiki'
import type { KnowledgeIntelligence } from '../../../../lib/knowledge/intelligence'

interface IntelligencePanelProps {
  intelligence: KnowledgeIntelligence
  pages: WikiPage[]
  onSelectPage: (id: string) => void
}

function getPageTitle(pages: WikiPage[], pageId: string): string {
  return pages.find(page => page.id === pageId)?.title || '未知页面'
}

export default function IntelligencePanel({
  intelligence,
  pages,
  onSelectPage,
}: IntelligencePanelProps) {
  const maxCategoryCount = Math.max(...intelligence.categories.map(item => item.count), 1)
  const maxTimelineCount = Math.max(...intelligence.timeline.map(item => item.count), 1)

  return (
    <div className="kv-tab__intel">
      <div className="kv-tab__intel-hero">
        <div>
          <div className="kv-tab__intel-kicker">Knowledge Curation</div>
          <div className="kv-tab__intel-title">知识策展与前沿情报</div>
          <div className="kv-tab__intel-subtitle">
            不再只是体检页面，而是把你的知识库变成可导航、可连接、可启发下一步行动的动态地图。
          </div>
        </div>
        <div className="kv-tab__intel-metrics">
          <div className="kv-tab__intel-metric">
            <span className="kv-tab__intel-metric-value">{intelligence.overview.totalPages}</span>
            <span className="kv-tab__intel-metric-label">页面总量</span>
          </div>
          <div className="kv-tab__intel-metric">
            <span className="kv-tab__intel-metric-value">{intelligence.overview.connectedPages}</span>
            <span className="kv-tab__intel-metric-label">已连接页面</span>
          </div>
          <div className="kv-tab__intel-metric">
            <span className="kv-tab__intel-metric-value">{intelligence.overview.recentPages}</span>
            <span className="kv-tab__intel-metric-label">近 45 天活跃</span>
          </div>
          <div className="kv-tab__intel-metric">
            <span className="kv-tab__intel-metric-value">{intelligence.overview.pinnedPages + intelligence.overview.starredPages}</span>
            <span className="kv-tab__intel-metric-label">置顶 + 收藏</span>
          </div>
        </div>
      </div>

      <div className="kv-tab__intel-grid kv-tab__intel-grid--top">
        <section className="kv-tab__intel-card">
          <div className="kv-tab__intel-card-title">知识结构</div>
          <div className="kv-tab__intel-card-subtitle">先看哪些板块最厚，再决定索引怎么组织</div>
          <div className="kv-tab__intel-bars">
            {intelligence.categories.slice(0, 7).map(item => (
              <div key={item.category} className="kv-tab__intel-bar-row">
                <div className="kv-tab__intel-bar-meta">
                  <span>{item.label}</span>
                  <span>{item.count}</span>
                </div>
                <div className="kv-tab__intel-bar-track">
                  <div
                    className="kv-tab__intel-bar-fill"
                    style={{ width: `${Math.max(10, (item.count / maxCategoryCount) * 100)}%` }}
                  />
                </div>
                <div className="kv-tab__intel-bar-foot">
                  <span>近 45 天 {item.recentCount}</span>
                  <span>重要度 {Math.round(item.avgImportance)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="kv-tab__intel-card">
          <div className="kv-tab__intel-card-title">时间脉冲</div>
          <div className="kv-tab__intel-card-subtitle">用创建时间看你最近 8 个月沉淀的密度</div>
          <div className="kv-tab__intel-timeline">
            {intelligence.timeline.map(point => (
              <div key={point.key} className="kv-tab__intel-timeline-item">
                <div className="kv-tab__intel-timeline-bar">
                  <div
                    className="kv-tab__intel-timeline-fill"
                    style={{ height: `${Math.max(8, (point.count / maxTimelineCount) * 100)}%` }}
                  />
                </div>
                <div className="kv-tab__intel-timeline-label">{point.label}</div>
                <div className="kv-tab__intel-timeline-value">{point.count}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="kv-tab__intel-card kv-tab__intel-card--wide">
          <div className="kv-tab__intel-card-title">下一步建议</div>
          <div className="kv-tab__intel-card-subtitle">少一点概念，多一点立刻可做的动作</div>
          <div className="kv-tab__intel-signals">
            {intelligence.frontierSignals.map(signal => (
              <div key={signal} className="kv-tab__intel-signal">
                {signal}
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="kv-tab__intel-grid kv-tab__intel-grid--bottom">
        <section className="kv-tab__intel-card">
          <div className="kv-tab__intel-card-title">推荐入口页</div>
          <div className="kv-tab__intel-card-subtitle">最适合作为目录、总纲与总入口的页面</div>
          <div className="kv-tab__intel-anchor-list">
            {intelligence.anchors.map(anchor => (
              <button
                key={anchor.pageId}
                className="kv-tab__intel-anchor"
                onClick={() => onSelectPage(anchor.pageId)}
              >
                <div className="kv-tab__intel-anchor-top">
                  <span className="kv-tab__list-item-badge">{anchor.category}</span>
                  <span className="kv-tab__intel-anchor-score">{Math.round(anchor.score)}</span>
                </div>
                <div className="kv-tab__intel-anchor-title">{anchor.title}</div>
                <div className="kv-tab__intel-anchor-reason">{anchor.reason}</div>
                {anchor.tags.length > 0 && (
                  <div className="kv-tab__intel-chip-row">
                    {anchor.tags.map(tag => (
                      <span key={tag} className="kv-tab__intel-chip">{tag}</span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        <section className="kv-tab__intel-card">
          <div className="kv-tab__intel-card-title">桥接机会</div>
          <div className="kv-tab__intel-card-subtitle">最值得做成桥梁页或专题页的组合</div>
          <div className="kv-tab__intel-opportunity-list">
            {intelligence.opportunities.map(opportunity => (
              <div key={opportunity.id} className="kv-tab__intel-opportunity">
                <div className="kv-tab__intel-opportunity-top">
                  <span className="kv-tab__intel-opportunity-score">{opportunity.score.toFixed(1)}</span>
                  <span className="kv-tab__intel-opportunity-reason">{opportunity.reason}</span>
                </div>
                <div className="kv-tab__intel-opportunity-links">
                  <button onClick={() => onSelectPage(opportunity.pageAId)}>
                    {getPageTitle(pages, opportunity.pageAId)}
                  </button>
                  <span>×</span>
                  <button onClick={() => onSelectPage(opportunity.pageBId)}>
                    {getPageTitle(pages, opportunity.pageBId)}
                  </button>
                </div>
                {opportunity.sharedTags.length > 0 && (
                  <div className="kv-tab__intel-chip-row">
                    {opportunity.sharedTags.map(tag => (
                      <span key={tag} className="kv-tab__intel-chip">{tag}</span>
                    ))}
                  </div>
                )}
                <div className="kv-tab__intel-opportunity-prompt">{opportunity.prompt}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="kv-tab__intel-card kv-tab__intel-card--wide">
          <div className="kv-tab__intel-card-title">标签热区</div>
          <div className="kv-tab__intel-card-subtitle">高频标签与近期抬头的线索</div>
          <div className="kv-tab__intel-tag-cloud">
            {intelligence.tags.map(tag => (
              <div key={tag.tag} className="kv-tab__intel-tag">
                <span className="kv-tab__intel-tag-name">{tag.tag}</span>
                <span className="kv-tab__intel-tag-count">{tag.count}</span>
                {tag.delta > 0 && <span className="kv-tab__intel-tag-delta">+{tag.delta}</span>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
