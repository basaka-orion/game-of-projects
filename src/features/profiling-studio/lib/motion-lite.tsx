/**
 * motion-lite.tsx — ZERO-OVERHEAD CSS-only motion replacement
 *
 * v3: Complete rewrite inspired by qclaw.qq.com's approach:
 * - QClaw: 264 DOM, 0 JS animation, 8 CSS keyframes → butter smooth
 * - Our old approach: 236 motion elements × (2 useState + 4 useMemo + 1 useEffect)
 *   = 1652+ React hooks per render cycle → JANK
 *
 * New approach: motion.div/span/etc are TRANSPARENT WRAPPERS that:
 * 1. Convert initial/animate to inline CSS (no hooks, no state)
 * 2. Use CSS transitions exclusively (GPU compositor thread)
 * 3. whileInView uses a single shared IntersectionObserver + CSS class toggle
 * 4. Zero React re-renders after mount
 */

import React, { forwardRef, useRef, useEffect, type CSSProperties, type ReactNode } from 'react';

/* ── Types ── */
interface AnimationValues {
  opacity?: number | number[];
  x?: number | number[];
  y?: number | number[];
  scale?: number | number[];
  rotate?: number | number[];
  [key: string]: any;
}

interface TransitionConfig {
  duration?: number;
  delay?: number;
  ease?: string | number[];
  repeat?: number | typeof Infinity;
  repeatType?: string;
  staggerChildren?: number;
}

interface Variants {
  [key: string]: AnimationValues & { transition?: TransitionConfig };
}

interface MotionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onAnimationStart'> {
  initial?: AnimationValues | string | false;
  animate?: AnimationValues | string;
  exit?: AnimationValues | string;
  transition?: TransitionConfig;
  whileHover?: AnimationValues;
  whileTap?: AnimationValues;
  whileInView?: AnimationValues | string;
  viewport?: { once?: boolean; amount?: number };
  variants?: Variants;
  custom?: any;
  layout?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
  // Common HTML pass-through attributes
  disabled?: boolean;
  href?: string;
  target?: string;
  rel?: string;
  type?: string;
}

/* ── Utilities (no hooks, pure functions) ── */

function resolveValues(val: AnimationValues | string | undefined | false, variants?: Variants): AnimationValues | undefined {
  if (!val && val !== false) return undefined;
  if (val === false) return undefined;
  if (typeof val === 'string' && variants) return variants[val];
  if (typeof val === 'object') return val;
  return undefined;
}

function valuesToCSS(v: AnimationValues): { transform?: string; opacity?: number } {
  const parts: string[] = [];
  if (v.x != null) parts.push(`translateX(${v.x}px)`);
  if (v.y != null) parts.push(`translateY(${v.y}px)`);
  if (v.scale != null) parts.push(`scale(${v.scale})`);
  if (v.rotate != null) parts.push(`rotate(${v.rotate}deg)`);
  const result: any = {};
  if (parts.length > 0) result.transform = parts.join(' ');
  if (v.opacity != null) result.opacity = v.opacity;
  return result;
}

function getEasing(ease?: string | number[]): string {
  if (!ease) return 'cubic-bezier(0.25, 0.1, 0.25, 1)';
  if (typeof ease === 'string') {
    const map: Record<string, string> = {
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      linear: 'linear',
    };
    return map[ease] || ease;
  }
  if (Array.isArray(ease) && ease.length === 4) return `cubic-bezier(${ease.join(',')})`;
  return 'cubic-bezier(0.25, 0.1, 0.25, 1)';
}

/* ── Shared IntersectionObserver (ONE for the entire app) ── */
type IOCallback = (isIntersecting: boolean) => void;
const ioCallbacks = new Map<Element, IOCallback>();
let sharedIO: IntersectionObserver | null = null;

function getSharedIO(): IntersectionObserver {
  if (!sharedIO) {
    sharedIO = new IntersectionObserver(
      (entries) => {
        for (let i = 0; i < entries.length; i++) {
          const cb = ioCallbacks.get(entries[i].target);
          if (cb) cb(entries[i].isIntersecting);
        }
      },
      { threshold: 0.1 }
    );
  }
  return sharedIO;
}

/* ── Continuous keyframe animations (for bouncing arrows etc) ── */
let kfCounter = 0;
const kfCache = new Map<string, string>();

function isArrayAnimate(v: AnimationValues): boolean {
  return Object.values(v).some(val => Array.isArray(val));
}

function getContinuousKeyframes(v: AnimationValues, _t: TransitionConfig): string {
  const key = JSON.stringify(v);
  if (kfCache.has(key)) return kfCache.get(key)!;

  const name = `ml-kf-${kfCounter++}`;
  const arrayKey = Object.keys(v).find(k => Array.isArray(v[k]));
  if (!arrayKey) return '';

  const values = v[arrayKey] as number[];
  const step = 100 / (values.length - 1);
  const frames = values.map((val, i) => {
    const pct = Math.round(i * step);
    const obj: AnimationValues = { ...v, [arrayKey]: val };
    const css = valuesToCSS(obj);
    return `${pct}%{opacity:${css.opacity ?? 1};transform:${css.transform || 'none'}}`;
  }).join('');

  const style = document.createElement('style');
  style.textContent = `@keyframes ${name}{${frames}}`;
  document.head.appendChild(style);
  kfCache.set(key, name);
  return name;
}

/* ── Core: createMotionComponent ── */
function createMotionComponent(tag: string) {
  const Comp = forwardRef<HTMLElement, MotionProps>((props, ref) => {
    const {
      initial, animate, exit: _exit, transition,
      whileHover, whileTap, whileInView, viewport,
      variants, custom: _custom, layout: _layout,
      children, style, className, ...rest
    } = props;

    const elRef = useRef<HTMLElement>(null);
    const mergedRef = (ref || elRef) as React.RefObject<HTMLElement>;

    // Resolve variants — if child has variants but no explicit initial/animate,
    // auto-resolve from variant keys "initial"/"animate" (framer-motion behavior)
    const effectiveInitial = initial ?? (variants && 'initial' in variants ? 'initial' : undefined);
    const effectiveAnimate = animate ?? (variants && 'animate' in variants ? 'animate' : undefined);

    const ini = resolveValues(effectiveInitial, variants);
    const ani = resolveValues(effectiveAnimate, variants);
    const viewAni = resolveValues(whileInView, variants);
    const t = ani?.transition || transition || { duration: 0.4 };
    const duration = t.duration ?? 0.4;
    const delay = t.delay ?? 0;
    const easing = getEasing(t.ease as any);

    // Build styles ONCE during render
    const s: CSSProperties = { ...style };

    // Check for continuous animations (bouncing arrows etc)
    if (ani && isArrayAnimate(ani)) {
      const kfName = getContinuousKeyframes(ani, t);
      const iterCount = t.repeat === Infinity ? 'infinite' : (t.repeat ?? 1);
      s.animation = `${kfName} ${duration}s ${easing} ${iterCount}`;
      if (t.repeatType === 'reverse' || t.repeatType === 'mirror') {
        s.animationDirection = 'alternate';
      }
    } else if (whileInView && ini) {
      // whileInView: start with initial state, IO callback transitions to animate
      const iniCSS = valuesToCSS(ini);
      if (iniCSS.opacity != null) s.opacity = iniCSS.opacity;
      if (iniCSS.transform) s.transform = iniCSS.transform;
      s.transition = `opacity ${duration}s ${easing} ${delay}s, transform ${duration}s ${easing} ${delay}s`;
    } else if (ini && ani && !whileInView) {
      // initial → animate: RENDER at initial state first, rAF will transition to animate
      const iniCSS = valuesToCSS(ini);
      if (iniCSS.opacity != null) s.opacity = iniCSS.opacity;
      if (iniCSS.transform) s.transform = iniCSS.transform;
      s.transition = `opacity ${duration}s ${easing} ${delay}s, transform ${duration}s ${easing} ${delay}s`;
    } else if (ani && !isArrayAnimate(ani)) {
      const aniCSS = valuesToCSS(ani);
      if (aniCSS.opacity != null) s.opacity = aniCSS.opacity;
      if (aniCSS.transform) s.transform = aniCSS.transform;
    }

    // Hover: use CSS custom properties (no JS hover handlers)
    if (whileHover) {
      (s as any)['--h-s'] = whileHover.scale ?? 1;
      (s as any)['--h-y'] = whileHover.y != null ? `${whileHover.y}px` : '0px';
    }
    if (whileTap) {
      (s as any)['--t-s'] = whileTap.scale ?? 1;
    }

    // Single useEffect: handles both whileInView AND initial→animate mount transition
    useEffect(() => {
      const el = mergedRef.current;
      if (!el) return;

      if (whileInView) {
        // IntersectionObserver for scroll-triggered animations
        const targetCSS = valuesToCSS(viewAni || ani || { opacity: 1, y: 0 });
        const cb: IOCallback = (isIntersecting) => {
          if (isIntersecting) {
            if (targetCSS.opacity != null) el.style.opacity = String(targetCSS.opacity);
            if (targetCSS.transform) el.style.transform = targetCSS.transform;
            else el.style.transform = '';
            if (viewport?.once) {
              ioCallbacks.delete(el);
              getSharedIO().unobserve(el);
            }
          } else if (!viewport?.once) {
            const iniCSS = valuesToCSS(ini || { opacity: 0, y: 20 });
            if (iniCSS.opacity != null) el.style.opacity = String(iniCSS.opacity);
            if (iniCSS.transform) el.style.transform = iniCSS.transform;
          }
        };
        ioCallbacks.set(el, cb);
        getSharedIO().observe(el);
        return () => { ioCallbacks.delete(el); getSharedIO().unobserve(el); };

      } else if (ini && ani && !isArrayAnimate(ani)) {
        // Mount transition: initial → animate via single rAF (no React re-render)
        requestAnimationFrame(() => {
          const aniCSS = valuesToCSS(ani);
          if (aniCSS.opacity != null) el.style.opacity = String(aniCSS.opacity);
          if (aniCSS.transform) el.style.transform = aniCSS.transform;
          else el.style.transform = '';
        });
      }
    }, []); // Mount once, never re-run

    const cls = [
      className,
      whileHover ? 'ml-hover' : '',
      whileTap ? 'ml-tap' : '',
    ].filter(Boolean).join(' ') || undefined;

    return React.createElement(tag, { ref: mergedRef, style: s, className: cls, ...rest }, children);
  });

  Comp.displayName = `motion.${tag}`;
  return Comp;
}

/* ── Global hover/tap styles (injected ONCE) ── */
if (typeof document !== 'undefined' && !document.getElementById('ml-css')) {
  const s = document.createElement('style');
  s.id = 'ml-css';
  s.textContent = `
.ml-hover{transition:transform .2s cubic-bezier(.25,.1,.25,1),opacity .2s}
.ml-hover:hover{transform:scale(var(--h-s,1)) translateY(var(--h-y,0))!important}
.ml-tap:active{transform:scale(var(--t-s,.97))!important}
`;
  document.head.appendChild(s);
}

/* ── motion proxy (cached per tag) ── */
const cache = new Map<string, ReturnType<typeof createMotionComponent>>();

export const motion = new Proxy({} as Record<string, ReturnType<typeof createMotionComponent>>, {
  get(_t, prop) {
    // React/JS internals probe with Symbol props — guard against them
    if (typeof prop !== 'string') return undefined;
    if (!cache.has(prop)) cache.set(prop, createMotionComponent(prop));
    return cache.get(prop)!;
  },
});

/* ── AnimatePresence — instant unmount (no exit animations = no jank) ── */
export function AnimatePresence({
  children,
  mode: _mode,
}: {
  children?: ReactNode;
  mode?: 'wait' | 'sync' | 'popLayout';
}) {
  return <>{children}</>;
}
