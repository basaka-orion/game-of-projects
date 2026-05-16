import { describe, expect, it } from 'vitest'
import { deriveCouncilProjectTitle, redactSensitiveText, sanitizeCouncilFileBaseName } from '../export-safety'

describe('xiaobai council export safety', () => {
  it('redacts API keys before Markdown, HTML, archive, or workflow export', () => {
    const raw = [
      'deepseek-apikey：sk-1234567890abcdef1234567890abcdef',
      'GLM5.1:5317add67a3e413e93cb818ca461bc9d.Bp7iy76Nz9CN3BFg',
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456',
    ].join('\n')

    const safe = redactSensitiveText(raw)

    expect(safe).not.toContain('sk-1234567890abcdef1234567890abcdef')
    expect(safe).not.toContain('5317add67a3e413e93cb818ca461bc9d.Bp7iy76Nz9CN3BFg')
    expect(safe).not.toContain('abcdefghijklmnopqrstuvwxyz123456')
    expect(safe).toContain('[REDACTED]')
  })

  it('derives project names instead of exporting generic council titles', () => {
    expect(deriveCouncilProjectTitle('几千篇文章进入 mempalace，生成 soul.md 的 Mac 桌面端 app')).toBe('Soul.md 记忆宫殿 Mac App')
    expect(deriveCouncilProjectTitle('女性出门根据天气准备包包的 iOS app')).toBe('包里晴雨签 iOS App')
    expect(deriveCouncilProjectTitle('随便一个项目', '# 小白智囊团大师共识 PRD')).toBe('OpenBasaka 项目共识 PRD')
    expect(sanitizeCouncilFileBaseName('Soul.md 记忆宫殿 Mac App｜小白智囊团')).toContain('Soul.md')
  })
})
