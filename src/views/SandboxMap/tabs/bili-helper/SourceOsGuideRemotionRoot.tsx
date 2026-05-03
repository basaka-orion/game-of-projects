import type { ComponentType } from 'react'
import { Composition, registerRoot } from 'remotion'
import { createSampleBiliWorkspace } from '../../../../lib/bili-helper/state'
import { buildSourceOsGuideState } from '../../../../lib/bili-helper/source-os-guide'
import { SOURCE_OS_GUIDE_DURATION, SOURCE_OS_GUIDE_FPS, SOURCE_OS_GUIDE_SIZE, SourceOsGuideComposition } from './SourceOsGuide'

const defaultGuideState = buildSourceOsGuideState({
  processing: 'idle',
  workspace: createSampleBiliWorkspace(),
  view: 'tutorial',
  artifactMode: 'tutorial',
})

const RemotionGuideComponent = SourceOsGuideComposition as unknown as ComponentType<Record<string, unknown>>

function SourceOsGuideRoot() {
  return (
    <Composition
      id="source-os-guide"
      component={RemotionGuideComponent}
      defaultProps={{ state: defaultGuideState, compact: false, reducedMotion: false }}
      durationInFrames={SOURCE_OS_GUIDE_DURATION}
      fps={SOURCE_OS_GUIDE_FPS}
      width={SOURCE_OS_GUIDE_SIZE.width}
      height={SOURCE_OS_GUIDE_SIZE.height}
    />
  )
}

registerRoot(SourceOsGuideRoot)
