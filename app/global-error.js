'use client';

// 정적 프리렌더를 건너뛰고 런타임 렌더링만 수행
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// global-error는 LanguageProvider 바깥에서 렌더링되므로
// localStorage에서 직접 언어를 읽어 t()와 동일한 패턴으로 번역합니다.
function createLocalT() {
  const translations = {
    ko: {
      'errors.global_error_title': '심각한 오류가 발생했습니다',
      'errors.global_error_description': '예상치 못한 오류가 발생했습니다. 페이지를 새로 고침해 주세요.',
      'errors.refresh_page': '페이지 새로 고침',
      'common.go_home': '홈으로 돌아가기',
    },
    en: {
      'errors.global_error_title': 'A critical error occurred',
      'errors.global_error_description': 'An unexpected error occurred. Please refresh the page.',
      'errors.refresh_page': 'Refresh Page',
      'common.go_home': 'Go to Home',
    },
  };

  try {
    const lang = typeof window !== 'undefined'
      ? localStorage.getItem('hanimo-webui-lang') || 'ko'
      : 'ko';
    const dict = translations[lang] || translations.ko;
    return (key) => dict[key] || translations.ko[key] || key;
  } catch {
    return (key) => translations.ko[key] || key;
  }
}

// Next.js 공식 예시 형태로 최소 구현
export default function GlobalError({ reset }) {
  const t = createLocalT();

  return (
    <html lang='ko'>
      <body
        style={{
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '16px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <h2 style={{ margin: 0 }}>{t('errors.global_error_title')}</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type='button'
            onClick={() => reset?.()}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#171717',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            {t('errors.refresh_page')}
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href='/'
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              background: '#374151',
              color: '#fff',
              textDecoration: 'none',
            }}
          >
            {t('common.go_home')}
          </a>
        </div>
      </body>
    </html>
  );
}
