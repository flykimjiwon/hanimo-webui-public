# hanimo-webui Design System

> **Status: archived reference.** The canonical design source is [`DESIGN.md`](DESIGN.md),
> which reflects the current neutral-stone surface system with restrained amber
> command/focus accents. Where this file conflicts with `DESIGN.md`, follow
> `DESIGN.md`.

> 최종 업데이트: 2026-03-11  
> 기반 스택: Next.js 15.5.9 · React 19 · Tailwind CSS 4 · shadcn/ui · Radix UI

---

## 1. 디자인 철학

### 1.1 핵심 원칙

| 원칙 | 설명 |
|---|---|
| **Neutral Tone** | ChatGPT·Perplexity 스타일의 뉴트럴 그레이 팔레트. 파란색(blue) 계열 완전 배제. |
| **Soft Contrast** | 다크모드는 순흑(#000)이 아닌 `#1a1a1a`, 라이트모드는 순백(#fff)이 아닌 `#f9f9f9`. 눈의 피로를 줄이는 부드러운 대비. |
| **Semantic Tokens** | 모든 색상은 CSS 변수(`--background`, `--foreground`, `--card` 등)를 통해 참조. 하드코딩된 색상값 사용 금지. |
| **Component-Driven** | shadcn/ui 기반의 일관된 컴포넌트 시스템. 스타일 커스터마이징은 `cn()` 유틸리티로 합성. |
| **Accessibility First** | `aria-label`, `title`, `role` 속성 필수 적용. 포커스 링(`ring`) 시스템 내장. |

### 1.2 디자인 톤 (Aesthetic Direction)

- **톤**: Minimalist, utilitarian — 콘텐츠 중심의 절제된 인터페이스
- **차별점**: AI 채팅 앱에서 흔한 보라/파란 그라데이션을 완전히 배제하고, 무채색 뉴트럴만으로 신뢰감·전문성 전달
- **터치포인트**: 다크/라이트 모드 전환, 언어 전환, 사이드바 확장/축소 시 `duration-300 ease-in-out` 트랜지션 통일

### 1.3 금지 사항 (Anti-Patterns)

- `bg-blue-*`, `text-blue-*`, `border-blue-*` 등 파란색 계열 클래스 사용 금지 (PPT 생성 관련 파일 제외)
- `bg-white`, `bg-gray-800` 등 하드코딩된 배경색 사용 금지 → `bg-background`, `bg-card`, `bg-muted` 사용
- `as any`, `@ts-ignore`, `@ts-expect-error` 등 타입 억제 금지
- 빈 catch 블록 (`catch(e) {}`) 금지
- `Inter`, `Arial`, `Roboto` 등 제네릭 폰트 단독 사용 지양

---

## 2. 색상 시스템

### 2.1 디자인 토큰 (CSS 변수)

모든 색상은 `globals.css`의 `:root` / `.dark`에 정의되며, Tailwind의 `@theme inline` 블록을 통해 유틸리티 클래스로 매핑됨.

#### 라이트 모드 (`:root`)

| 토큰 | Hex | oklch | 용도 |
|---|---|---|---|
| `--background` | `#f9f9f9` | `oklch(0.98 0 0)` | 페이지 배경 |
| `--foreground` | `#1a1a1a` | `oklch(0.17 0 0)` | 기본 텍스트 |
| `--card` | `#f9f9f9` | `oklch(0.98 0 0)` | 카드 배경 |
| `--card-foreground` | `#1a1a1a` | `oklch(0.17 0 0)` | 카드 텍스트 |
| `--popover` | `#f9f9f9` | `oklch(0.98 0 0)` | 팝오버 배경 |
| `--primary` | `#1a1a1a` | `oklch(0.17 0 0)` | 주요 액션 (버튼, 링크) |
| `--primary-foreground` | `#fafafa` | `oklch(0.985 0 0)` | 주요 액션 위 텍스트 |
| `--secondary` | `#f5f5f5` | `oklch(0.97 0 0)` | 보조 배경 |
| `--muted` | `#f5f5f5` | `oklch(0.97 0 0)` | 비활성/음소거 배경 |
| `--muted-foreground` | `#737373` | `oklch(0.556 0 0)` | 보조 텍스트, 플레이스홀더 |
| `--accent` | `#f5f5f5` | `oklch(0.97 0 0)` | 호버 상태 배경 |
| `--destructive` | `#dc2626` | `oklch(0.577 0.245 27.325)` | 위험/삭제 액션 |
| `--border` | `#e5e5e5` | `oklch(0.922 0 0)` | 테두리 |
| `--input` | `#e5e5e5` | `oklch(0.922 0 0)` | 입력 필드 테두리 |
| `--ring` | `#a3a3a3` | `oklch(0.704 0 0)` | 포커스 링 |

#### 다크 모드 (`.dark`)

| 토큰 | Hex | oklch | 용도 |
|---|---|---|---|
| `--background` | `#1a1a1a` | `oklch(0.17 0 0)` | 페이지 배경 |
| `--foreground` | `#ececec` | `oklch(0.94 0 0)` | 기본 텍스트 |
| `--card` | `#252525` | `oklch(0.22 0 0)` | 카드 배경 (배경보다 약간 밝음) |
| `--secondary` / `--muted` / `--accent` | `#2f2f2f` | `oklch(0.26 0 0)` | 보조/음소거/호버 배경 |
| `--muted-foreground` | `#a3a3a3` | `oklch(0.704 0 0)` | 보조 텍스트 |
| `--border` / `--input` | `#333333` | `oklch(0.28 0 0)` | 테두리 |
| `--ring` | `#555555` | `oklch(0.42 0 0)` | 포커스 링 |

#### 차트 색상 (그레이스케일 계단)

| 토큰 | 라이트 | 다크 | 설명 |
|---|---|---|---|
| `--chart-1` | `#171717` | `#ececec` | 가장 진한 (주요 데이터) |
| `--chart-2` | `#404040` | `#d4d4d4` | |
| `--chart-3` | `#737373` | `#a3a3a3` | 중간 |
| `--chart-4` | `#a3a3a3` | `#737373` | |
| `--chart-5` | `#d4d4d4` | `#404040` | 가장 연한 (보조 데이터) |

#### 사이드바 전용 토큰

사이드바는 별도의 `--sidebar-*` 토큰을 가지며, 현재 메인 배경과 동일하게 설정됨:

```
--sidebar: 페이지 배경과 동일
--sidebar-foreground, --sidebar-primary, --sidebar-accent: 각각 대응되는 메인 토큰과 동일
--sidebar-border: 메인 border와 동일
```

### 2.2 oklch 사용

`@supports (color: oklch(1 0 0))` 블록으로 oklch를 지원하는 브라우저에서는 oklch 값 사용, 미지원 시 hex 폴백. 모든 색상의 chroma가 `0`으로 완전한 무채색.

### 2.3 색상 사용 규칙

```
✅ 올바른 사용:
bg-background        → 페이지 배경
bg-card              → 카드/패널 배경  
bg-muted             → 비활성 영역, 보조 배경
text-foreground      → 기본 텍스트
text-muted-foreground → 보조 텍스트, 힌트, 플레이스홀더
border-border        → 일반 테두리
bg-primary           → CTA 버튼 배경
text-primary-foreground → CTA 버튼 텍스트
bg-destructive       → 위험 액션 (삭제 등)

❌ 금지:
bg-white, bg-black, bg-gray-800     → 하드코딩 금지
bg-blue-500, text-blue-600          → 파란색 금지
border-gray-300                     → border-border 사용
```

### 2.4 상태별 색상 매핑

| 상태 | 배경 | 텍스트 | 예시 |
|---|---|---|---|
| Default | `bg-background` | `text-foreground` | 페이지 본문 |
| Hover | `bg-accent` | `text-accent-foreground` | 메뉴 호버 |
| Active/Selected | `bg-neutral-100 dark:bg-neutral-800` | `text-neutral-900 dark:text-neutral-100` | 현재 선택된 메뉴 |
| Disabled | opacity-50 | — | 버튼 비활성 |
| Muted | `bg-muted` | `text-muted-foreground` | 보조 정보, 날짜 |
| Destructive | `bg-destructive` | `text-destructive-foreground` | 삭제 버튼 |

---

## 3. 컴포넌트 시스템

### 3.1 기반: shadcn/ui

26개의 shadcn/ui 컴포넌트가 `app/components/ui/`에 설치됨. Radix UI 프리미티브 기반이며, `class-variance-authority(cva)` + `cn()` 유틸리티로 스타일링.

#### 설치된 컴포넌트 목록

| 카테고리 | 컴포넌트 |
|---|---|
| **Layout** | `Card`, `Separator`, `ScrollArea`, `Sheet` |
| **Form** | `Button`, `Input`, `Textarea`, `Label`, `Checkbox`, `Radio Group`, `Select`, `Switch` |
| **Overlay** | `AlertDialog`, `Dialog`, `Popover`, `Dropdown Menu`, `Tooltip` |
| **Feedback** | `Alert`, `Badge`, `Progress`, `Skeleton`, `Sonner (Toast)` |
| **Data Display** | `Avatar`, `Table`, `Tabs` |
| **Custom** | `Modal (AlertModal, ConfirmModal)` |

### 3.2 유틸리티 함수: `cn()`

```js
// app/lib/utils.js
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
```

모든 컴포넌트에서 className 합성 시 사용. `clsx`로 조건부 클래스 처리, `twMerge`로 Tailwind 클래스 충돌 해결.

### 3.3 Button 변형 (Variants)

`cva` 기반의 6가지 variant와 8가지 size:

#### Variants

| Variant | 클래스 | 용도 |
|---|---|---|
| `default` | `bg-primary text-primary-foreground hover:bg-primary/90` | 주요 CTA |
| `destructive` | `bg-destructive text-white hover:bg-destructive/90` | 위험 액션 |
| `outline` | `border bg-background shadow-xs hover:bg-accent` | 보조 액션 |
| `secondary` | `bg-secondary text-secondary-foreground hover:bg-secondary/80` | 부차적 액션 |
| `ghost` | `hover:bg-accent hover:text-accent-foreground` | 최소 스타일 (아이콘 버튼 등) |
| `link` | `text-primary underline-offset-4 hover:underline` | 텍스트 링크 |

#### Sizes

| Size | 높이 | 용도 |
|---|---|---|
| `xs` | h-6 | 매우 작은 버튼 (태그, 뱃지 내) |
| `sm` | h-8 | 작은 버튼 |
| `default` | h-9 | 기본 |
| `lg` | h-10 | 큰 버튼 |
| `icon` | size-9 | 아이콘 전용 (정사각형) |
| `icon-xs` | size-6 | 작은 아이콘 |
| `icon-sm` | size-8 | 중간 아이콘 |
| `icon-lg` | size-10 | 큰 아이콘 |

### 3.4 커스텀 컴포넌트

#### AlertModal / ConfirmModal (`app/components/ui/modal.jsx`)

Radix `AlertDialog` 기반의 래퍼. 4가지 타입별 아이콘 매핑:

| Type | 아이콘 | 색상 |
|---|---|---|
| `info` | `Info` | `text-neutral-500` |
| `warning` | `AlertTriangle` | `text-yellow-500` |
| `error` | `AlertCircle` | `text-red-500` |
| `success` | `CheckCircle` | `text-green-500` |

#### DarkModeToggle (`app/components/DarkModeToggle.js`)

- `useDarkMode` 훅 기반, `ghost` variant의 `icon` 사이즈 버튼
- 다크: `Sun` 아이콘 (`text-amber-500`)
- 라이트: `Moon` 아이콘 (`text-muted-foreground`)
- SSR hydration mismatch 방지를 위해 `mounted` 상태 체크

#### LanguageSwitcher (`app/components/LanguageSwitcher.js`)

- `useLanguage` 훅 기반, `Globe` 아이콘, `ghost` variant의 `icon-sm` 사이즈
- 토글 방식: `ko ↔ en` 순환
- 마찬가지로 `mounted` 상태 체크

---

## 4. 다크 모드 시스템

### 4.1 구현 방식

**CSS 클래스 기반** (`.dark` 클래스를 `<html>`에 토글):

```css
/* globals.css */
@custom-variant dark (&:is(.dark *));
```

### 4.2 `useDarkMode` 훅 (`app/hooks/useDarkMode.js`)

```
초기화 흐름:
1. localStorage에 'theme' 키 확인
2. 저장된 값 있으면 적용 ('dark' | 'light')
3. 없으면 시스템 설정 (`prefers-color-scheme: dark`) 따름
4. 시스템 설정 변경 시 자동 반영 (사용자 수동 설정이 없을 때만)
```

**반환값**: `{ isDark, toggle, setTheme, mounted }`

### 4.3 FOUC 방지

`layout.js`에서 인라인 스크립트로 사전 감지:

```js
// <head>에 인라인 스크립트로 삽입
(function() {
  try {
    var theme = localStorage.getItem('theme');
    if (theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {}
})()
```

### 4.4 배치 위치

| 위치 | 컴포넌트 | 비고 |
|---|---|---|
| 채팅 헤더 우측 | `ChatHeader.js` | 메인 채팅 페이지 |
| 로그인/SSO/Setup 페이지 | 각 page.js | 독립 배치 |
| Admin 사이드바 | `admin/layout.js` | 접힌/펼친 사이드바 모두 |

---

## 5. 국제화 (i18n) 시스템

### 5.1 아키텍처

URL 변경 없는 **localStorage 기반** 커스텀 경량 i18n:

```
LanguageProvider (Context)
  ├── useLanguage() 훅 — lang, setLang, t(), mounted
  ├── useTranslation() 편의 훅 — t() 직접 반환
  ├── ko.json — 한국어 번역 (277키)
  └── en.json — 영어 번역 (277키)
```

### 5.2 번역 키 구조

Nested JSON, dot notation 접근:

```json
{
  "common": { "confirm": "확인", ... },
  "auth": { "login_title": "hanimo-webui", ... },
  "signup": { ... },
  "chat": { ... },
  "sidebar": { ... },
  "profile": { ... },
  "errors": { ... },
  "dark_mode": { ... },
  "language": { ... },
  "notice": { ... },
  "dm": { ... },
  "admin": { ... }
}
```

### 5.3 보간 (Interpolation)

`{param}` 구문 사용 (single curly brace):

```js
t('sidebar.days_ago', { days: 3 })  // → "3일 전"
t('chat.image_max_count', { max: 5 })  // → "이미지는 최대 5장까지 첨부할 수 있습니다."
```

### 5.4 폴백 체인

```
1. 현재 언어 사전에서 키 탐색
2. 없으면 기본 언어(ko) 사전에서 탐색
3. 그래도 없으면 키 문자열 그대로 반환 (e.g., "chat.unknown_key")
```

### 5.5 사용 패턴

```jsx
// 컴포넌트에서 사용
import { useTranslation } from '@/hooks/useTranslation';

function MyComponent() {
  const { t } = useTranslation();
  return <h1>{t('common.confirm')}</h1>;
}
```

```jsx
// LanguageProvider 바깥에서 사용 (global-error.js 등)
// → localStorage에서 직접 읽어 수동 번역
const lang = typeof window !== 'undefined' 
  ? localStorage.getItem('hanimo-webui-lang') || 'ko' 
  : 'ko';
```

### 5.6 지원 언어

| 코드 | 언어 | 상태 |
|---|---|---|
| `ko` | 한국어 | 기본값 |
| `en` | English | 완전 지원 |

### 5.7 배치 위치

채팅 헤더 우측 (`ChatHeader.js`)에 `Globe` 아이콘 토글 버튼으로 배치.

---

## 6. 레이아웃 시스템

### 6.1 메인 채팅 레이아웃

```
ChatLayout (h-screen, flex-col, overflow-hidden)
├── Sidebar (fixed left, w-16 collapsed / w-80 expanded)
│   ├── 채팅방 목록 (ScrollArea)
│   ├── 사용자 메뉴 (프로필, 관리자, 게시판 등)
│   └── 로그아웃 버튼
├── ChatHeader (sticky top-0, z-10, backdrop-blur)
│   ├── 좌측 spacer
│   ├── DynamicSiteTitle (중앙)
│   └── LanguageSwitcher + DarkModeToggle (우측)
├── MessageList (flex-1, overflow-y-auto)
├── ScrollButtons (맨 아래로 이동)
└── ChatInput (fixed bottom-0)
    ├── 모델 선택기
    ├── 텍스트 입력 (textarea)
    ├── 이미지 업로드
    └── 전송 버튼
```

### 6.2 Admin 레이아웃

```
AdminLayout (min-h-screen, bg-background)
├── 접힌 사이드바 (w-16, 아이콘만)
│   ├── 메뉴 토글 버튼
│   ├── DarkModeToggle
│   ├── 메뉴 아이콘 목록
│   └── 로그아웃
├── 펼쳐진 사이드바 (w-80, z-50)
│   ├── 헤더 (타이틀 + DarkModeToggle + 닫기)
│   ├── DnD 정렬 가능한 메뉴 목록
│   ├── 메뉴 편집 버튼 (순서 변경, 이름 편집)
│   └── 사용자 정보 + 로그아웃
└── Main content (py-6, max-w-7xl)
```

### 6.3 반응형 전략

- **사이드바**: `lg:pl-80` / `lg:pl-16` — 대형 화면에서만 공간 확보, 모바일에서는 오버레이
- **콘텐츠 너비**: `max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl`
- **전환 애니메이션**: `transition-all duration-300 ease-in-out` 통일

---

## 7. 타이포그래피

### 7.1 폰트 스택

시스템 폰트 (`font-sans`) 사용:

```css
body { @apply font-sans; }
```

### 7.2 텍스트 스케일

| 용도 | 클래스 | 예시 |
|---|---|---|
| 페이지 제목 | `text-xl font-bold` | ChatHeader 타이틀 |
| 섹션 제목 | `text-lg font-semibold` | 모달 헤더, 사이드바 타이틀 |
| 본문 | `text-sm` (기본) | 대부분의 UI 텍스트 |
| 보조/캡션 | `text-xs text-muted-foreground` | 날짜, 메타 정보 |
| 코드 | `text-sm font-mono` | 마크다운 내 인라인 코드 |

---

## 8. 아이콘 시스템

### 8.1 라이브러리

**Lucide React** (`lucide-react@0.542.0`) — 일관된 선 두께의 아이콘 세트.

### 8.2 사용 규칙

| 사이즈 | 클래스 | 용도 |
|---|---|---|
| 기본 | `h-5 w-5` | 사이드바 메뉴, 헤더 아이콘 |
| 소형 | `h-4 w-4` | 버튼 내 아이콘, 인라인 |
| 미니 | `h-3 w-3` | 극소 아이콘 (닫기 X 등) |
| 대형 | `h-8 w-8` ~ `h-12 w-12` | 빈 상태 일러스트, 로딩 |

### 8.3 아이콘 색상

- 기본: `text-muted-foreground`
- 활성: `text-foreground` 또는 `text-neutral-900 dark:text-neutral-100`
- 특수: `text-amber-500` (Sun 아이콘), `text-primary` (강조)

---

## 9. 애니메이션 & 트랜지션

### 9.1 트랜지션 표준

| 용도 | 클래스 | 설명 |
|---|---|---|
| 레이아웃 이동 | `transition-all duration-300 ease-in-out` | 사이드바 열기/닫기, 콘텐츠 밀림 |
| 색상 변경 | `transition-colors duration-200` | 다크/라이트 모드 전환, hover |
| 호버 | `transition-colors` | 버튼, 메뉴 아이템 호버 |

### 9.2 애니메이션

| 효과 | 구현 | 용도 |
|---|---|---|
| 스피너 | `animate-spin` | 로딩 상태 |
| 모달 진입 | `animate-in fade-in-0 zoom-in-95` | AlertDialog 열기 |
| 모달 퇴장 | `animate-out fade-out-0 zoom-out-95` | AlertDialog 닫기 |
| 드래그 | `opacity: 0.5` (드래그 중) | Admin 메뉴 정렬 |

### 9.3 `tailwindcss-animate` 플러그인

shadcn/ui 컴포넌트의 진입/퇴장 애니메이션에 사용:

```css
@plugin "tailwindcss-animate";
```

---

## 10. 스크롤바 스타일링

### 10.1 글로벌 스크롤바

```css
/* WebKit: 8px 너비, 라운드 thumb */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { @apply bg-gray-100 dark:bg-gray-800; }
::-webkit-scrollbar-thumb { @apply bg-gray-300 dark:bg-gray-600 rounded-full; }

/* Firefox: thin 스크롤바 */
* { scrollbar-width: thin; }
```

### 10.2 채팅 스크롤바 (`.chat-scrollbar`)

항상 표시, 10px 너비, `scrollbar-gutter: stable` 적용으로 콘텐츠 밀림 방지.

### 10.3 커스텀 스크롤바 (`.custom-scrollbar`)

특정 요소에 적용. 10px 너비, 다크/라이트 모드 별도 색상.

---

## 11. 마크다운 렌더링

### 11.1 라이브러리

`@uiw/react-markdown-preview` 사용. `wmde-markdown` CSS 변수를 커스텀 오버라이드.

### 11.2 스타일 클래스

| 요소 | 라이트 | 다크 |
|---|---|---|
| 본문 텍스트 | `#111827` | `#ffffff` |
| 인라인 코드 | `bg-gray-200 text-red-600` | `bg-gray-700 text-red-300` |
| 코드 블록 | `bg-gray-200 border-gray-300` | `bg-gray-700 border-gray-600` |
| 링크 | `text-gray-700` | `text-gray-300` |
| 인용 | `border-l-4 border-gray-300 italic` | `border-l-4 border-gray-600` |
| 테이블 | `border-gray-300` | `border-gray-600` |

### 11.3 코드 블록 복사 버튼

```css
.copy-button {
  position: absolute; top: 8px; right: 8px;
  opacity: 0; /* 호버 시 1 */
  transition: opacity 0.2s;
}
.markdown-content pre:hover .copy-button { opacity: 1; }
```

### 11.4 레이아웃 격리

```css
.markdown-content {
  contain: layout style; /* 내부 변경이 외부 레이아웃에 영향 주지 않도록 */
  overflow-wrap: anywhere;
  word-break: break-word;
}
```

---

## 12. 채팅 메시지 스타일

### 12.1 사용자 메시지

```css
.chat-message-user {
  @apply bg-gray-100 dark:bg-gray-800/50 
         border border-gray-300 dark:border-gray-700/50 
         rounded-2xl rounded-br-md  /* 우하단만 각진 모서리 */
         px-4 py-3 max-w-[90%] ml-auto;
}
```

### 12.2 AI 응답

```css
.chat-message-assistant {
  @apply bg-gray-100 dark:bg-gray-800/50 
         border border-gray-300 dark:border-gray-700/50 
         rounded-2xl rounded-bl-md  /* 좌하단만 각진 모서리 */
         px-4 py-3 max-w-[90%] mr-auto;
}
```

**디자인 의도**: 사용자/AI 메시지 모두 동일한 배경색으로 통일하되, 각진 모서리 방향으로 발신자 구분. 사용자는 `ml-auto` (우측 정렬), AI는 `mr-auto` (좌측 정렬).

---

## 13. 간격 & 크기 기준

### 13.1 Border Radius

```css
:root {
  --radius: 0.625rem;  /* 10px */
}
--radius-sm: calc(var(--radius) - 4px);   /* 6px */
--radius-md: calc(var(--radius) - 2px);   /* 8px */
--radius-lg: var(--radius);               /* 10px */
--radius-xl: calc(var(--radius) + 4px);   /* 14px */
```

### 13.2 사이드바 크기

| 상태 | 너비 | 클래스 |
|---|---|---|
| 접힘 | 64px | `w-16` |
| 펼침 | 320px | `w-80` |

### 13.3 콘텐츠 최대 너비

```
max-w-full → md:max-w-4xl → lg:max-w-5xl → xl:max-w-6xl → 2xl:max-w-7xl
```

---

## 14. 상태 관리 패턴

### 14.1 Context 아키텍처

```
RootLayout
├── AlertProvider (AlertContext)
│   └── LanguageProvider (LanguageContext)
│       └── children
│           ├── ChatWidget
│           ├── SiteSettings
│           └── Page Components
```

### 14.2 커스텀 훅

| 훅 | 파일 | 역할 |
|---|---|---|
| `useDarkMode` | `hooks/useDarkMode.js` | 다크모드 상태 + 토글 |
| `useTranslation` | `hooks/useTranslation.js` | `t()` 함수 편의 래퍼 |
| `useLanguage` | `contexts/LanguageContext.js` | 전체 언어 컨텍스트 |
| `useAlert` | `contexts/AlertContext.js` | 모달 alert/confirm |
| `useChat` | `hooks/useChat.js` | 채팅방 CRUD |
| `useModelManager` | `hooks/useModelManager.js` | AI 모델 선택 |
| `useChatSender` | `hooks/useChatSender.js` | 메시지 전송 |

### 14.3 localStorage 키

| 키 | 용도 | 기본값 |
|---|---|---|
| `theme` | 다크/라이트 모드 | 시스템 설정 |
| `hanimo-webui-lang` | UI 언어 | `ko` |
| `token` | JWT 인증 토큰 | — |
| `user` | 사용자 정보 JSON | — |
| `adminMenuOrder` | Admin 메뉴 순서 | 기본 순서 |
| `adminMenuNames` | Admin 커스텀 메뉴명 | 기본 이름 |
| `noticeHideSettings:*` | 공지 숨김 설정 | — |

---

## 15. 파일 구조

```
app/
├── globals.css                    # 전역 스타일, CSS 변수, 마크다운 스타일
├── layout.js                      # RootLayout (Provider 래핑, 다크모드 사전감지)
├── page.js                        # 메인 채팅 페이지
├── components/
│   ├── ui/                        # shadcn/ui 컴포넌트 (26개)
│   │   ├── button.jsx
│   │   ├── card.jsx
│   │   ├── input.jsx
│   │   ├── modal.jsx              # AlertModal, ConfirmModal (커스텀)
│   │   └── ... (22개 더)
│   ├── chat/
│   │   ├── ChatHeader.js          # 헤더 (타이틀 + 다크모드/언어 전환)
│   │   ├── ChatInput.js           # 입력 영역
│   │   ├── ChatLayout.js          # 전체 레이아웃 컨테이너
│   │   ├── MessageList.js         # 메시지 목록
│   │   ├── ScrollButtons.js       # 스크롤 버튼
│   │   └── Sidebar.js             # 좌측 사이드바
│   ├── DarkModeToggle.js          # 다크모드 토글 버튼
│   ├── LanguageSwitcher.js        # 언어 전환 버튼
│   ├── ChatWidget.js              # 플로팅 채팅 위젯
│   ├── NoticePopup.js             # 공지사항 팝업
│   ├── DirectMessageModal.js      # 쪽지 모달
│   └── AgentSelector.js           # AI 에이전트 선택기
├── contexts/
│   ├── AlertContext.js            # Alert/Confirm 모달 Context
│   └── LanguageContext.js         # 언어 Context + t() 함수
├── hooks/
│   ├── useDarkMode.js             # 다크모드 훅
│   ├── useTranslation.js          # 번역 편의 훅
│   ├── useChat.js                 # 채팅 CRUD 훅
│   ├── useModelManager.js         # 모델 관리 훅
│   └── useChatSender.js           # 메시지 전송 훅
├── lib/
│   ├── utils.js                   # cn(), generateUUID()
│   └── i18n/
│       ├── ko.json                # 한국어 번역 (277키)
│       └── en.json                # 영어 번역 (277키)
└── admin/
    └── layout.js                  # Admin 전용 레이아웃 (DnD 메뉴)
```

---

## 16. 디자인 작업 가이드라인 (frontend-ui-ux 스킬 기반)

### 16.1 작업 원칙

1. **요청된 작업만 완수** — 스코프 크리프 없이 정확한 태스크 실행. 검증 없이 완료 표시 금지.
2. **더 나은 상태로 남기기** — 변경 후 프로젝트가 정상 동작하는 상태 보장.
3. **먼저 학습, 그 다음 행동** — 기존 패턴, 컨벤션, 커밋 히스토리를 파악한 후 구현.
4. **기존 코드와 자연스럽게 섞이기** — 팀이 작성한 것처럼 보이는 코드.
5. **투명하게 소통** — 각 단계를 설명하고, 성공과 실패 모두 보고.

### 16.2 새로운 디자인 작업 시 프로세스

새로운 UI 컴포넌트나 페이지를 추가할 때:

1. **목적 파악**: 어떤 문제를 해결하는가? 누가 사용하는가?
2. **톤 확인**: hanimo-webui는 **minimalist/utilitarian** 톤 — 뉴트럴 그레이, 절제된 인터페이스
3. **제약 확인**: Next.js App Router, React 19, Tailwind CSS 4, shadcn/ui 컴포넌트 우선 사용
4. **기존 패턴 참조**: 유사한 기존 컴포넌트의 구조와 스타일링 방식 확인

### 16.3 색상 선택 기준

- **지배적 색상 + 날카로운 악센트 > 균등 분배된 소심한 팔레트**
- hanimo-webui의 경우: 뉴트럴 그레이가 지배적, `destructive`(빨강)만 악센트
- 새 색상 추가 시 반드시 CSS 변수로 정의하고, 라이트/다크 모드 모두 지정

### 16.4 모션 가이드

- 고임팩트 순간에 집중: 잘 오케스트레이션된 페이지 로드 > 산발적 마이크로 인터랙션
- CSS 전용 우선. 라이브러리는 `tailwindcss-animate` 사용.
- 표준 duration: `200ms` (색상), `300ms` (레이아웃)

### 16.5 공간 구성

- 채팅 인터페이스는 **콘텐츠 밀도 우선** — 스크롤 최소화
- Admin은 **여유 있는 여백** — `max-w-7xl`, `py-6`, `px-4 sm:px-6 lg:px-8`
- 사이드바는 접힘/펼침으로 사용자가 공간 제어

---

## 17. 의존성 요약

| 패키지 | 버전 | 용도 |
|---|---|---|
| `next` | 15.5.9 | 프레임워크 |
| `react` / `react-dom` | 19.2.1 | UI 라이브러리 |
| `tailwindcss` | ^4 | CSS 유틸리티 |
| `tailwindcss-animate` | ^1.0.7 | 애니메이션 플러그인 |
| `radix-ui` | ^1.4.3 | 접근성 프리미티브 |
| `class-variance-authority` | ^0.7.1 | 컴포넌트 변형 관리 |
| `clsx` | ^2.1.1 | 조건부 클래스 |
| `tailwind-merge` | ^3.3.1 | Tailwind 클래스 충돌 해결 |
| `lucide-react` | ^0.542.0 | 아이콘 |
| `@dnd-kit/*` | ^6~10 | 드래그 앤 드롭 (Admin 메뉴) |
| `recharts` | ^3.2.0 | 차트 (Analytics) |
| `@uiw/react-markdown-preview` | ^5.1.5 | 마크다운 렌더링 |
| `sonner` | ^2.0.7 | 토스트 알림 |
