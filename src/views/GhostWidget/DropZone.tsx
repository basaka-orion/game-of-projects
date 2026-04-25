import { useState, useCallback, DragEvent } from 'react'
import './DropZone.css'

interface DropZoneProps {
  onDrop: (content: string, fileName: string) => void
}

/** 万物吞噬拖拽区 */
export default function DropZone({ onDrop }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isAbsorbing, setIsAbsorbing] = useState(false)

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    setIsAbsorbing(true)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      const text = await file.text()
      setTimeout(() => {
        setIsAbsorbing(false)
        onDrop(text, file.name)
      }, 600)
    } else {
      // 拖拽文本
      const text = e.dataTransfer.getData('text/plain')
      if (text) {
        setTimeout(() => {
          setIsAbsorbing(false)
          onDrop(text, '剪贴板文本.txt')
        }, 600)
      } else {
        setIsAbsorbing(false)
      }
    }
  }, [onDrop])

  return (
    <div
      className={`drop-zone ${isDragOver ? 'drop-zone--active' : ''} ${isAbsorbing ? 'hd-absorb' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="drop-zone__icon">
        {isDragOver ? '⚡' : '🧬'}
      </div>
      <div className="drop-zone__text">
        {isDragOver ? '释放以吞噬' : '拖入文件'}
      </div>
    </div>
  )
}
