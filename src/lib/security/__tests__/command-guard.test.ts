/**
 * 命令执行安全层测试
 */
import { describe, it, expect } from 'vitest'
import { validateCommand } from '../command-guard'

describe('Command Guard', () => {
  describe('validateCommand', () => {
    // ✅ 应该通过
    it('允许 open 命令', () => {
      expect(validateCommand('open /Users/test').allowed).toBe(true)
    })

    it('允许 npm install', () => {
      expect(validateCommand('npm install').allowed).toBe(true)
    })

    it('允许 npx 命令', () => {
      expect(validateCommand('npx -y @anthropic/mcp-server-fetch').allowed).toBe(true)
    })

    it('允许 git status', () => {
      expect(validateCommand('git status').allowed).toBe(true)
    })

    it('允许 curl 请求', () => {
      expect(validateCommand('curl https://api.example.com').allowed).toBe(true)
    })

    it('允许 node 执行', () => {
      expect(validateCommand('node --version').allowed).toBe(true)
    })

    it('允许 xcodebuild 做本地构建验证', () => {
      expect(validateCommand('xcodebuild -project /tmp/App.xcodeproj -target App build').allowed).toBe(true)
    })

    it('允许 bash 执行本地生成的 macOS Run 脚本', () => {
      const result = validateCommand("bash '/Users/apple/Desktop/【项目的游戏】/deliveries/obr_x/macos-app/script/build_and_run.sh' --verify")
      expect(result.allowed).toBe(true)
    })

    // ❌ 应该拒绝
    it('拒绝 rm -rf /', () => {
      const result = validateCommand('rm -rf /')
      expect(result.allowed).toBe(false)
    })

    it('拒绝 rm -rf ~', () => {
      const result = validateCommand('rm -rf ~')
      expect(result.allowed).toBe(false)
    })

    it('拒绝 sudo rm', () => {
      const result = validateCommand('sudo rm -rf /etc')
      expect(result.allowed).toBe(false)
    })

    it('拒绝不在白名单的命令', () => {
      const result = validateCommand('nc -lvp 4444')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('不在白名单')
    })

    it('拒绝空命令', () => {
      expect(validateCommand('').allowed).toBe(false)
      expect(validateCommand('   ').allowed).toBe(false)
    })

    it('拒绝 fork bomb', () => {
      expect(validateCommand(':(){:|:&};:').allowed).toBe(false)
    })

    // ⚠️ 警告但允许
    it('含管道的命令标记警告但允许', () => {
      const result = validateCommand('git log && echo done')
      expect(result.allowed).toBe(true)
      expect(result.reason).toContain('shell 元字符')
    })
  })
})
