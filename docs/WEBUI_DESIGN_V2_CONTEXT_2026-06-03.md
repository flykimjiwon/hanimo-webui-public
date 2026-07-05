# hanimo-webui + `webui_design` v2 파악 문서

- 작성일: 2026-06-03
- 범위: `hanimo/hanimo-webui` 코드베이스 구조 파악 + 새 Claude Design 산출물 `webui_design/` 문서화
- 작업 모드: **문서화만 진행** — 코드, CSS, 컴포넌트, 설정 파일은 수정하지 않음
- 관련 폴더:
  - 라이브 앱: `/Users/jiwonkim/Desktop/kimjiwon/hanimo/hanimo-webui`
  - 새 디자인 원본: `webui_design/`
  - 이전 디자인 원본: `hanimo_webui_클로드디자인/`

> 후속 메모: 이 문서는 `webui_design/` 유입 직후의 **초기 파악/문서화 스냅샷**이다.
> 이후 `design/webui-v2-port` 브랜치에서 v2 포팅 구현과 검증이 진행됐다.
> 최종 포팅 진행/검증 기록은 `docs/WEBUI_DESIGN_V2_PORT_REPORT_2026-06-03.md`를 기준으로 본다.

---

## 1. 한 줄 요약

`hanimo-webui`는 Next.js 15 기반의 셀프호스팅 AI 챗/관리자 플랫폼이고, 새 `webui_design/`은 warm-stone + amber 기반의 **v2 디자인 원본 및 라이브 포팅 명세**다. 현재는 디자인 산출물이 untracked 상태로 들어와 있으며, 실제 코드 반영은 아직 하지 않았다.

---

## 2. 현재 앱 구조 파악

### 2.1 기술 스택

근거: `package.json`, `CLAUDE.md`, `README.md`

- Framework: Next.js `15.5.9` App Router
- React: `19.2.1`
- 언어: JavaScript. TypeScript 프로젝트 아님
- UI: Tailwind CSS v4 + shadcn/ui + Lucide/Phosphor 계열 아이콘
- DB: PostgreSQL 14+ / `pg` raw SQL
- Auth: JWT access token + HttpOnly refresh token cookie
- Charts: Recharts
- Markdown: `@uiw/react-md-editor`, `@uiw/react-markdown-preview`, `rehype-sanitize`
- Package manager: npm

### 2.2 주요 경로

```txt
app/
├── page.js                         # 현재 루트 채팅. DrawPreviewPanel + Custom Instruction 포함
├── chat/page.js                    # useChatPage 기반 채팅 라우트
├── chat1/page.js                   # /chat redirect
├── chat2/page.js                   # /chat redirect
├── chat3/page.js                   # /chat redirect
├── admin/*                         # 관리자 페이지들
├── board/*                         # 게시판
├── notice/*                        # 공지
├── workflow/*                      # 워크플로우
├── screen-builder/*                # 스크린 빌더
├── my-api-keys/page.js             # 사용자 API 키
├── my-api-tokens/page.js           # 사용자 API 토큰
├── s/[shareId]/page.js             # 공유 대화
├── setup/page.js                   # 설치/초기 설정
├── signup/page.js                  # 회원가입
├── components/                     # 공용 UI / chat / admin / workflow / screen-builder
├── hooks/                          # useChat, useChatPage, useChatSender 등
└── lib/                            # auth, postgres, i18n, token, model routing 등
```

### 2.3 라우트 커버 상태

`webui_design/MIGRATION.md`의 매핑 대상 중 현재 라이브에 존재하는 라우트:

| 디자인 route | 라이브 경로 | 상태 |
|---|---|---|
| `chat` | `app/page.js`, `app/chat/page.js` | 존재. 루트와 `/chat` 기능 차이 있음 |
| `board` | `app/board/page.js` | 존재 |
| `board-post` | `app/board/[id]/page.js` | 존재 |
| `board-write` | `app/board/write/page.js` | 존재 |
| `notice` | `app/notice/page.js` | 존재 |
| `my-keys` | `app/my-api-keys/page.js` | 존재 |
| `workflow` | `app/workflow/page.js` | 존재 |
| `screen-builder` | `app/screen-builder/page.js` | 존재 |
| `admin` | `app/admin/*` | 존재 |
| `login` | `app/login/page.js` | 존재 |
| `signup` | `app/signup/page.js` | 존재 |
| `setup` | `app/setup/page.js` | 존재 |
| `share` | `app/s/[shareId]/page.js` | 존재 |

주의: `app/page.js`와 `app/chat/page.js`는 같은 채팅 표면처럼 보이지만 완전히 동일하지 않다. 디자인 포팅 전에 기준 화면을 정해야 한다.

---

## 3. 새 `webui_design/` 산출물 파악

### 3.1 폴더 성격

`webui_design/`은 단순 이미지 묶음이 아니라 다음을 포함한 **라이브 포팅용 디자인 원본**이다.

```txt
webui_design/
├── index.html                       # 단독 React UMD + Babel 프로토타입 진입점
├── hanimo-webui-v2.standalone.html   # 단독 번들형 HTML
├── styles.css                       # hn-* 토큰 기반 전체 CSS
├── app.jsx                          # 프로토타입 앱 셸 + Tweaks 통합
├── sidebar.jsx                      # 사이드바 시안
├── chat.jsx                         # 채팅 시안
├── admin.jsx                        # 관리자 시안. 가장 큰 파일
├── screens.jsx                      # 로그인/게시판/프로필 등 화면
├── pages.jsx                        # 게시판 상세/작성, setup, signup, share 등
├── pages2.jsx                       # 추가 페이지
├── charts.jsx                       # 토큰 기반 차트 컴포넌트
├── components.jsx                   # Spinner/Skeleton/EmptyState/Toast/ConfirmModal 등
├── data.jsx                         # 프로토타입 데모 데이터
├── i18n.jsx                         # 프로토타입 i18n
├── icons.jsx                        # 프로토타입 인라인 아이콘
├── theme-settings.jsx               # 테마 설정 패널
├── tweaks-panel.jsx                 # 디자인 조절 패널
├── MIGRATION.md                     # 라이브 반영 매핑표
├── port/
│   ├── README.md                    # Next.js 포팅 가이드
│   ├── globals.additions.css        # app/globals.css에 합칠 추가 토큰/규칙
│   └── components/feedback.jsx      # 상태 UX 컴포넌트 포팅용
└── screenshots/                     # v2 화면 캡처들
```

### 3.2 이전 디자인 대비 변화

이전 폴더 `hanimo_webui_클로드디자인/` 대비 새 `webui_design/`은 파일과 범위가 확장됐다.

| 파일 | 이전 라인 수 | 새 라인 수 | 의미 |
|---|---:|---:|---|
| `styles.css` | 1426 | 2056 | 토큰/상태/접근성/추가 화면 스타일 증가 |
| `app.jsx` | 190 | 288 | route/tweaks 범위 확장 |
| `chat.jsx` | 289 | 322 | 채팅 시안 확장 |
| `admin.jsx` | 1240 | 1747 | 관리자 패널 범위 크게 확장 |
| `screens.jsx` | 384 | 465 | 화면 시안 증가 |
| `components.jsx` | 없음 | 122 | 상태 UX primitive 추가 |
| `charts.jsx` | 없음 | 151 | 토큰 기반 차트 추가 |
| `pages.jsx` | 없음 | 410 | 게시판 상세/작성, setup/signup/share 등 추가 |
| `pages2.jsx` | 없음 | 279 | 추가 페이지 |
| `MIGRATION.md` | 없음 | 179 | 라이브 포팅 매핑표 |

---

## 4. 디자인 DNA / 불변 원칙

`webui_design/MIGRATION.md`, `webui_design/port/README.md`, `webui_design/styles.css` 기준.

### 4.1 브랜드 톤

- Primary: amber/honey
  - Light: `#f5a623`
  - Dark: `#f5be5b`
- Neutral: warm-stone 계열
  - Light bg: `#fafaf9`
  - Dark bg: `#14110f`
- Radius: 기본 `0.625rem`
- Font: Pretendard 우선, mono는 JetBrains Mono 계열
- Accent 사용 원칙: 한 화면에 1~2점 정도만 amber spot으로 사용

### 4.2 색 사용 원칙

- 모든 강조/활성/링크/선택/노드 선택은 `--hn-primary` 계열
- blue/purple/indigo/cyan 계열은 브랜드 accent로 쓰지 않음
- 파랑은 정보성 시맨틱 `--hn-info`에만 허용
- 성공/경고/오류/정보는 아래 상태 토큰으로 통일

```css
--hn-good
--hn-warn
--hn-error
--hn-info
--hn-good-soft
--hn-warn-soft
--hn-error-soft
--hn-info-soft
```

### 4.3 토큰 구조

디자인 원본은 3단 브리지를 전제로 한다.

1. `--hn-*`: hanimo source of truth
2. shadcn semantic token: `--primary`, `--background`, `--card`, `--border`, `--ring` 등
3. Tailwind v4 `@theme inline`: `bg-primary`, `text-muted-foreground` 등으로 사용

핵심 불변식: **`--hn-primary` 하나만 바꾸면 primary/ring/sidebar/chart가 같이 반응해야 함.**

---

## 5. 라이브 앱과 디자인 원본의 현재 정합 상태

### 5.1 이미 라이브에 있는 것

근거: `app/globals.css`, `app/components/ThemeDrawer.js`, `app/lib/themePresets.js`

- `--hn-bg`, `--hn-surface`, `--hn-fg`, `--hn-border`, `--hn-primary` 계열 존재
- shadcn ↔ hanimo token bridge 존재
- `--primary`, `--ring`, `--sidebar-primary`, `--chart-1` 등이 `--hn-primary`를 참조
- Tailwind gray/slate를 warm-stone 쪽으로 override하는 블록 존재
- ThemeDrawer가 `--hn-primary`, `--hn-primary-soft`, `--hn-primary-strong`, `--hn-radius`, `--hn-font` 일부를 직접 조정
- shadcn primitive 중 `skeleton`, `sonner`, `tooltip`, `alert-dialog`, `modal` 파일 존재

### 5.2 아직 라이브에 없는 것 / 보강 후보

근거: `webui_design/port/globals.additions.css`와 `app/globals.css` 비교.

- `--hn-good/warn/error/info` 및 soft 변형은 라이브 `--hanimo-*` raw와 `@theme`에는 있으나 `--hn-*` 시맨틱으로는 아직 없음
- motion token 없음
  - `--hn-dur-fast`
  - `--hn-dur-base`
  - `--hn-dur-slow`
  - `--hn-ease`
- `--hn-ring` alpha ring 없음
- 전역 `focus-visible` 통합 규칙 없음
- `prefers-reduced-motion` 및 `:root[data-reduce-motion]` 규칙 없음
- ThemeDrawer의 density 선택이 `--hn-pad`, `--hn-row-gap`까지 반영되지는 않는 것으로 보임
- reduced-motion 토글은 라이브 ThemeDrawer에는 아직 없는 것으로 보임

---

## 6. raw color 부채 후보

`webui_design`의 P0 원칙 기준으로, 아래 라이브 파일은 blue/purple/green/red Tailwind 사용이 많아 우선 점검 대상이다.

| 우선순위 | 파일/영역 | 관찰 |
|---|---|---|
| P0 | `app/admin/database/page.js` | primary 자리에 blue 다수. PK, 탭, 버튼, focus ring, 로딩 spinner 등에 blue 사용 |
| P0 | `app/workflow/page.js` / `app/components/workflow/*` | input/llm/output 노드에 blue/purple/green 사용. 연결선 SVG도 `#3b82f6` 사용 |
| P0 | `app/screen-builder/page.js` / `app/components/screen-builder/*` | card hover, icon bg, action button 등에 purple/blue 사용 |
| P1 | `app/admin/menus/page.js` | slash/icon/링크 일부 blue, 성공/삭제 green/red |
| P1 | `app/admin/settings/page.js` | 기본 amber 값이 일부 `#e5a63b`로 남아 있음. v2 기본값은 `#f5a623` |
| P1 | `app/admin/layout.js` | save/cancel/lock/logout 등 상태색 raw 사용 |

정리 원칙:

| Before | After 방향 |
|---|---|
| `bg-blue-*`, `text-blue-*`, `border-blue-*` | 브랜드 강조면 `bg-primary`, `text-primary`, `border-primary` |
| purple/indigo 외부 태그 | 정보성이면 `--hn-info`, 아니면 primary/neutral |
| green success | `--hn-good`, `--hn-good-soft` |
| red error/danger | `--hn-error`, `--hn-error-soft` 또는 shadcn destructive |
| amber warning | `--hn-warn`, `--hn-warn-soft` |

---

## 7. 채팅 표면 주의점

현재 라이브 채팅 표면은 두 갈래다.

### 7.1 `app/page.js`

- 루트 `/`
- `DrawPreviewPanel` 포함
- `SiteMenuSelector` 포함
- Custom Instruction modal 및 저장 로직 포함
- 기존 Home 컴포넌트가 직접 많은 상태/effect를 들고 있음

### 7.2 `app/chat/page.js`

- `/chat`
- `useChatPage` 훅으로 중복 로직 일부 정리됨
- `DrawPreviewPanelComponent={null}`로 전달 중
- Custom Instruction 전달이 루트와 동일하지 않음

### 7.3 redirect variants

- `app/chat1/page.js` → `/chat` redirect
- `app/chat2/page.js` → `/chat` redirect
- `app/chat3/page.js` → `/chat` redirect

### 7.4 문서화 판단

디자인 포팅 전에는 아래 결정이 필요하다.

1. 실제 메인 채팅 기준을 `/`로 둘지 `/chat`로 둘지
2. `app/page.js`의 기능을 `useChatPage` 기반으로 정리할지
3. 디자인 적용은 먼저 루트만 할지, `/chat`까지 동시에 맞출지

---

## 8. 상태 UX 컴포넌트 정리

`webui_design/port/components/feedback.jsx`는 아래 primitive를 제안한다.

- `Spinner`
- `Skeleton`
- `SkeletonText`
- `EmptyState`
- `ConfirmModal`
- Toast는 직접 구현보다 `sonner` 권장

라이브에는 이미 다음 파일이 존재한다.

```txt
app/components/ui/skeleton.jsx
app/components/ui/sonner.jsx
app/components/ui/tooltip.jsx
app/components/ui/modal.jsx
app/components/ui/alert-dialog.jsx
```

따라서 새 컴포넌트를 그대로 덮어쓰기보다는:

1. 기존 `skeleton`, `sonner`, `tooltip` 채택/정리
2. `Spinner`, `EmptyState`만 신규 또는 기존 `LoadingSpinner` 개선
3. `ConfirmModal`은 기존 `modal.jsx` / `AlertContext` 유지
4. 아이콘 색은 `--hn-good/warn/error/info`로 정리

이 방향이 `MIGRATION.md`의 “유지/제거 금지” 가드레일과 맞다.

---

## 9. 권장 포팅 순서 — 실제 반영 전 계획

> 이 문서는 문서화 전용이며, 아래는 다음 세션에서 코드 반영을 시작할 경우의 안전 순서다.

### Phase 0. 기준 확정

- `/` vs `/chat` 기준 표면 결정
- `webui_design/`을 git tracking할지 여부 결정
- 이전 `hanimo_webui_클로드디자인/`과 새 `webui_design/`의 보관/대체 정책 결정

### Phase 1. 토큰만 반영

대상: `app/globals.css`, 필요 시 `ThemeDrawer.js`

- `--hn-good/warn/error/info` + soft 추가
- motion token 추가
- `--hn-ring` 추가
- focus-visible 통합 규칙 추가
- reduced-motion 규칙 추가
- ThemeDrawer density → `--hn-pad`, `--hn-row-gap` 반영 검토
- ThemeDrawer reduced-motion 토글 검토

검증 기준:

- `npm run lint -- --quiet`
- light/dark에서 primary/ring/sidebar/chart 유지
- `--hn-primary` 변경 시 주요 컴포넌트 반응

### Phase 2. P0 raw 색 정리

대상 우선순위:

1. `admin/database`
2. `workflow`
3. `screen-builder`

검증 기준:

- blue/purple가 브랜드 accent 자리에서 제거됨
- info 의미가 아닌 파랑은 `primary` 또는 neutral로 이동
- 상태색은 `--hn-good/warn/error/info`로 이동

### Phase 3. 상태 UX 표준화

- loading: Skeleton/Spinner
- empty: EmptyState
- success: sonner toast
- destructive confirmation: 기존 ConfirmModal / AlertContext
- icon-only button: `aria-label` 보강

### Phase 4. 대형 관리자 화면 밀도/반응형

대상 후보:

- `admin/settings/page.js`
- `admin/database/page.js`
- `admin/external-api-logs/page.js`
- `admin/menus/page.js`

패턴:

- sticky panel header
- section chip nav
- `repeat(auto-fit, minmax(300px, 1fr))` 유동 그리드
- table horizontal scroll wrapper
- `--hn-pad`, `--hn-row-gap` 사용

---

## 10. 현재 git 상태 메모

작업 시점 기준 `hanimo-webui` sub-repo 상태:

```txt
## main...origin/main
?? scripts/_fix-settings-columns.js
?? scripts/_seed-test-users.js
?? webui_design/
```

루트 meta repo에도 다른 untracked 이미지/문서가 존재하지만, 본 문서화 범위에서는 건드리지 않았다.

---

## 11. 이번 문서화에서 실행한 확인

- `hanimo/hanimo-webui/package.json` 확인
- `hanimo/hanimo-webui/README.md` 확인
- `hanimo/hanimo-webui/CLAUDE.md` 확인
- `hanimo/hanimo-webui/app/` 구조 확인
- `hanimo/hanimo-webui/app/globals.css` 토큰 구조 확인
- `hanimo/hanimo-webui/app/components/ThemeDrawer.js` 확인
- `hanimo/hanimo-webui/webui_design/MIGRATION.md` 확인
- `hanimo/hanimo-webui/webui_design/port/README.md` 확인
- `hanimo/hanimo-webui/webui_design/port/globals.additions.css` 확인
- `hanimo/hanimo-webui/webui_design/port/components/feedback.jsx` 확인
- `hanimo/hanimo-webui/webui_design/screenshots/*` 일부 시각 확인
- `npm run lint -- --quiet` 실행: 통과

---

## 12. 결론

새 `webui_design/`은 단순 참고 이미지가 아니라, 라이브 앱으로 옮기기 위한 토큰/컴포넌트/화면 매핑이 포함된 v2 디자인 원본이다. 현재 라이브 앱은 이미 hanimo 토큰 브리지 기반을 어느 정도 갖추고 있으므로, 다음 작업은 대규모 재설계보다 **토큰 보강 → raw 색 정리 → 상태 UX 표준화 → 대형 화면 반응형 정리** 순서가 가장 안전하다.

단, 이번 요청은 “문서화만”이므로 실제 구현은 진행하지 않았다.
