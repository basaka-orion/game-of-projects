/**
 * AgentAvatar — 智能体头像组件
 * 支持 default（emoji）和 hermes（几何抽象 SVG）两种风格
 * Hermes 风格：确定性生成，基于 name 作为 seed
 */
import './AgentAvatar.css'

interface AgentAvatarProps {
  name: string
  icon?: string
  style?: 'default' | 'hermes'
  color?: string
  size?: number
}

/** 简单确定性哈希 */
function hashSeed(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + ch
    hash |= 0
  }
  return Math.abs(hash)
}

/** 伪随机数生成器（确定性） */
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return s / 2147483647
  }
}

/** 生成 Hermes 风格 SVG */
function generateHermesSVG(name: string, color: string, size: number): string {
  const seed = hashSeed(name)
  const rng = seededRandom(seed)
  const cx = size / 2
  const cy = size / 2

  const shapes: string[] = []

  // 背景渐变
  shapes.push(`<defs>
    <linearGradient id="g_${seed}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${color};stop-opacity:0.15" />
      <stop offset="100%" style="stop-color:${color};stop-opacity:0.05" />
    </linearGradient>
  </defs>`)

  // 背景圆
  shapes.push(`<circle cx="${cx}" cy="${cy}" r="${size * 0.45}" fill="url(#g_${seed})" />`)

  // 几何图案：3-5 个重叠形状
  const count = 3 + Math.floor(rng() * 3)
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2
    const dist = rng() * size * 0.2
    const x = cx + Math.cos(angle) * dist
    const y = cy + Math.sin(angle) * dist
    const r = size * (0.1 + rng() * 0.15)
    const opacity = 0.2 + rng() * 0.4
    const type = Math.floor(rng() * 3)

    if (type === 0) {
      // 三角形
      const pts = Array.from({ length: 3 }, () => {
        const a = rng() * Math.PI * 2
        return `${x + Math.cos(a) * r},${y + Math.sin(a) * r}`
      }).join(' ')
      shapes.push(`<polygon points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" opacity="${opacity}" />`)
    } else if (type === 1) {
      // 六边形
      const pts = Array.from({ length: 6 }, (_, j) => {
        const a = (Math.PI * 2 * j) / 6 + rng() * 0.3
        return `${x + Math.cos(a) * r},${y + Math.sin(a) * r}`
      }).join(' ')
      shapes.push(`<polygon points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" opacity="${opacity}" />`)
    } else {
      // 圆
      shapes.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${color}" stroke-width="1.5" opacity="${opacity}" />`)
    }
  }

  // 中心焦点
  const focalR = size * (0.05 + rng() * 0.08)
  shapes.push(`<circle cx="${cx}" cy="${cy}" r="${focalR}" fill="${color}" opacity="0.7" />`)

  // 连接线
  for (let i = 0; i < 2; i++) {
    const x1 = cx + (rng() - 0.5) * size * 0.5
    const y1 = cy + (rng() - 0.5) * size * 0.5
    const x2 = cx + (rng() - 0.5) * size * 0.5
    const y2 = cy + (rng() - 0.5) * size * 0.5
    shapes.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="0.5" opacity="0.3" />`)
  }

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${shapes.join('')}</svg>`
}

export default function AgentAvatar({ name, icon = '◈', style = 'default', color = '#00d4aa', size = 36 }: AgentAvatarProps) {
  if (style === 'hermes') {
    const svg = generateHermesSVG(name, color, size)
    return (
      <div
        className="agent-avatar agent-avatar--hermes"
        style={{ width: size, height: size, borderColor: color }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    )
  }

  return (
    <div
      className="agent-avatar agent-avatar--default"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {icon}
    </div>
  )
}
