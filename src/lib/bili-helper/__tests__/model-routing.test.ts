import { describe, expect, it } from 'vitest'
import { describeBaoyuModelRouting, getBaoyuModelRoute } from '../model-routing'

describe('Baoyu model routing', () => {
  it('uses GLM-5.1 for primary structured generation and DeepSeek V4 Flash for review', () => {
    expect(getBaoyuModelRoute('primary-structured').config.model).toBe('glm-5.1')
    expect(getBaoyuModelRoute('flash-review').config.model).toBe('deepseek-v4-flash')
    expect(getBaoyuModelRoute('pro-review').config.model).toBe('deepseek-v4-pro')
    expect(describeBaoyuModelRouting()).toContain('本地 SVG/HTML/Canvas')
  })
})
