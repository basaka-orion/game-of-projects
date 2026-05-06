import type { CouncilNuwaEvidencePack, CouncilNuwaEvidenceRegistry } from '../../../../lib/xiaobai-council/distillation-evidence'

const STATUS_LABELS: Record<string, string> = {
  proved: '已证明',
  partial: '部分证据',
  missing: '缺证据',
}

const TRUST_LABELS: Record<CouncilNuwaEvidencePack['trustLevel'], string> = {
  'local-structured': '本地结构化',
  'nuwa-seeded': 'Nuwa 种子',
  'source-audit-ready': '来源复核完成',
}

interface CouncilNuwaEvidenceViewProps {
  registry: CouncilNuwaEvidenceRegistry
  compact?: boolean
}

export function CouncilNuwaEvidenceView({ registry, compact = false }: CouncilNuwaEvidenceViewProps) {
  const packs = compact ? registry.packs.slice(0, 6) : registry.packs
  return (
    <section className="council-nuwa-evidence" aria-label="Nuwa 蒸馏证据总账">
      <div className="council-app__panel-head">
        <div>
          <div className="council-app__section-kicker">Nuwa 蒸馏证据总账 · 95 分硬证据</div>
          <h2>36 位不是一句“已蒸馏”，而是逐个可查的证据包</h2>
          <p>{registry.summary}</p>
        </div>
        <strong>{registry.averageLocalUseScore}</strong>
      </div>

      <div className="council-nuwa-evidence__metrics">
        <article>
          <span>本地可用</span>
          <strong>{registry.localReadyCount}/{registry.personaCount}</strong>
        </article>
        <article>
          <span>Nuwa seed/映射</span>
          <strong>{registry.sourceSeededCount}/{registry.personaCount}</strong>
        </article>
        <article>
          <span>人工来源级复核</span>
          <strong>{registry.manualSourceAuditedCount}/{registry.personaCount}</strong>
        </article>
        <article>
          <span>来源审计分</span>
          <strong>{registry.averageSourceAuditScore}</strong>
        </article>
      </div>

      <div className="council-nuwa-evidence__gaps">
        {registry.gapTo95.map((gap, index) => (
          <p key={gap}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            {gap}
          </p>
        ))}
      </div>

      <div className="council-nuwa-evidence__claims">
        <h3>现在不能声称</h3>
        <p>不能声称 36 位角色已完成真人授权、真人级完整人格复制或来源级人工深蒸馏；当前可信状态是本地结构化 Nuwa skill 可用，来源级复核仍需逐个补证。</p>
      </div>

      <div className="council-nuwa-evidence__packs">
        {packs.map((pack) => (
          <article key={pack.personaId} data-trust={pack.trustLevel}>
            <div>
              <span>{TRUST_LABELS[pack.trustLevel]}</span>
              <h3>{pack.personaName}</h3>
              <small>{pack.statusLabel} · {pack.seedReference}</small>
            </div>
            <div className="council-nuwa-evidence__score">
              <strong>{pack.localUseScore}</strong>
              <span>local</span>
            </div>
            <p>{pack.safeClaim}</p>
            <div className="council-nuwa-evidence__check-row">
              {pack.validationChecks.slice(0, 5).map((check) => (
                <span key={check.id} data-status={check.status}>
                  {check.label} · {STATUS_LABELS[check.status]}
                </span>
              ))}
            </div>
            <details>
              <summary>查看缺口与导出文件</summary>
              <ul>
                {pack.nextManualReview.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <code>{pack.exportFiles.slice(0, 4).join(' / ')}</code>
            </details>
          </article>
        ))}
      </div>
    </section>
  )
}
