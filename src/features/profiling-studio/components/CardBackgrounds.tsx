// ── Card Background Art ──
// Semi-transparent abstract line drawings for dimension cards

interface BgArtProps {
  opacity?: number;
  color?: string;
}

// 认知 — Dendrite branches / neural tree
export function CognitiveBgArt({ opacity = 0.04, color = '#64FFDA' }: BgArtProps) {
  return (
    <svg viewBox="0 0 200 200" style={{ position: 'absolute', right: -10, bottom: -10, width: '60%', height: '80%', opacity, pointerEvents: 'none' }}>
      <g stroke={color} fill="none" strokeWidth="1.2">
        <path d="M160 180C140 150 120 140 100 130C80 120 70 100 80 80C90 60 110 50 120 60C130 70 125 90 110 95C95 100 85 90 90 80" />
        <path d="M100 130C110 110 130 100 150 110" />
        <path d="M80 80C60 70 50 50 60 40" />
        <path d="M120 60C140 50 155 60 155 75" />
        <circle cx="160" cy="180" r="3" fill={color} />
        <circle cx="90" cy="80" r="2" fill={color} />
        <circle cx="60" cy="40" r="2" fill={color} />
        <circle cx="155" cy="75" r="2" fill={color} />
        <circle cx="150" cy="110" r="2" fill={color} />
      </g>
    </svg>
  );
}

// 人格 — Mask silhouette profiles
export function PersonalityBgArt({ opacity = 0.04, color = '#BB86FC' }: BgArtProps) {
  return (
    <svg viewBox="0 0 200 200" style={{ position: 'absolute', right: -10, bottom: -10, width: '55%', height: '75%', opacity, pointerEvents: 'none' }}>
      <g stroke={color} fill="none" strokeWidth="1">
        {/* Face profile 1 */}
        <path d="M100 30C120 30 135 45 135 65C135 75 130 85 125 90L130 110C130 120 125 130 115 135L110 170" strokeWidth="1.5" />
        {/* Face profile 2, mirrored */}
        <path d="M100 30C80 30 65 45 65 65C65 75 70 85 75 90L70 110C70 120 75 130 85 135L90 170" strokeWidth="1" strokeDasharray="4 4" />
        {/* Eye */}
        <ellipse cx="110" cy="65" rx="8" ry="5" />
        <circle cx="112" cy="65" r="2" fill={color} />
        {/* Inner lines */}
        <path d="M95 80Q100 95 105 80" />
      </g>
    </svg>
  );
}

// 情感 — Waves / emotional tides
export function EmotionBgArt({ opacity = 0.04, color = '#FF6B6B' }: BgArtProps) {
  return (
    <svg viewBox="0 0 200 200" style={{ position: 'absolute', right: -10, bottom: -10, width: '65%', height: '75%', opacity, pointerEvents: 'none' }}>
      <g stroke={color} fill="none" strokeWidth="1.2">
        <path d="M10 100Q35 70 60 100Q85 130 110 100Q135 70 160 100Q185 130 200 100" />
        <path d="M10 120Q35 90 60 120Q85 150 110 120Q135 90 160 120Q185 150 200 120" strokeWidth="0.8" />
        <path d="M10 140Q35 115 60 140Q85 165 110 140Q135 115 160 140Q185 165 200 140" strokeWidth="0.5" />
        <path d="M10 80Q35 55 60 80Q85 105 110 80Q135 55 160 80Q185 105 200 80" strokeWidth="0.5" />
        {/* Tear drop */}
        <path d="M150 50C150 50 140 65 140 72C140 78 145 82 150 82C155 82 160 78 160 72C160 65 150 50 150 50Z" fill={color} strokeWidth="0" />
      </g>
    </svg>
  );
}

// 动机 — Mountain peaks / ascending path
export function MotivationBgArt({ opacity = 0.04, color = '#FFD700' }: BgArtProps) {
  return (
    <svg viewBox="0 0 200 200" style={{ position: 'absolute', right: -10, bottom: -10, width: '60%', height: '80%', opacity, pointerEvents: 'none' }}>
      <g stroke={color} fill="none" strokeWidth="1.2">
        {/* Mountains */}
        <path d="M0 180L40 100L60 130L100 50L120 90L160 30L200 180" />
        <path d="M0 180L30 130L50 150L80 90L100 120L130 70L160 110L200 180" strokeWidth="0.6" strokeDasharray="3 3" />
        {/* Star at peak */}
        <path d="M160 30L163 24L166 30L172 30L167 34L169 40L163 36L157 40L159 34L154 30Z" fill={color} />
        {/* Path upward */}
        <path d="M30 180C50 170 60 160 70 140C80 120 90 100 100 90" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

// 社会 — Network graph / connections
export function SocialBgArt({ opacity = 0.04, color = '#4FC3F7' }: BgArtProps) {
  return (
    <svg viewBox="0 0 200 200" style={{ position: 'absolute', right: -10, bottom: -10, width: '60%', height: '80%', opacity, pointerEvents: 'none' }}>
      <g stroke={color} fill="none" strokeWidth="0.8">
        {/* Nodes */}
        <circle cx="100" cy="80" r="12" strokeWidth="1.5" fill={`${color}08`} />
        <circle cx="50" cy="140" r="8" strokeWidth="1" fill={`${color}05`} />
        <circle cx="150" cy="140" r="8" strokeWidth="1" fill={`${color}05`} />
        <circle cx="40" cy="60" r="5" fill={`${color}08`} />
        <circle cx="160" cy="60" r="5" fill={`${color}08`} />
        <circle cx="100" cy="180" r="6" fill={`${color}05`} />
        {/* Connections */}
        <path d="M100 92L50 132M100 92L150 132M50 140L100 174L150 140M45 60L88 76M112 76L155 60" strokeWidth="1" />
        <path d="M50 140L40 60M150 140L160 60" strokeWidth="0.5" strokeDasharray="3 4" />
      </g>
    </svg>
  );
}

// 审美 — Flowing curves / abstract floral
export function AestheticBgArt({ opacity = 0.04, color = '#FF80AB' }: BgArtProps) {
  return (
    <svg viewBox="0 0 200 200" style={{ position: 'absolute', right: -10, bottom: -10, width: '60%', height: '80%', opacity, pointerEvents: 'none' }}>
      <g stroke={color} fill="none" strokeWidth="1">
        {/* Spiral */}
        <path d="M100 100C100 90 110 80 120 80C130 80 140 90 140 100C140 115 125 130 110 130C90 130 75 115 75 95C75 70 95 50 120 50C150 50 170 75 170 105C170 140 145 165 110 165C70 165 45 135 45 95" strokeWidth="1.5" />
        {/* Decorative petals */}
        <path d="M100 100Q80 70 110 60Q100 90 100 100" fill={color} />
        <path d="M100 100Q130 70 140 100Q110 90 100 100" fill={color} />
        <path d="M100 100Q130 130 110 140Q110 110 100 100" fill={color} />
        <circle cx="100" cy="100" r="3" fill={color} />
      </g>
    </svg>
  );
}

// 世界观 — Constellation map
export function WorldviewBgArt({ opacity = 0.04, color = '#E040FB' }: BgArtProps) {
  return (
    <svg viewBox="0 0 200 200" style={{ position: 'absolute', right: -10, bottom: -10, width: '60%', height: '80%', opacity, pointerEvents: 'none' }}>
      <g stroke={color} fill="none">
        {/* Stars */}
        <circle cx="80" cy="40" r="2.5" fill={color} />
        <circle cx="140" cy="50" r="3" fill={color} />
        <circle cx="60" cy="100" r="2" fill={color} />
        <circle cx="160" cy="90" r="1.5" fill={color} />
        <circle cx="100" cy="140" r="2.5" fill={color} />
        <circle cx="40" cy="160" r="1.5" fill={color} />
        <circle cx="170" cy="150" r="2" fill={color} />
        <circle cx="120" cy="70" r="1" fill={color} />
        {/* Constellation lines */}
        <path d="M80 40L120 70L140 50" strokeWidth="0.8" />
        <path d="M120 70L160 90L170 150" strokeWidth="0.8" />
        <path d="M120 70L100 140L40 160" strokeWidth="0.8" />
        <path d="M60 100L80 40" strokeWidth="0.5" strokeDasharray="3 4" />
        <path d="M60 100L100 140" strokeWidth="0.5" strokeDasharray="3 4" />
        {/* Nebula */}
        <ellipse cx="120" cy="70" rx="25" ry="15" strokeWidth="0.5" strokeDasharray="2 3" />
      </g>
    </svg>
  );
}

// ── Mapping ──
export const DIMENSION_BG_ART: Record<string, React.FC<BgArtProps>> = {
  cognitive: CognitiveBgArt,
  personality: PersonalityBgArt,
  emotion: EmotionBgArt,
  motivation: MotivationBgArt,
  social: SocialBgArt,
  aesthetic: AestheticBgArt,
  worldview: WorldviewBgArt,
};

// ── Path card art (for homepage 4 paths) ──
export function AVGBgArt({ opacity = 0.04, color = '#E040FB' }: BgArtProps) {
  return (
    <svg viewBox="0 0 200 200" style={{ position: 'absolute', right: -5, bottom: -5, width: '50%', height: '70%', opacity, pointerEvents: 'none' }}>
      <g stroke={color} fill="none" strokeWidth="1">
        <path d="M100 30L60 80L80 80L50 140L80 140L30 190" />
        <path d="M100 30L140 80L120 80L150 140L120 140L170 190" />
        <circle cx="100" cy="110" r="15" fill={`${color}10`} />
        <text x="100" y="115" textAnchor="middle" fill={color} fontSize="14">⚡</text>
      </g>
    </svg>
  );
}

export function ScaleBgArt({ opacity = 0.04, color = '#FFD700' }: BgArtProps) {
  return (
    <svg viewBox="0 0 200 200" style={{ position: 'absolute', right: -5, bottom: -5, width: '50%', height: '70%', opacity, pointerEvents: 'none' }}>
      <g stroke={color} fill="none" strokeWidth="1">
        <rect x="40" y="40" width="120" height="140" rx="8" strokeDasharray="4 4" />
        <path d="M60 80H140M60 110H130M60 140H120M60 170H100" strokeWidth="2" strokeLinecap="round" />
        <circle cx="50" cy="80" r="4" fill={color} />
        <circle cx="50" cy="110" r="4" fill={color} />
        <circle cx="50" cy="140" r="4" fill={color} />
        <circle cx="50" cy="170" r="4" fill={color} />
      </g>
    </svg>
  );
}

export function LabBgArt({ opacity = 0.04, color = '#BB86FC' }: BgArtProps) {
  return (
    <svg viewBox="0 0 200 200" style={{ position: 'absolute', right: -5, bottom: -5, width: '50%', height: '70%', opacity, pointerEvents: 'none' }}>
      <g stroke={color} fill="none" strokeWidth="1">
        {/* Flask */}
        <path d="M85 40H115M90 40V100L60 170H140L110 100V40" strokeWidth="1.5" />
        {/* Bubbles */}
        <circle cx="90" cy="130" r="6" fill={`${color}15`} />
        <circle cx="110" cy="145" r="4" fill={`${color}10`} />
        <circle cx="95" cy="155" r="3" fill={`${color}08`} />
        {/* Liquid level */}
        <path d="M72 140Q100 130 128 140" strokeWidth="0.8" />
      </g>
    </svg>
  );
}

export function CATBgArt({ opacity = 0.04, color = '#FF80AB' }: BgArtProps) {
  return (
    <svg viewBox="0 0 200 200" style={{ position: 'absolute', right: -5, bottom: -5, width: '50%', height: '70%', opacity, pointerEvents: 'none' }}>
      <g stroke={color} fill="none" strokeWidth="1">
        {/* Target circles */}
        <circle cx="100" cy="100" r="60" strokeDasharray="4 4" />
        <circle cx="100" cy="100" r="40" />
        <circle cx="100" cy="100" r="20" />
        <circle cx="100" cy="100" r="5" fill={color} />
        {/* Arrow */}
        <path d="M160 40L105 95" strokeWidth="1.5" />
        <path d="M160 40L150 55L155 45Z" fill={color} />
      </g>
    </svg>
  );
}

export const PATH_BG_ART: Record<string, React.FC<BgArtProps>> = {
  avg: AVGBgArt,
  assessment: ScaleBgArt,
  games: LabBgArt,
  cat: CATBgArt,
};
