'use client';

/**
 * PageHead — 페이지 hero 헤더 (admin / 일반 모두 사용)
 *
 * 시안 spot 톤: amber는 한 화면에 1-2점만. eyebrow는 muted-foreground로
 * 절제하고 amber는 buttons / active sidebar / 강조 단어에만 남깁니다.
 *
 * @param {string} [highlight] — title 안에서 amber highlighter로 강조할 부분 텍스트
 *   (title을 string으로 받았을 때만 동작; ReactNode로 받으면 무시)
 */
export default function PageHead({ eyebrow, title, sub, actions, highlight, className = '' }) {
  let renderedTitle = title;
  if (highlight && typeof title === 'string' && title.includes(highlight)) {
    const idx = title.indexOf(highlight);
    renderedTitle = (
      <>
        {title.slice(0, idx)}
        <span
          style={{
            background:
              'linear-gradient(180deg, transparent 0 60%, var(--hn-primary-soft, rgba(245,166,35,.18)) 60% 92%, transparent 92%)',
            padding: '0 2px',
          }}
        >
          {highlight}
        </span>
        {title.slice(idx + highlight.length)}
      </>
    );
  }
  return (
    <div className={`flex items-start justify-between gap-4 flex-wrap mb-8 ${className}`}>
      <div className='min-w-0 flex-1'>
        {eyebrow && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--hn-fg-muted)',
              marginBottom: 8,
            }}
          >
            {eyebrow}
          </div>
        )}
        {title && (
          <h1
            className='font-bold sm:truncate'
            style={{
              fontSize: 'clamp(22px, 2.6vw, 28px)',
              letterSpacing: '-0.02em',
              color: 'var(--hn-fg)',
              lineHeight: 1.25,
              margin: 0,
            }}
          >
            {renderedTitle}
          </h1>
        )}
        {sub && (
          <p
            style={{
              marginTop: 6,
              fontSize: 13.5,
              color: 'var(--hn-fg-muted)',
              maxWidth: 640,
              lineHeight: 1.6,
            }}
          >
            {sub}
          </p>
        )}
      </div>
      {actions && (
        <div className='flex flex-wrap items-center gap-2 mt-1'>
          {actions}
        </div>
      )}
    </div>
  );
}
