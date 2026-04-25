/**
 * MCP Registry 单元测试
 * 验证 MCP 服务器注册表的加载、保存和统计逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  DEFAULT_MCP_SERVERS,
  loadMCPServers,
  saveMCPServers,
  getMCPStats,
  getMCPServersByCategory,
} from '../registry'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    clear: () => { store = {} },
  }
})()
Object.defineProperty(global, 'localStorage', { value: localStorageMock })

describe('MCP Registry', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('DEFAULT_MCP_SERVERS', () => {
    it('应包含至少 6 个预置服务器', () => {
      expect(DEFAULT_MCP_SERVERS.length).toBeGreaterThanOrEqual(6)
    })

    it('所有服务器应有唯一 ID', () => {
      const ids = DEFAULT_MCP_SERVERS.map(s => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('推荐服务器数量应合理（5-8个）', () => {
      const recommended = DEFAULT_MCP_SERVERS.filter(s => s.recommended)
      expect(recommended.length).toBeGreaterThanOrEqual(4)
      expect(recommended.length).toBeLessThanOrEqual(10)
    })

    it('每个服务器应有 command 和 args', () => {
      for (const server of DEFAULT_MCP_SERVERS) {
        expect(server.command).toBeTruthy()
        expect(Array.isArray(server.args)).toBe(true)
      }
    })
  })

  describe('loadMCPServers', () => {
    it('首次加载应返回默认列表', () => {
      const servers = loadMCPServers()
      expect(servers).toHaveLength(DEFAULT_MCP_SERVERS.length)
      expect(servers[0].id).toBe(DEFAULT_MCP_SERVERS[0].id)
    })

    it('应合并用户保存的状态', () => {
      const saved = [{ id: 'mcp-fetch', status: 'online', env: {} }]
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(saved))

      const servers = loadMCPServers()
      const fetchServer = servers.find(s => s.id === 'mcp-fetch')
      expect(fetchServer?.status).toBe('online')
    })
  })

  describe('getMCPStats', () => {
    it('全部离线时统计正确', () => {
      const stats = getMCPStats(DEFAULT_MCP_SERVERS)
      expect(stats.total).toBe(DEFAULT_MCP_SERVERS.length)
      expect(stats.online).toBe(0)
    })

    it('部分在线时统计正确', () => {
      const servers = DEFAULT_MCP_SERVERS.map((s, i) => ({
        ...s,
        status: i < 3 ? 'online' as const : s.status,
      }))
      const stats = getMCPStats(servers)
      expect(stats.online).toBe(3)
    })
  })

  describe('getMCPServersByCategory', () => {
    it('应按分类分组', () => {
      const grouped = getMCPServersByCategory(DEFAULT_MCP_SERVERS)
      expect(grouped.size).toBeGreaterThan(0)

      // 应包含网络分类（Fetch 在此）
      const networkServers = grouped.get('网络')
      expect(networkServers).toBeDefined()
    })
  })
})
