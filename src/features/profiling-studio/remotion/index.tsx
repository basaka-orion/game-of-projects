import React from 'react';
import { Composition, registerRoot, type CalculateMetadataFunction } from 'remotion';
import type { RemotionNarrativeBundle } from '../utils/remotion-bundle';
import NarrativeRevealComposition from './NarrativeRevealComposition';
import { createFallbackRemotionBundle } from './fallbackBundle';

type NarrativeCompositionProps = {
  bundle: RemotionNarrativeBundle;
  layout?: 'portrait' | 'landscape';
};

const FALLBACK_BUNDLE = createFallbackRemotionBundle();

const calculateMetadata: CalculateMetadataFunction<NarrativeCompositionProps> = ({ props, compositionId }) => {
  const bundle = props.bundle || FALLBACK_BUNDLE;
  const composition = bundle.compositions.find((item) => item.id === compositionId) ||
    FALLBACK_BUNDLE.compositions.find((item) => item.id === compositionId) ||
    FALLBACK_BUNDLE.compositions[0];

  return {
    durationInFrames: composition.durationInFrames,
    fps: composition.fps,
    width: composition.width,
    height: composition.height,
    props: {
      bundle,
      layout: composition.id === 'portrait-reveal' ? 'portrait' : 'landscape',
    },
  };
};

const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="portrait-reveal"
        component={NarrativeRevealComposition}
        defaultProps={{ bundle: FALLBACK_BUNDLE, layout: 'portrait' }}
        durationInFrames={FALLBACK_BUNDLE.compositions[0].durationInFrames}
        fps={FALLBACK_BUNDLE.compositions[0].fps}
        width={FALLBACK_BUNDLE.compositions[0].width}
        height={FALLBACK_BUNDLE.compositions[0].height}
        calculateMetadata={calculateMetadata}
      />
      <Composition
        id="landscape-brief"
        component={NarrativeRevealComposition}
        defaultProps={{ bundle: FALLBACK_BUNDLE, layout: 'landscape' }}
        durationInFrames={FALLBACK_BUNDLE.compositions[1].durationInFrames}
        fps={FALLBACK_BUNDLE.compositions[1].fps}
        width={FALLBACK_BUNDLE.compositions[1].width}
        height={FALLBACK_BUNDLE.compositions[1].height}
        calculateMetadata={calculateMetadata}
      />
    </>
  );
};

registerRoot(Root);
