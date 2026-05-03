import { describe, expect, it } from 'vitest'
import { buildWorkflowTestInput, isStaleWorkflowTestInput, resolveWorkflowTestInput } from '../test-input'

describe('workflow test input guards', () => {
  const lumaSenseWorkflow = {
    name: 'iOS App 开发测试｜LumaSense 视觉意识花园',
    goal: '把一个关于 AI 视觉、意识流与认知碰撞的 iOS App 想法推进成可落地成果。',
    workflowType: 'build' as const,
    steps: ['压缩产品承诺', '设计视觉语言', '规划 SwiftUI 技术架构'],
  }

  it('detects the stale LumaDesk demo input after the workflow changes to LumaSense', () => {
    const staleInput = '请用这个工作流设计一个新的 Mac App：LumaDesk 灵感航海仪。'

    expect(isStaleWorkflowTestInput(lumaSenseWorkflow, staleInput)).toBe(true)
    expect(resolveWorkflowTestInput({ ...lumaSenseWorkflow, lastTestInput: staleInput })).toContain('LumaSense')
    expect(resolveWorkflowTestInput({ ...lumaSenseWorkflow, lastTestInput: staleInput })).not.toContain('LumaDesk')
  })

  it('builds a current-task input that reminds the model not to reuse old projects', () => {
    const input = buildWorkflowTestInput(lumaSenseWorkflow)

    expect(input).toContain('iOS App 开发测试｜LumaSense 视觉意识花园')
    expect(input).toContain('不要引用历史示例')
    expect(input).toContain('真实电脑动作')
  })
})
