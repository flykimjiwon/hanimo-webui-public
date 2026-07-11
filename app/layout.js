import './globals.css';
import ChatWidget from './components/ChatWidget';
import { AlertProvider } from './contexts/AlertContext';
import { LanguageProvider } from './contexts/LanguageContext';
import SiteSettings from './components/SiteSettings';
import ClientErrorReporter from './components/ClientErrorReporter';
import GlobalControls from './components/GlobalControls';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';

// className.split 에러 방지를 위한 전역 패치 (클라이언트에서만 실행)
if (typeof window !== 'undefined') {
  // 모든 Element 타입에 대해 className getter를 패치하는 헬퍼 함수
  const patchElementClassName = (ElementPrototype, typeName) => {
    // 이미 패치되었는지 확인
    if (ElementPrototype._classNamePatched) {
      return;
    }

    try {
      // 원본 getter 저장
      const descriptor = Object.getOwnPropertyDescriptor(
        ElementPrototype,
        'className'
      );

      if (descriptor && descriptor.get) {
        ElementPrototype._originalClassNameGetter = descriptor.get;
      } else {
        // getter가 없는 경우 (일부 브라우저)
        ElementPrototype._originalClassNameGetter = function () {
          return this.getAttribute('class') || '';
        };
      }

      // className getter를 패치하여 항상 문자열을 반환
      Object.defineProperty(ElementPrototype, 'className', {
        get: function () {
          try {
            const originalValue =
              ElementPrototype._originalClassNameGetter.call(this);

            // 이미 문자열인 경우 그대로 반환
            if (typeof originalValue === 'string') {
              return originalValue;
            }

            // DOMTokenList인 경우 문자열로 변환
            if (originalValue && typeof originalValue.toString === 'function') {
              return originalValue.toString();
            }

            // SVGAnimatedString인 경우 baseVal 사용
            if (
              originalValue &&
              typeof originalValue === 'object' &&
              'baseVal' in originalValue
            ) {
              return String(originalValue.baseVal || '');
            }

            // null/undefined인 경우 빈 문자열 반환
            if (originalValue == null) {
              return '';
            }

            // 기타 경우 문자열로 변환
            return String(originalValue);
          } catch (e) {
            // 에러 발생 시 빈 문자열 반환
            console.warn(
              `[className patch] ${typeName} className getter 에러:`,
              e
            );
            return '';
          }
        },
        set: function (value) {
          try {
            // setter는 원본 동작 유지
            if (ElementPrototype._originalClassNameSetter) {
              ElementPrototype._originalClassNameSetter.call(this, value);
            } else {
              this.setAttribute('class', String(value || ''));
            }
          } catch (e) {
            // setter 에러는 무시 (일부 요소는 className을 설정할 수 없을 수 있음)
            console.warn(
              `[className patch] ${typeName} className setter 에러:`,
              e
            );
          }
        },
        configurable: true,
        enumerable: true,
      });

      // setter도 저장 (있는 경우)
      if (descriptor && descriptor.set) {
        ElementPrototype._originalClassNameSetter = descriptor.set;
      }

      ElementPrototype._classNamePatched = true;
    } catch (e) {
      console.warn(`[className patch] ${typeName} 패치 실패:`, e);
    }
  };

  // HTMLElement 패치
  if (typeof HTMLElement !== 'undefined') {
    patchElementClassName(HTMLElement.prototype, 'HTMLElement');
  }

  // SVGElement 패치 (SVG 요소도 className을 사용)
  if (typeof SVGElement !== 'undefined') {
    patchElementClassName(SVGElement.prototype, 'SVGElement');
  }

  // Element 패치 (모든 요소의 기본 클래스)
  if (typeof Element !== 'undefined') {
    patchElementClassName(Element.prototype, 'Element');
  }
}

// Next.js 15 App Router에서 metadata API 사용
export const metadata = {
  title: 'Hanimo',
  description: 'Hanimo - Self-hosted AI workspace and OpenAI-compatible gateway',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang='ko' className='h-full' suppressHydrationWarning>
      <head>
        <link rel='preconnect' href='https://cdn.jsdelivr.net' crossOrigin='anonymous' />
        <link
          rel='stylesheet'
          href='https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css'
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const root = document.documentElement;
                  const ua = navigator.userAgent || '';
                  const isEdge = ua.indexOf('Edg/') !== -1;
                  const edgeMatch = ua.match(/Edg\\/(\\d+)/);
                  const chromeMatch = ua.match(/Chrome\\/(\\d+)/);
                  const edgeVersion = edgeMatch ? parseInt(edgeMatch[1], 10) : null;
                  const chromeVersion = chromeMatch ? parseInt(chromeMatch[1], 10) : null;
                  const isChrome = !!chromeVersion && !isEdge;
                  const browserVersion = isEdge ? edgeVersion : chromeVersion;
                  const theme = localStorage.getItem('theme');
                  if (theme === 'dark') {
                    root.classList.add('dark');
                  } else if (theme === 'light') {
                    root.classList.remove('dark');
                  } else {
                    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    if (isDark) {
                      root.classList.add('dark');
                    }
                  }
                  var lang = localStorage.getItem('hanimo-webui-lang');
                  if (lang === 'ko' || lang === 'en') {
                    root.lang = lang;
                  }
                  // Theme color restoration (FOUC prevention)
                  var themeData = localStorage.getItem('hanimo-webui-theme');
                  if (themeData) {
                    try {
                      var parsed = JSON.parse(themeData);
                      var isDarkMode = root.classList.contains('dark');
                      var vars = isDarkMode ? parsed.dark : parsed.light;
                      if (vars && typeof vars === 'object') {
                        for (var key in vars) {
                          if (key.indexOf('--') === 0) {
                            root.style.setProperty(key, vars[key]);
                          }
                        }
                      }
                      // v2 시안 포팅 — 개인화 prefs 복원 (밀도/폰트/글자크기/모션) FOUC 방지
                      if (parsed.prefs) {
                        var p = parsed.prefs;
                        var padMap = { compact: '10px', cozy: '14px', roomy: '18px' };
                        var rowMap = { compact: '6px', cozy: '10px', roomy: '14px' };
                        if (p.density) {
                          root.style.setProperty('--hn-pad', padMap[p.density] || '14px');
                          root.style.setProperty('--hn-row-gap', rowMap[p.density] || '10px');
                        }
                        if (p.fontStack) root.style.setProperty('--hn-font', p.fontStack);
                        if (p.typeScale) root.style.setProperty('--type-scale', p.typeScale);
                        if (p.reduceMotion) root.toggleAttribute('data-reduce-motion', true);
                      }
                      if (parsed.dark) {
                        var s = document.createElement('style');
                        s.id = 'hanimo-webui-theme-dark';
                        var css = '.dark {';
                        for (var dk in parsed.dark) {
                          if (dk.indexOf('--') === 0) css += dk + ':' + parsed.dark[dk] + ';';
                        }
                        css += '}';
                        s.textContent = css;
                        document.head.appendChild(s);
                      }
                    } catch(e) { /* ignore parse errors */ }
                  }
                } catch (e) {
                  /* theme/lang init failed — ignore so render is never blocked */
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className='h-full bg-background text-foreground'
        style={{ fontFamily: 'var(--hn-font)' }}
      >
        <ClientErrorReporter />
        <SiteSettings />
        <LanguageProvider>
          <TooltipProvider>
            <AlertProvider>
              <GlobalControls />
              {children}
              <ChatWidget />
              <Toaster richColors closeButton position='bottom-right' />
            </AlertProvider>
          </TooltipProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
