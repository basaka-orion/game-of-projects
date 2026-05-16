export type SecretFindingSeverity = 'possible' | 'likely'

export interface SecretFinding {
  kind: string
  severity: SecretFindingSeverity
  redacted: string
  start: number
  end: number
}

export interface SecretScanReport {
  status: 'clean' | 'quarantine'
  findings: SecretFinding[]
  summary: string
}

interface SecretPattern {
  kind: string
  severity: SecretFindingSeverity
  pattern: RegExp
}

const SECRET_PATTERNS: SecretPattern[] = [
  { kind: 'openai_api_key', severity: 'likely', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'anthropic_api_key', severity: 'likely', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'github_token', severity: 'likely', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g },
  { kind: 'slack_token', severity: 'likely', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { kind: 'telegram_bot_token', severity: 'likely', pattern: /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g },
  { kind: 'aws_access_key', severity: 'likely', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  {
    kind: 'generic_secret_assignment',
    severity: 'possible',
    pattern: /\b(?:api[_-]?key|secret|token|password|passwd|authorization)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=:-]{16,}/gi,
  },
]

function redact(value: string): string {
  const compact = value.replace(/\s+/g, '')
  if (compact.length <= 10) return '[redacted]'
  return `${compact.slice(0, 4)}...${compact.slice(-4)}`
}

export function scanSecrets(text: string): SecretScanReport {
  const findings: SecretFinding[] = []
  const content = String(text || '')

  for (const item of SECRET_PATTERNS) {
    for (const match of content.matchAll(item.pattern)) {
      const value = match[0]
      const start = match.index ?? 0
      findings.push({
        kind: item.kind,
        severity: item.severity,
        redacted: redact(value),
        start,
        end: start + value.length,
      })
    }
  }

  const unique = findings.filter(
    (finding, index) =>
      findings.findIndex(
        (item) => item.kind === finding.kind && item.start === finding.start && item.end === finding.end,
      ) === index,
  )
  const likelyCount = unique.filter((finding) => finding.severity === 'likely').length
  const status = likelyCount > 0 || unique.length >= 2 ? 'quarantine' : 'clean'

  return {
    status,
    findings: unique.slice(0, 12),
    summary:
      status === 'quarantine'
        ? `发现 ${unique.length} 个疑似密钥/令牌信号，来源已进入 quarantine，不参与默认 Agent 上下文。`
        : unique.length > 0
          ? `发现 ${unique.length} 个低置信敏感信号，暂不阻断摄入。`
          : '未发现明显密钥/令牌。',
  }
}

export function hasQuarantinedSecrets(report: SecretScanReport): boolean {
  return report.status === 'quarantine'
}
