import React from 'react';

// ── Dimension SVG icons — Each is a unique, hand-crafted design ──

interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

// 认知架构 — Neural Network / Brain Circuit
export function CognitiveIcon({ size = 28, color = '#64FFDA' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Central node */}
      <circle cx="16" cy="16" r="3.5" fill={color} opacity="0.9" />
      <circle cx="16" cy="16" r="5" stroke={color} strokeWidth="0.8" opacity="0.3" />
      {/* Outer nodes */}
      <circle cx="7" cy="8" r="2" fill={color} opacity="0.6" />
      <circle cx="25" cy="8" r="2" fill={color} opacity="0.6" />
      <circle cx="7" cy="24" r="2" fill={color} opacity="0.6" />
      <circle cx="25" cy="24" r="2" fill={color} opacity="0.6" />
      <circle cx="16" cy="4" r="1.5" fill={color} opacity="0.4" />
      <circle cx="16" cy="28" r="1.5" fill={color} opacity="0.4" />
      {/* Connections */}
      <path d="M16 12.5L7 8M16 12.5L25 8M16 19.5L7 24M16 19.5L25 24M16 12.5V5.5M16 19.5V26.5" 
        stroke={color} strokeWidth="0.8" opacity="0.35" />
      {/* Synaptic arcs */}
      <path d="M9 8C12 11 13 13 16 13" stroke={color} strokeWidth="0.6" opacity="0.25" fill="none" />
      <path d="M23 8C20 11 19 13 16 13" stroke={color} strokeWidth="0.6" opacity="0.25" fill="none" />
    </svg>
  );
}

// 人格结构 — Prism / Crystal facets
export function PersonalityIcon({ size = 28, color = '#BB86FC' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Main prism */}
      <path d="M16 3L28 24H4L16 3Z" stroke={color} strokeWidth="1.2" opacity="0.7" fill={`${color}08`} />
      {/* Inner facets */}
      <path d="M16 3L10 24" stroke={color} strokeWidth="0.6" opacity="0.3" />
      <path d="M16 3L22 24" stroke={color} strokeWidth="0.6" opacity="0.3" />
      <path d="M7 18H25" stroke={color} strokeWidth="0.6" opacity="0.25" />
      {/* Refracted light beams */}
      <path d="M28 24L30 27" stroke={color} strokeWidth="0.8" opacity="0.5" />
      <path d="M28 24L31 25" stroke="#FF80AB" strokeWidth="0.8" opacity="0.4" />
      <path d="M28 24L30 22" stroke="#64FFDA" strokeWidth="0.8" opacity="0.4" />
      {/* Core glow */}
      <circle cx="16" cy="15" r="2.5" fill={color} opacity="0.2" />
      <circle cx="16" cy="15" r="1" fill={color} opacity="0.6" />
    </svg>
  );
}

// 情感系统 — Heartbeat Waveform
export function EmotionIcon({ size = 28, color = '#FF6B6B' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Background pulse */}
      <circle cx="16" cy="16" r="12" stroke={color} strokeWidth="0.5" opacity="0.15" />
      <circle cx="16" cy="16" r="9" stroke={color} strokeWidth="0.5" opacity="0.1" />
      {/* Heart shape */}
      <path d="M16 25C16 25 6 19 6 13C6 10 8.5 8 11 8C13 8 15 9.5 16 11C17 9.5 19 8 21 8C23.5 8 26 10 26 13C26 19 16 25 16 25Z" 
        stroke={color} strokeWidth="1.2" opacity="0.7" fill={`${color}10`} />
      {/* Inner heartbeat line */}
      <path d="M8 16H12L13.5 12L15.5 20L17.5 14L19 16H24" 
        stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
    </svg>
  );
}

// 动机与价值 — Flame Compass
export function MotivationIcon({ size = 28, color = '#FFD700' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Compass ring */}
      <circle cx="16" cy="16" r="12.5" stroke={color} strokeWidth="0.8" opacity="0.3" />
      {/* Direction marks */}
      <path d="M16 3.5V6M16 26V28.5M3.5 16H6M26 16H28.5" stroke={color} strokeWidth="0.8" opacity="0.3" />
      {/* Flame */}
      <path d="M16 7C16 7 10 14 10 18C10 21.3 12.7 24 16 24C19.3 24 22 21.3 22 18C22 14 16 7 16 7Z" 
        fill={`${color}15`} stroke={color} strokeWidth="1" opacity="0.8" />
      {/* Inner flame */}
      <path d="M16 13C16 13 13 17 13 19C13 20.7 14.3 22 16 22C17.7 22 19 20.7 19 19C19 17 16 13 16 13Z" 
        fill={color} opacity="0.3" />
      <circle cx="16" cy="19" r="1.5" fill={color} opacity="0.6" />
    </svg>
  );
}

// 社会联结 — Network Nodes
export function SocialIcon({ size = 28, color = '#4FC3F7' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Central figure */}
      <circle cx="16" cy="11" r="3" fill={color} opacity="0.7" />
      <path d="M11 20C11 17.2 13.2 15 16 15C18.8 15 21 17.2 21 20" stroke={color} strokeWidth="1.2" opacity="0.5" fill="none" />
      {/* Left person */}
      <circle cx="6" cy="14" r="2" fill={color} opacity="0.4" />
      <path d="M3 21C3 19 4.3 17 6 17C7.7 17 9 19 9 21" stroke={color} strokeWidth="0.8" opacity="0.3" fill="none" />
      {/* Right person */}
      <circle cx="26" cy="14" r="2" fill={color} opacity="0.4" />
      <path d="M23 21C23 19 24.3 17 26 17C27.7 17 29 19 29 21" stroke={color} strokeWidth="0.8" opacity="0.3" fill="none" />
      {/* Connection lines */}
      <path d="M13 12L8 14M19 12L24 14" stroke={color} strokeWidth="0.8" opacity="0.3" strokeDasharray="2 2" />
      {/* Heart connection */}
      <path d="M11 24L16 28L21 24" stroke={color} strokeWidth="0.8" opacity="0.4" fill="none" />
      <circle cx="16" cy="26" r="1" fill={color} opacity="0.5" />
    </svg>
  );
}

// 审美与创造 — Golden Spiral / Rose
export function AestheticIcon({ size = 28, color = '#FF80AB' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Petals — abstract rose */}
      <path d="M16 6C18 6 20 8 20 10C20 12 18 14 16 14C14 14 12 12 12 10C12 8 14 6 16 6Z" 
        fill={color} opacity="0.15" stroke={color} strokeWidth="0.6" />
      <path d="M22 10C24 11 25 14 24 16C23 18 20 19 18 18C16 17 15 14 16 12C17 10 20 9 22 10Z" 
        fill={color} opacity="0.12" stroke={color} strokeWidth="0.6" />
      <path d="M24 18C24 20 22 23 20 23C18 23 16 21 16 19C16 17 18 15 20 15C22 15 24 16 24 18Z" 
        fill={color} opacity="0.1" stroke={color} strokeWidth="0.6" />
      <path d="M10 10C8 11 7 14 8 16C9 18 12 19 14 18C16 17 17 14 16 12C15 10 12 9 10 10Z" 
        fill={color} opacity="0.12" stroke={color} strokeWidth="0.6" />
      <path d="M8 18C8 20 10 23 12 23C14 23 16 21 16 19C16 17 14 15 12 15C10 15 8 16 8 18Z" 
        fill={color} opacity="0.1" stroke={color} strokeWidth="0.6" />
      {/* Golden spiral hint */}
      <path d="M16 14C17 14 18 15 18 16C18 17 17 18 16 18C14.5 18 13 16.5 13 15C13 13 15 11 17 11C19.5 11 22 13.5 22 16C22 19 19 22 16 22" 
        stroke={color} strokeWidth="0.8" opacity="0.4" fill="none" />
      {/* Center */}
      <circle cx="16" cy="16" r="1.5" fill={color} opacity="0.6" />
      {/* Sparkles */}
      <circle cx="8" cy="26" r="0.8" fill={color} opacity="0.3" />
      <circle cx="24" cy="26" r="0.6" fill={color} opacity="0.2" />
    </svg>
  );
}

// 世界观与意义 — Constellation / Cosmos
export function WorldviewIcon({ size = 28, color = '#E040FB' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Orbital rings */}
      <ellipse cx="16" cy="16" rx="13" ry="5" stroke={color} strokeWidth="0.6" opacity="0.2" transform="rotate(-30 16 16)" />
      <ellipse cx="16" cy="16" rx="13" ry="5" stroke={color} strokeWidth="0.6" opacity="0.2" transform="rotate(30 16 16)" />
      <ellipse cx="16" cy="16" rx="13" ry="5" stroke={color} strokeWidth="0.6" opacity="0.15" transform="rotate(90 16 16)" />
      {/* Central body */}
      <circle cx="16" cy="16" r="3.5" fill={color} opacity="0.25" />
      <circle cx="16" cy="16" r="2" fill={color} opacity="0.6" />
      {/* Stars */}
      <circle cx="6" cy="8" r="1.2" fill={color} opacity="0.5" />
      <circle cx="26" cy="8" r="0.8" fill={color} opacity="0.4" />
      <circle cx="4" cy="22" r="0.8" fill={color} opacity="0.3" />
      <circle cx="28" cy="22" r="1" fill={color} opacity="0.4" />
      <circle cx="16" cy="4" r="0.6" fill={color} opacity="0.3" />
      {/* Constellation lines */}
      <path d="M6 8L16 14M26 8L16 14M4 22L14 17.5M28 22L18 17.5" 
        stroke={color} strokeWidth="0.4" opacity="0.2" strokeDasharray="2 3" />
    </svg>
  );
}

// ── Game Icons ──

export function StroopIcon({ size = 28, color = '#FF6B6B' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="4" y="8" width="10" height="16" rx="2" stroke={color} strokeWidth="1" opacity="0.5" fill={`${color}08`} />
      <rect x="18" y="8" width="10" height="16" rx="2" stroke="#4FC3F7" strokeWidth="1" opacity="0.5" fill="rgba(79,195,247,0.08)" />
      <text x="9" y="19" textAnchor="middle" fill="#4FC3F7" fontSize="8" fontWeight="700" opacity="0.8">红</text>
      <text x="23" y="19" textAnchor="middle" fill={color} fontSize="8" fontWeight="700" opacity="0.8">蓝</text>
    </svg>
  );
}

export function NBackIcon({ size = 28, color = '#4FC3F7' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="3" y="11" width="7" height="10" rx="1.5" stroke={color} strokeWidth="0.8" opacity="0.3" fill={`${color}05`} />
      <rect x="12.5" y="11" width="7" height="10" rx="1.5" stroke={color} strokeWidth="0.8" opacity="0.5" fill={`${color}08`} />
      <rect x="22" y="11" width="7" height="10" rx="1.5" stroke={color} strokeWidth="1.2" opacity="0.8" fill={`${color}12`} />
      <text x="25.5" y="18.5" textAnchor="middle" fill={color} fontSize="7" fontWeight="700" opacity="0.9">N</text>
      <path d="M9 20L11 16" stroke={color} strokeWidth="0.6" opacity="0.3" strokeDasharray="1.5 1.5" />
    </svg>
  );
}

export function GoNoGoIcon({ size = 28, color = '#64FFDA' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Go circle */}
      <circle cx="11" cy="16" r="6" stroke={color} strokeWidth="1.2" opacity="0.6" fill={`${color}08`} />
      <path d="M8.5 16L10.5 18L14 14" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      {/* No-Go circle */}
      <circle cx="23" cy="16" r="5" stroke="#FF6B6B" strokeWidth="1" opacity="0.4" fill="rgba(255,107,107,0.05)" />
      <path d="M20.5 13.5L25.5 18.5M25.5 13.5L20.5 18.5" stroke="#FF6B6B" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export function UltimatumIcon({ size = 28, color = '#FFD700' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Scale base */}
      <path d="M16 6V22" stroke={color} strokeWidth="1" opacity="0.5" />
      <path d="M6 22H26" stroke={color} strokeWidth="0.8" opacity="0.3" />
      {/* Balance beam */}
      <path d="M6 12L16 9L26 14" stroke={color} strokeWidth="1.2" opacity="0.6" />
      {/* Pans */}
      <path d="M3 12H9" stroke={color} strokeWidth="0.8" opacity="0.4" />
      <path d="M4 12V16C4 16 6 17 6 17C6 17 8 16 8 16V12" stroke={color} strokeWidth="0.6" opacity="0.3" fill={`${color}08`} />
      <path d="M23 14H29" stroke={color} strokeWidth="0.8" opacity="0.4" />
      <path d="M24 14V18C24 18 26 19 26 19C26 19 28 18 28 18V14" stroke={color} strokeWidth="0.6" opacity="0.3" fill={`${color}05`} />
      {/* Fulcrum */}
      <path d="M14 22L16 24L18 22" fill={color} opacity="0.4" />
    </svg>
  );
}

export function TrustIcon({ size = 28, color = '#BB86FC' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Two hands reaching */}
      <path d="M4 20C4 20 8 16 12 18" stroke={color} strokeWidth="1.2" opacity="0.5" strokeLinecap="round" />
      <path d="M28 20C28 20 24 16 20 18" stroke={color} strokeWidth="1.2" opacity="0.5" strokeLinecap="round" />
      {/* Handshake connection */}
      <path d="M12 18L16 16L20 18" stroke={color} strokeWidth="1.2" opacity="0.7" strokeLinecap="round" strokeLinejoin="round" />
      {/* Shield of trust */}
      <path d="M16 8L22 11V17C22 21 16 25 16 25C16 25 10 21 10 17V11L16 8Z" 
        stroke={color} strokeWidth="0.8" opacity="0.3" fill={`${color}06`} />
      <path d="M13 15L15.5 17.5L19 13" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
    </svg>
  );
}

export function PublicGoodsIcon({ size = 28, color = '#64FFDA' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Building / Institution */}
      <path d="M16 5L6 12H26L16 5Z" stroke={color} strokeWidth="0.8" opacity="0.5" fill={`${color}06`} />
      <rect x="8" y="12" width="16" height="14" stroke={color} strokeWidth="0.8" opacity="0.3" fill={`${color}04`} />
      {/* Pillars */}
      <path d="M11 12V26M16 12V26M21 12V26" stroke={color} strokeWidth="0.8" opacity="0.3" />
      {/* Coins flowing in */}
      <circle cx="4" cy="20" r="1.5" stroke={color} strokeWidth="0.6" opacity="0.4" />
      <circle cx="28" cy="20" r="1.5" stroke={color} strokeWidth="0.6" opacity="0.4" />
      <path d="M5.5 20H8M24 20H26.5" stroke={color} strokeWidth="0.6" opacity="0.3" strokeDasharray="1.5 1.5" />
    </svg>
  );
}

// ── Icon mapping ──
export const DIMENSION_ICONS: Record<string, React.FC<IconProps>> = {
  cognitive: CognitiveIcon,
  personality: PersonalityIcon,
  emotion: EmotionIcon,
  motivation: MotivationIcon,
  social: SocialIcon,
  aesthetic: AestheticIcon,
  worldview: WorldviewIcon,
};

export const GAME_ICONS: Record<string, React.FC<IconProps>> = {
  stroop: StroopIcon,
  nback: NBackIcon,
  gonogo: GoNoGoIcon,
  ultimatum: UltimatumIcon,
  trust: TrustIcon,
  publicgoods: PublicGoodsIcon,
};

// ── Icon Container Component ──
export function IconContainer({ 
  children, 
  color, 
  size = 52 
}: { 
  children: React.ReactNode; 
  color: string; 
  size?: number; 
}) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28,
      background: `${color}0C`,
      border: `1px solid ${color}18`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative',
      boxShadow: `0 0 20px ${color}08, inset 0 1px 0 ${color}10`,
    }}>
      {children}
      {/* Subtle inner glow */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 'inherit',
        background: `radial-gradient(circle at 30% 30%, ${color}08, transparent 70%)`,
        pointerEvents: 'none',
      }} />
    </div>
  );
}
