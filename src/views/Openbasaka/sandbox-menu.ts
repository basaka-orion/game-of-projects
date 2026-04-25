export type OpenbasakaSandboxMenuAction = 'overview' | 'archive-inbox' | 'profiling' | 'warroom'

export interface OpenbasakaSandboxMenuItem {
  icon: string
  label: string
  hint: string
  action: OpenbasakaSandboxMenuAction
}

export const OPENBASAKA_SANDBOX_MENU_ITEMS: OpenbasakaSandboxMenuItem[] = [
  { icon: '◇', label: '沙盘全景', hint: '项目、记忆、知识与自动化总览', action: 'overview' },
  { icon: '启', label: '启蒙收件箱', hint: '确认可长期沉淀的记忆', action: 'archive-inbox' },
  { icon: '像', label: '画像工坊', hint: '测评、对话与 Boss 画像更新', action: 'profiling' },
  { icon: '推', label: '推演室', hint: '项目评估与多角色战略推演', action: 'warroom' },
]
