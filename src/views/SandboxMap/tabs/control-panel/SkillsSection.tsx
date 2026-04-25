/**
 * SkillsSection — Skills 管理面板子组件
 * 从 ControlPanelTab 中拆分，负责技能的显示、开关和分类管理
 */
import CollapsibleSection from '../../../../components/CollapsibleSection'
import {
  SKILL_CATEGORIES,
  Skill,
  SkillCategory,
  getSkillStats,
} from '../../../../lib/skills/registry'

/** 从 getSkillStats 推断出的统计类型 */
type SkillStats = ReturnType<typeof getSkillStats>

interface SkillsSectionProps {
  skills: Skill[]
  skillStats: SkillStats
  skillsByCategory: Map<SkillCategory, Skill[]>
  onToggleSkill: (id: string) => void
  onToggleCategory: (category: SkillCategory) => void
}

export default function SkillsSection({
  skills,
  skillStats,
  skillsByCategory,
  onToggleSkill,
  onToggleCategory,
}: SkillsSectionProps) {
  return (
    <CollapsibleSection title={`Skills — ${skillStats.enabled}/${skillStats.total} 启用`} defaultOpen={false}>
      <div className="cp__skills">
        {SKILL_CATEGORIES.map(catMeta => {
          const catSkills = skillsByCategory.get(catMeta.id)
          if (!catSkills || catSkills.length === 0) return null
          const enabledInCat = catSkills.filter(s => s.enabled).length
          return (
            <div key={catMeta.id} className="cp__skill-cat">
              <div className="cp__skill-cat-header" onClick={() => onToggleCategory(catMeta.id)}>
                <span className="cp__skill-cat-icon">{catMeta.icon}</span>
                <span className="cp__skill-cat-name">{catMeta.label}</span>
                <span className="cp__skill-cat-count">{enabledInCat}/{catSkills.length}</span>
                <button className="cp__skill-cat-toggle">
                  {enabledInCat === catSkills.length ? '全部禁用' : '全部启用'}
                </button>
              </div>
              <div className="cp__skill-list">
                {catSkills.map(skill => (
                  <div key={skill.id} className={`cp__skill-item ${skill.enabled ? '' : 'cp__skill-item--disabled'}`}>
                    <div className="cp__skill-icon">{skill.icon}</div>
                    <div className="cp__skill-info">
                      <div className="cp__skill-name">
                        {skill.name}
                        <span className={`cp__skill-source cp__skill-source--${skill.source}`}>
                          {skill.source}
                        </span>
                      </div>
                      <div className="cp__skill-desc">{skill.description}</div>
                      {skill.module && (
                        <div className="cp__skill-module">{skill.module}</div>
                      )}
                      {skill.mcpDeps && skill.mcpDeps.length > 0 && (
                        <div className="cp__skill-deps">
                          需要: {skill.mcpDeps.map(d => d.replace('mcp-', '')).join(', ')}
                        </div>
                      )}
                    </div>
                    <button
                      className={`cp__toggle ${skill.enabled ? 'cp__toggle--on' : 'cp__toggle--off'}`}
                      onClick={() => onToggleSkill(skill.id)}
                    >
                      {skill.enabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </CollapsibleSection>
  )
}
