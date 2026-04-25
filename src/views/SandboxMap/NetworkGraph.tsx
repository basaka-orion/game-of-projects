/**
 * 神经元-突触网络图 — Canvas 力导向布局
 * 零外部依赖，纯 Canvas 2D 绘制
 */
import { useRef, useEffect, useCallback } from 'react'
import type { SynapseRow } from '../../lib/db/repository'

interface Node {
  id: string
  title: string
  survivalRate: number
  survivalGrade: string
  industry: string
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  isBoss?: boolean
}

interface Edge {
  source: string
  target: string
  type: string
  strength: number
}

interface NetworkGraphProps {
  projects: Array<{
    id: string
    title: string
    survivalRate: number
    survivalGrade: string
    industry?: string
  }>
  synapses: SynapseRow[]
  selectedId: string | null
  onSelectNode: (id: string | null) => void
  width?: number
  height?: number
}

const TYPE_COLORS: Record<string, string> = {
  complementary: '#00d4aa',
  sequential: '#6366f1',
  synergistic: '#f59e0b',
  conflicting: '#ef4444',
  inspiration: '#a78bfa',
  'skill-transfer': '#06b6d4',
}

const GRADE_COLORS: Record<string, string> = {
  S: '#00d4aa',
  A: '#00d4aa',
  B: '#f59e0b',
  C: '#f59e0b',
  D: '#ef4444',
  F: '#ef4444',
}

export default function NetworkGraph({
  projects,
  synapses,
  selectedId,
  onSelectNode,
  width = 800,
  height = 600,
}: NetworkGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodesRef = useRef<Node[]>([])
  const edgesRef = useRef<Edge[]>([])
  const animRef = useRef<number>(0)
  const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({ nodeId: null, offsetX: 0, offsetY: 0 })

  // 初始化节点和边
  useEffect(() => {
    const cx = width / 2
    const cy = height / 2

    // Boss 中心节点
    const nodes: Node[] = [{
      id: '__boss__',
      title: 'Boss',
      survivalRate: 100,
      survivalGrade: 'S',
      industry: '',
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      radius: 24,
      isBoss: true,
    }]

    // 项目节点，围绕中心分布
    const count = projects.length
    projects.forEach((p, i) => {
      const angle = (2 * Math.PI * i) / Math.max(count, 1) - Math.PI / 2
      const dist = Math.min(width, height) * 0.3
      const radius = 12 + (p.survivalRate / 100) * 10
      nodes.push({
        id: p.id,
        title: p.title,
        survivalRate: p.survivalRate,
        survivalGrade: p.survivalGrade,
        industry: p.industry || '',
        x: cx + Math.cos(angle) * dist + (Math.random() - 0.5) * 40,
        y: cy + Math.sin(angle) * dist + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        radius,
      })
    })

    // Boss 到每个项目的连线
    const edges: Edge[] = projects.map(p => ({
      source: '__boss__',
      target: p.id,
      type: 'inspiration',
      strength: 30,
    }))

    // 突触连线
    synapses.forEach(s => {
      edges.push({
        source: s.source_id,
        target: s.target_id,
        type: s.type,
        strength: s.strength,
      })
    })

    nodesRef.current = nodes
    edgesRef.current = edges
  }, [projects, synapses, width, height])

  // 力导向模拟 + 绘制
  const tick = useCallback(() => {
    const nodes = nodesRef.current
    const edges = edgesRef.current
    if (!nodes.length) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.scale(dpr, dpr)

    // 力模拟（简单版）
    const cx = width / 2
    const cy = height / 2

    // 中心引力
    for (const node of nodes) {
      if (node.isBoss) continue
      node.vx += (cx - node.x) * 0.001
      node.vy += (cy - node.y) * 0.001
    }

    // 节点间斥力
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x
        const dy = nodes[j].y - nodes[i].y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = 800 / (dist * dist)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        nodes[i].vx -= fx
        nodes[i].vy -= fy
        nodes[j].vx += fx
        nodes[j].vy += fy
      }
    }

    // 弹簧力（边）
    for (const edge of edges) {
      const source = nodes.find(n => n.id === edge.source)
      const target = nodes.find(n => n.id === edge.target)
      if (!source || !target) continue

      const dx = target.x - source.x
      const dy = target.y - source.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const idealDist = 120 + (100 - edge.strength) * 0.5
      const force = (dist - idealDist) * 0.003
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      source.vx += fx
      source.vy += fy
      target.vx -= fx
      target.vy -= fy
    }

    // 更新位置（带阻尼）
    for (const node of nodes) {
      if (dragRef.current.nodeId === node.id) continue
      node.vx *= 0.9
      node.vy *= 0.9
      node.x += node.vx
      node.y += node.vy
      // 边界约束
      node.x = Math.max(node.radius + 10, Math.min(width - node.radius - 10, node.x))
      node.y = Math.max(node.radius + 10, Math.min(height - node.radius - 10, node.y))
    }

    // 清空画布
    ctx.fillStyle = '#041c1c'
    ctx.fillRect(0, 0, width, height)

    // 绘制边
    for (const edge of edges) {
      const source = nodes.find(n => n.id === edge.source)
      const target = nodes.find(n => n.id === edge.target)
      if (!source || !target) continue

      const isBossEdge = edge.source === '__boss__'
      const alpha = isBossEdge ? 0.15 : Math.max(0.2, edge.strength / 100)

      ctx.beginPath()
      ctx.moveTo(source.x, source.y)
      ctx.lineTo(target.x, target.y)
      ctx.strokeStyle = isBossEdge
        ? `rgba(0, 212, 170, ${alpha})`
        : TYPE_COLORS[edge.type] || '#666'
      ctx.globalAlpha = alpha
      ctx.lineWidth = isBossEdge ? 1 : 1 + (edge.strength / 100) * 2
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // 绘制节点
    for (const node of nodes) {
      const isSelected = node.id === selectedId
      const color = node.isBoss ? '#f59e0b' : (GRADE_COLORS[node.survivalGrade] || '#666')

      // 光晕
      if (isSelected || node.isBoss) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2)
        ctx.fillStyle = node.isBoss ? 'rgba(245, 158, 11, 0.15)' : 'rgba(0, 212, 170, 0.15)'
        ctx.fill()
      }

      // 节点圆
      ctx.beginPath()
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
      ctx.fillStyle = node.isBoss ? '#f59e0b' : color
      ctx.globalAlpha = isSelected ? 1 : 0.8
      ctx.fill()
      ctx.globalAlpha = 1

      // 边框
      if (isSelected) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // 标签
      ctx.fillStyle = '#d4cfc4'
      ctx.font = `${node.isBoss ? '700' : '500'} ${node.isBoss ? 11 : 9}px "Inter", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const label = node.isBoss ? '👑 Boss' : node.title.length > 10 ? node.title.slice(0, 10) + '…' : node.title
      ctx.fillText(label, node.x, node.y + node.radius + 4)

      // 存活率
      if (!node.isBoss) {
        ctx.fillStyle = color
        ctx.font = '700 8px "Inter", monospace'
        ctx.fillText(`${node.survivalRate}%`, node.x, node.y - node.radius - 10)
      }
    }

    ctx.restore()
    animRef.current = requestAnimationFrame(tick)
  }, [width, height, selectedId])

  useEffect(() => {
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [tick])

  // 点击检测
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const node = nodesRef.current.find(n => {
      const dx = n.x - x
      const dy = n.y - y
      return Math.sqrt(dx * dx + dy * dy) <= n.radius + 4
    })

    onSelectNode(node && !node.isBoss ? node.id : null)
  }, [onSelectNode])

  // 拖拽
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const node = nodesRef.current.find(n => {
      const dx = n.x - x
      const dy = n.y - y
      return Math.sqrt(dx * dx + dy * dy) <= n.radius + 4
    })

    if (node) {
      dragRef.current = { nodeId: node.id, offsetX: x - node.x, offsetY: y - node.y }
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.nodeId) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left - dragRef.current.offsetX
    const y = e.clientY - rect.top - dragRef.current.offsetY

    const node = nodesRef.current.find(n => n.id === dragRef.current.nodeId)
    if (node) {
      node.x = x
      node.y = y
      node.vx = 0
      node.vy = 0
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    dragRef.current = { nodeId: null, offsetX: 0, offsetY: 0 }
  }, [])

  const dpr = window.devicePixelRatio || 1

  return (
    <canvas
      ref={canvasRef}
      width={width * dpr}
      height={height * dpr}
      style={{ width, height, cursor: 'pointer', borderRadius: 'var(--hd-radius-md, 8px)' }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  )
}
