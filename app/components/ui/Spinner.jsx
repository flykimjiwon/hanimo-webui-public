'use client';
/* ════════════════════════════════════════════════════════════════════
 * hanimo-webui — Spinner (v2 시안 포팅)
 * 인라인 로딩 인디케이터. 색은 토큰(text-primary) 참조.
 * ──────────────────────────────────────────────────────────────────── */
import { cn } from '@/lib/utils';

export function Spinner({ size = 16, label = '로딩 중', className }) {
  return (
    <span
      role='status'
      aria-label={label}
      className={cn('inline-flex text-primary align-middle', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox='0 0 24 24'
        fill='none'
        className='animate-spin'
        aria-hidden
      >
        <circle cx='12' cy='12' r='9' stroke='currentColor' strokeWidth='3' opacity='0.2' />
        <path d='M21 12a9 9 0 0 0-9-9' stroke='currentColor' strokeWidth='3' strokeLinecap='round' />
      </svg>
    </span>
  );
}

export default Spinner;
