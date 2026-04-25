import { useEffect } from 'react'
import IntegratedProfilingApp from '../../features/profiling-studio/IntegratedApp'
import './ProfilingStudio.css'

export default function ProfilingStudio() {
  useEffect(() => {
    document.body.classList.add('profiling-studio-theme')
    return () => {
      document.body.classList.remove('profiling-studio-theme')
    }
  }, [])

  return (
    <div className="profiling-studio-view">
      <IntegratedProfilingApp />
    </div>
  )
}
