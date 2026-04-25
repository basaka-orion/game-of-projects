/**
 * WorkflowDiagram — 工作流 DAG 可视化
 *
 * 纯 CSS + div 实现，不引入外部图表库
 * 接收 TeamTask[]，渲染节点 + CSS 箭头连线
 */
import { useMemo } from 'react'
import { TeamTask } from '../../../lib/teams/types'
import './WorkflowDiagram.css'

interface Props {
  tasks: TeamTask[]
  agents: { id: string; name: string; icon: string }[]
}

const AGENT_COLORS: Record<string, string> = {
  strategy: '#00d4aa',
  technical: '#3b82f6',
  market: '#f59e0b',
  creative: '#8b5cf6',
  critic: '#ef4444',
  general: '#06b6d4',
}

function getAgentColor(agentId: string): string {
  for (const [key, color] of Object.entries(AGENT_COLORS)) {
    if (agentId.includes(key)) return color
  }
  return '#00d4aa'
}

export default function WorkflowDiagram({ tasks, agents }: Props) {
  if (tasks.length === 0) return null

  // 拓扑排序
  const sorted = useMemo(() => {
    const inDegree = new Map<string, number>()
    const adj = new Map<string, string[]>()

    tasks.forEach(t => {
      inDegree.set(t.id, t.dependsOn?.length || 0)
      adj.set(t.id, [])
    })
    tasks.forEach(t => {
      (t.dependsOn || []).forEach(dep => {
        adj.get(dep)?.push(t.id)
      })
    })

    const result: TeamTask[] = []
    const queue = tasks.filter(t => (inDegree.get(t.id) || 0) === 0)

    while (queue.length > 0) {
      const node = queue.shift()!
      result.push(node)
      for (const next of (adj.get(node.id) || [])) {
        const deg = (inDegree.get(next) || 1) - 1
        inDegree.set(next, deg)
        if (deg === 0) {
          const t = tasks.find(t => t.id === next)
          if (t) queue.push(t)
        }
      }
    }

    // 如果有环，追加未处理的
    if (result.length < tasks.length) {
      for (const t of tasks) {
        if (!result.includes(t)) result.push(t)
      }
    }

    return result
  }, [tasks])

  // 分层：按最长依赖路径分层
  const layers = useMemo(() => {
    const depth = new Map<string, number>()
    const compute = (id: string): number => {
      if (depth.has(id)) return depth.get(id)!
      const task = tasks.find(t => t.id === id)
      if (!task || !task.dependsOn || task.dependsOn.length === 0) {
        depth.set(id, 0)
        return 0
      }
      const d = Math.max(...task.dependsOn.map(compute)) + 1
      depth.set(id, d)
      return d
    }
    tasks.forEach(t => compute(t.id))

    const maxDepth = Math.max(...Array.from(depth.values()), 0)
    const result: TeamTask[][] = Array.from({ length: maxDepth + 1 }, () => [])
    sorted.forEach(t => {
      const d = depth.get(t.id) || 0
      result[d].push(t)
    })
    return result
  }, [sorted, tasks])

  // 获取依赖线条
  const edges = useMemo(() => {
    const result: Array<{ from: string; to: string }> = []
    tasks.forEach(t => {
      (t.dependsOn || []).forEach(dep => {
        result.push({ from: dep, to: t.id })
      })
    })
    return result
  }, [tasks])

  return (
    <div className="workflow-diagram">
      <div className="workflow-diagram__label">工作流</div>
      <div className="workflow-diagram__canvas">
        {layers.map((layer, li) => (
          <div key={li} className="workflow-diagram__layer">
            {layer.map(task => {
              const agent = agents.find(a => a.id === task.assignedAgent)
              const color = getAgentColor(task.assignedAgent)
              return (
                <div
                  key={task.id}
                  className="workflow-diagram__node"
                  style={{ borderColor: color }}
                >
                  <span className="workflow-diagram__node-icon" style={{ color }}>
                    {agent?.icon || '◈'}
                  </span>
                  <span className="workflow-diagram__node-name">{task.description}</span>
                  {li < layers.length - 1 && (
                    <span className="workflow-diagram__arrow" style={{ color }}>→</span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        {edges.length > 0 && (
          <div className="workflow-diagram__edges">
            {edges.map((e, i) => (
              <div key={i} className="workflow-diagram__edge">
                <span className="workflow-diagram__edge-from">{tasks.find(t => t.id === e.from)?.description?.slice(0, 12)}...</span>
                <span className="workflow-diagram__edge-arrow">→</span>
                <span className="workflow-diagram__edge-to">{tasks.find(t => t.id === e.to)?.description?.slice(0, 12)}...</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
