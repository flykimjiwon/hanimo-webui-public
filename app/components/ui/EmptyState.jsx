'use client';
/* ════════════════════════════════════════════════════════════════════
 * hanimo-webui — EmptyState (v2 시안 포팅)
 * 아이콘 + 제목 + 설명 + (선택) CTA. 색은 토큰 참조.
 * 사용: <EmptyState icon={<Bell className="h-7 w-7" />} title="..." desc="..." />
 * ──────────────────────────────────────────────────────────────────── */
export function EmptyState({ icon, title, desc, cta, onCta }) {
  return (
    <div className='text-center py-10 px-5'>
      {icon && (
        <div className='inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--hn-primary-soft)] text-primary mb-3.5'>
          {icon}
        </div>
      )}
      <div className='text-[15px] font-semibold text-foreground'>{title}</div>
      {desc && <div className='text-[13px] text-muted-foreground mt-1'>{desc}</div>}
      {cta && (
        <button
          type='button'
          onClick={onCta}
          className='mt-3.5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-95 transition'
        >
          {cta}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
