import { useEffect, useRef, useCallback } from 'react';

/**
 * 全局鼠标光晕跟随效果（性能优化版）
 *
 * 优化要点：
 * 1. rAF 只在鼠标移动后启动，静止时自动停止
 * 2. 移除「外圈光晕」（320px 半径的大元素已删除，只保留小准星）
 * 3. 使用 CSS will-change 提示合成器
 * 4. 卡片光斑使用事件委托（无额外 DOM 元素创建）
 */
export function useCursorGlow() {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const innerPos = useRef({ x: 0, y: 0 });
  const raf = useRef<number>(0);
  const isMoving = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const animate = useCallback(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const dx = mouse.current.x - innerPos.current.x;
    const dy = mouse.current.y - innerPos.current.y;

    // If close enough, stop the loop
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      innerPos.current.x = mouse.current.x;
      innerPos.current.y = mouse.current.y;
      inner.style.transform = `translate3d(${innerPos.current.x - 6}px, ${innerPos.current.y - 6}px, 0)`;
      isMoving.current = false;
      return; // Stop rAF — resume on next mousemove
    }

    // Smooth interpolation
    innerPos.current.x += dx * 0.22;
    innerPos.current.y += dy * 0.22;
    inner.style.transform = `translate3d(${innerPos.current.x - 6}px, ${innerPos.current.y - 6}px, 0)`;

    raf.current = requestAnimationFrame(animate);
  }, []);

  const startAnimation = useCallback(() => {
    if (!isMoving.current) {
      isMoving.current = true;
      raf.current = requestAnimationFrame(animate);
    }
  }, [animate]);

  useEffect(() => {
    // Don't add cursor effects on touch devices
    if (window.matchMedia('(pointer: coarse)').matches) return;

    // Create only the small inner dot
    const inner = document.createElement('div');
    inner.className = 'cursor-glow-inner';
    inner.style.willChange = 'transform';
    document.body.appendChild(inner);
    innerRef.current = inner;

    const onMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
      inner.style.opacity = '1';
      startAnimation();

      // Auto-hide after 3s idle
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        inner.style.opacity = '0';
      }, 3000);
    };

    const onLeave = () => {
      inner.style.opacity = '0';
    };

    // Card glow — lightweight CSS var update via event delegation
    const onCardMove = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.glass-card, .dimension-card, [data-glow]');
      if (target instanceof HTMLElement) {
        const r = target.getBoundingClientRect();
        target.style.setProperty('--glow-x', `${e.clientX - r.left}px`);
        target.style.setProperty('--glow-y', `${e.clientY - r.top}px`);
        target.style.setProperty('--glow-opacity', '1');
      }
    };

    const onCardLeave = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.glass-card, .dimension-card, [data-glow]');
      if (target instanceof HTMLElement) {
        target.style.setProperty('--glow-opacity', '0');
      }
    };

    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mousemove', onCardMove, { passive: true });
    document.addEventListener('mouseout', onCardLeave);

    innerPos.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    return () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(idleTimer.current);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mousemove', onCardMove);
      document.removeEventListener('mouseout', onCardLeave);
      inner.remove();
    };
  }, [animate, startAnimation]);
}

/**
 * CursorGlow 组件 — 在 App 顶层挂载一次即可
 */
export default function CursorGlow() {
  useCursorGlow();
  return null;
}
