export type SandboxTabId =
  | 'overview'
  | 'neurons'
  | 'warroom'
  | 'profiling'
  | 'synapses'
  | 'boss'
  | 'memory'
  | 'knowledge'
  | 'control'
  | 'scheduler'
  | 'teams'
  | 'xiaobai'

export const SANDBOX_NAVIGATE_EVENT = 'sandbox-map:navigate'

export function navigateSandboxTab(tab: SandboxTabId) {
  window.dispatchEvent(new CustomEvent(SANDBOX_NAVIGATE_EVENT, { detail: { tab } }))
}
