export const SANDBOX_TAB_IDS = [
  'overview',
  'neurons',
  'warroom',
  'profiling',
  'synapses',
  'boss',
  'memory',
  'knowledge',
  'workflow',
  'control',
  'scheduler',
  'teams',
  'xiaobai',
] as const

export type SandboxTabId = (typeof SANDBOX_TAB_IDS)[number]

export const SANDBOX_NAVIGATE_EVENT = 'sandbox-map:navigate'

/** 判断字符串是否为沙盘已注册模块 id。 */
export function isSandboxTabId(value: string): value is SandboxTabId {
  return (SANDBOX_TAB_IDS as readonly string[]).includes(value)
}

export function navigateSandboxTab(tab: SandboxTabId) {
  window.dispatchEvent(new CustomEvent(SANDBOX_NAVIGATE_EVENT, { detail: { tab } }))
}
