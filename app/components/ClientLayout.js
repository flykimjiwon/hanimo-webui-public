'use client';


import logger from '@/lib/logger';
import { useEffect } from 'react';

// className.split 에러 방지를 위한 전역 패치 (모듈 로드 시 즉시 실행)
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
            logger.warn(
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
            logger.warn(
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
      logger.warn(`[className patch] ${typeName} 패치 실패:`, e);
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

export default function ClientLayout({ children }) {
  useEffect(() => {
    const fetchSiteSettings = async () => {
      try {
        // Public endpoint: ClientLayout mounts on every page incl. the
        // unauthenticated login page, so it must not hit the admin-only route.
        const response = await fetch('/api/public/settings');
        if (response.ok) {
          const data = await response.json();
          const siteTitle = data.siteTitle || 'hanimo-webui';
          const siteDescription = data.siteDescription || 'hanimo-webui';

          // 동적으로 title 업데이트
          document.title = siteTitle;

          // 동적으로 description meta 태그 업데이트
          let metaDescription = document.querySelector(
            'meta[name="description"]'
          );
          if (!metaDescription) {
            metaDescription = document.createElement('meta');
            metaDescription.name = 'description';
            document.head.appendChild(metaDescription);
          }
          metaDescription.content = siteDescription;

          // 동적으로 favicon 업데이트
          if (data.faviconUrl) {
            let favicon = document.querySelector('link[rel="icon"]');
            if (!favicon) {
              favicon = document.createElement('link');
              favicon.rel = 'icon';
              document.head.appendChild(favicon);
            }
            favicon.href = data.faviconUrl;
          }
        }
      } catch (error) {
          logger.error('Failed to load site settings:', error);
      }
    };

    fetchSiteSettings();
  }, []);

  return children;
}
