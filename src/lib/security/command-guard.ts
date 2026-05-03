/**
 * 命令执行安全层 — 白名单与沙箱
 *
 * 所有通过 executeCommand IPC 调用的命令必须经过此模块校验。
 * 防止注入攻击和危险命令执行。
 */

/** 允许执行的命令白名单 */
const ALLOWED_COMMANDS = [
  // 文件系统（只读或安全操作）
  'open',
  'ls',
  'cat',
  'head',
  'tail',
  'find',
  'mkdir',
  'wc',
  'du',
  'which',
  'file',
	  'stat',
	  'rg',
	  'sed',
	  // 包管理（安装/更新）
	  'npm',
  'npx',
  'pnpm',
  'yarn',
  'node',
  // Git（信息查询）
  'git',
  // Python
  'python',
  'python3',
  'pip',
  'pip3',
  // 系统信息
  'uname',
  'sw_vers',
  'whoami',
  'hostname',
  'date',
  'echo',
	  'printf',
	  'ps',
	  'kill',
	  // Xcode / Swift 工具链（用于受控构建与验证）
	  'xcodebuild',
	  'xcode-select',
	  'xcrun',
	  'swift',
	  'swiftc',
	  'screencapture',
  // 网络
  'curl',
  'wget',
  'ping',
  // Electron 相关
  'electron',
  'electron-builder',
] as const

/** 绝对禁止的命令和关键词 */
const BLOCKED_PATTERNS = [
  'rm -rf /',
  'rm -rf ~',
  'sudo rm',
  'mkfs',
  'dd if=',
  'chmod 777',
  ':(){',
  '> /dev/sda',
  'eval(',
  'base64 -d',
  '| bash',
  '| sh',
  '$(curl',
  '`curl',
]

/** 危险的 shell 元字符序列 */
const DANGEROUS_SEQUENCES = [
  '&&', '||', ';', '`', '$(', '${',
]

export interface CommandValidation {
  allowed: boolean
  reason?: string
  sanitized?: string
}

/**
 * 验证命令是否安全可执行
 */
export function validateCommand(command: string): CommandValidation {
  if (!command || !command.trim()) {
    return { allowed: false, reason: '空命令' }
  }

  const trimmed = command.trim()

  // 检查绝对禁止的模式
  for (const pattern of BLOCKED_PATTERNS) {
    if (trimmed.includes(pattern)) {
      return { allowed: false, reason: `包含禁止的命令模式: "${pattern}"` }
    }
  }

  // 提取主命令（第一个 token）
  const mainCommand = trimmed.split(/\s+/)[0]
  
  // 如果是绝对路径，提取命令名
  const commandName = mainCommand.includes('/') ? mainCommand.split('/').pop()! : mainCommand

  // 检查是否在白名单中
  const isWhitelisted = (ALLOWED_COMMANDS as readonly string[]).includes(commandName)
  if (!isWhitelisted) {
    return { allowed: false, reason: `命令 "${commandName}" 不在白名单中` }
  }

  // 对含有 shell 元字符的命令发出警告（但不阻止管道等合法用途）
  const hasDangerous = DANGEROUS_SEQUENCES.some(seq => trimmed.includes(seq))
  if (hasDangerous) {
    // 允许但标记，让调用方决定
    return {
      allowed: true,
      reason: '包含 shell 元字符，请确认命令安全性',
      sanitized: trimmed,
    }
  }

  return { allowed: true, sanitized: trimmed }
}

/**
 * 安全执行命令（通过 IPC）
 * 自动进行白名单校验
 */
export async function safeExec(
  command: string,
  timeoutMs = 30000
): Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }> {
  const validation = validateCommand(command)
  if (!validation.allowed) {
    return { success: false, error: `命令被拒绝: ${validation.reason}` }
  }

  const electronAPI = (window as any)?.electronAPI
  if (!electronAPI?.executeCommand) {
    return { success: false, error: 'Electron API 不可用' }
  }

  try {
    return await electronAPI.executeCommand(validation.sanitized, timeoutMs)
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
