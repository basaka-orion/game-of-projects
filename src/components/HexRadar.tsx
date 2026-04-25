import { useRef, useEffect } from 'react'
import './HexRadar.css'

export interface RadarData {
  label: string
  value: number // 0-100
}

interface HexRadarProps {
  data: RadarData[]
  size?: number
  className?: string
}

/** 六边形雷达图 — 奶油线 + 青色填充 + Vignette 发光 */
export default function HexRadar({ data, size = 280, className = '' }: HexRadarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const cx = size / 2
    const cy = size / 2
    const maxR = size * 0.38
    const n = data.length

    ctx.clearRect(0, 0, size, size)

    // 绘制背景网格（3 层）
    for (let ring = 1; ring <= 3; ring++) {
      const r = maxR * (ring / 3)
      ctx.beginPath()
      for (let i = 0; i <= n; i++) {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2
        const x = cx + r * Math.cos(angle)
        const y = cy + r * Math.sin(angle)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = 'rgba(255, 230, 203, 0.1)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // 绘制轴线
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle))
      ctx.strokeStyle = 'rgba(255, 230, 203, 0.08)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // 绘制数据区域
    ctx.beginPath()
    for (let i = 0; i <= n; i++) {
      const idx = i % n
      const angle = (Math.PI * 2 * idx) / n - Math.PI / 2
      const r = maxR * (data[idx].value / 100)
      const x = cx + r * Math.cos(angle)
      const y = cy + r * Math.sin(angle)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.fillStyle = 'rgba(0, 212, 170, 0.15)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(0, 212, 170, 0.6)'
    ctx.lineWidth = 2
    ctx.stroke()

    // 绘制数据点
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2
      const r = maxR * (data[i].value / 100)
      const x = cx + r * Math.cos(angle)
      const y = cy + r * Math.sin(angle)
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#00d4aa'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x, y, 6, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0, 212, 170, 0.2)'
      ctx.fill()
    }

    // 绘制标签
    ctx.font = '11px ui-monospace, SFMono-Regular, monospace'
    ctx.fillStyle = 'rgba(255, 230, 203, 0.7)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2
      const labelR = maxR + 24
      const x = cx + labelR * Math.cos(angle)
      const y = cy + labelR * Math.sin(angle)
      ctx.fillText(data[i].label, x, y)
    }
  }, [data, size])

  return (
    <div className={`hex-radar ${className}`}>
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
      />
    </div>
  )
}
