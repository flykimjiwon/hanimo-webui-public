# Hanimo WebUI v2 디자인 포팅 리포트

- 작성일: 2026-06-03
- 브랜치: `design/webui-v2-port`
- 기준 디자인 원본: `webui_design/`
- 라이브 앱: `hanimo/hanimo-webui`
- 목적: Claude Design에서 받은 warm-stone + amber 기반 v2 시안을 실제 Next.js 앱 기능에 맞춰 포팅하고, 충돌 지점은 기능을 우선해 조정

---

## 1. 현재 결론

`webui_design/` v2 디자인 포팅은 **구현 1차 마무리 + 정적 검증 통과 + 공개 인증 화면 시각 스모크 완료** 상태다.

- `npm run lint -- --quiet`: 통과
- `SKIP_DB_CONNECTION=true npm run build`: 통과
- `git diff --check`: 통과
- Chrome DevTools 로컬 스모크:
  - `/login`: 렌더 OK, console error/warn 없음
  - `/signup`: 렌더 OK, console error/warn 없음
  - `/setup`: 인증/설정 정책에 따라 로그인 흐름으로 연결됨, crash 없음
- dev 서버는 검증 후 종료함

후속 정리에서 아래 7개 커밋으로 분리해 커밋했고, `origin/design/webui-v2-port`로 push까지 완료했다.

---

## 2. 포팅 방향

디자인 원본은 `.hn-*` CSS 클래스가 많은 독립 프로토타입이지만, 라이브 앱은 이미 Tailwind v4 + shadcn/ui + hanimo token bridge 기반이다. 따라서 프로토타입 CSS를 통째로 붙이는 대신 아래 전략으로 포팅했다.

1. `--hn-*` 토큰을 source of truth로 유지
2. shadcn semantic token과 Tailwind utility는 기존 구조를 유지
3. raw blue/purple/green/red accent를 브랜드/상태 토큰으로 치환
4. 실제 기능이 있는 라이브 화면은 시안과 다르면 기능을 우선
5. 상태 UX는 기존 AlertContext/Modal을 유지하고 sonner/toast, skeleton, spinner, empty-state를 보강

핵심 불변식:

> 기본 브랜드 강조는 `--hn-primary` amber 계열이며, 정보성 파랑은 `--hn-info`로만 제한한다. 단, ThemeDrawer의 사용자 선택 팔레트는 의도된 개인화 예외로 유지한다.

---

## 3. 주요 반영 내용

### 3.1 Foundation / Token

대상: `app/globals.css`, `app/layout.js`

- v2 상태 토큰 추가
  - `--hn-good`
  - `--hn-warn`
  - `--hn-error`
  - `--hn-info`
  - 각 soft variant
- motion token 추가
  - `--hn-dur-fast`
  - `--hn-dur-base`
  - `--hn-dur-slow`
  - `--hn-ease`
- `--hn-ring` 추가
- `--type-scale` cascade hook 추가
- keyboard-only `focus-visible` amber ring 통일
- `prefers-reduced-motion`와 `data-reduce-motion` 규칙 추가
- 게시판 상세 전용 `.board-prose` typography scope 추가
- layout에 `TooltipProvider`, `Toaster` 연결
- FOUC 방지 inline script가 theme prefs를 즉시 복원하도록 확장
  - density → `--hn-pad`, `--hn-row-gap`
  - font stack
  - type scale
  - reduce motion

### 3.2 Shared UI primitive

신규:

- `app/components/ui/Spinner.jsx`
- `app/components/ui/EmptyState.jsx`

보강:

- `app/components/ui/skeleton.jsx`
- `app/components/ui/modal.jsx`
- `app/hooks/useAlert.js`

### 3.3 Theme / Tweaks

대상: `app/components/ThemeDrawer.js`

- Claude Design의 theme/tweaks 성격을 라이브 `ThemeDrawer`에 맞춰 포팅
- palette, font, density, radius, type scale, reduce motion prefs를 저장/복원
- `--hn-primary` 계열을 중심으로 primary/ring/sidebar/chart 연동 유지
- 팔레트는 개인화 기능으로 유지함

### 3.4 Chat

대상:

- `app/page.js`
- `app/chat/page.js`
- `app/components/chat/*`
- `app/lib/i18n/ko.json`
- `app/lib/i18n/en.json`

반영:

- empty/greet 상태와 intent chip 흐름 보강
- model selector를 tag/dot 중심으로 정리
- composer를 rounded/boxed 디자인으로 정리
- sidebar/rail의 warm-stone + amber 강조 정리
- `userRole`, `userEmail`, `onIntentSelect` prop threading 추가
- i18n chat greet/intent 키 추가

주의:

- `/`와 `/chat`은 기능 차이가 있으므로 완전 통합하지 않고 두 진입점을 모두 살렸다.
- root `/`의 DrawPreviewPanel/Custom Instruction 기능은 유지했다.

### 3.5 Board / Notice / Profile / API Tokens

대상:

- `app/board/page.js`
- `app/board/[id]/page.js`
- `app/board/write/page.js`
- `app/board/edit/[id]/page.js`
- `app/notice/page.js`
- `app/notice/[id]/page.js`
- `app/notice/write/page.js`
- `app/profile/page.js`
- `app/my-api-tokens/page.js`

반영:

- category tab/tag, toolbar, article detail density 정리
- 게시글 상세에 `.board-prose` scoped markdown typography 적용
- EmptyState와 상태 callout를 v2 톤에 맞춤
- toast/confirm 흐름은 기존 기능과 충돌하지 않도록 유지
- `app/board/edit/[id]/page.js` 누락 import/state 보정
- `app/my-api-tokens/page.js` parse 오류와 Badge import 누락 보정

### 3.6 Admin

대상:

- `app/admin/layout.js`
- `app/admin/page.js`
- `app/admin/dashboard/page.js`
- `app/admin/analytics/page.js`
- `app/admin/database/page.js`
- `app/admin/external-api-logs/page.js`
- `app/admin/menus/page.js`
- `app/admin/settings/page.js`
- `app/admin/user-memories/page.js`
- `app/admin/users/page.js`
- `app/components/admin/AnalyticsCharts.js`

반영:

- admin shell/navigation amber token화
- dashboard stat/card/charts를 token palette로 정리
- 대형 admin page의 sticky header, section chip, density 패턴 적용
- database/settings 쪽 raw blue/purple/green/red를 primary/status token으로 정리

### 3.7 Workflow / Screen Builder

대상:

- `app/workflow/page.js`
- `app/workflow/[id]/page.js`
- `app/components/workflow/*`
- `app/screen-builder/page.js`
- `app/screen-builder/[id]/page.js`
- `app/components/screen-builder/*`

반영:

- blue/purple node/action accent를 amber primary + 상태 토큰으로 치환
- selected/focus/connector 색을 `--hn-primary` 중심으로 정리
- success/error/warn/info 표현은 `--hn-good/warn/error/info`로 정리
- screen-builder action/selection 상태를 token 기반으로 정리

### 3.8 Auth / Full-bleed pages

대상:

- `app/login/page.js`
- `app/signup/page.js`
- `app/setup/page.js`
- `app/sso/page.js`
- `app/s/[shareId]/page.js`

반영:

- login/signup/setup/share 화면을 warm-stone + amber full-bleed 톤으로 정리
- setup stepper와 auth card 밀도를 v2 시안에 맞춤
- 공유 페이지의 raw accent 주석/스타일을 정리

---

## 4. 검증 기록

### 4.1 Lint

```bash
npm run lint -- --quiet
```

결과: 통과

### 4.2 Production build

```bash
SKIP_DB_CONNECTION=true npm run build
```

결과: 통과

빌드 중 남은 메시지는 실패가 아니라 기존 hook dependency / eslint-disable 경고다. 이번 포팅으로 build error는 발생하지 않았다.

### 4.2.1 Diff whitespace check

```bash
git diff --check
```

결과: 통과

### 4.3 Raw color scan

제품 화면의 브랜드 accent 영역에서 P0 raw blue/purple/green/red 사용은 정리했다.

현재 남는 raw color scan 예외:

| 위치 | 판단 |
|---|---|
| `app/components/ThemeDrawer.js` | 사용자 개인화 팔레트. v2 Tweaks/Theme 기능의 의도된 예외 |
| `app/lib/themePresets.js` | 기존 theme preset 정의. 기본 amber 불변식과 충돌하지 않는 선택형 예외 |
| `app/globals.css` markdown inline code 색 | markdown code syntax용 국소 스타일. 브랜드 accent 아님 |
| `configured-db-and-active-db-mismatch` 문자열 | 색상 아님 |

### 4.4 Browser smoke

로컬 dev 서버:

```bash
npm run dev
# http://localhost:3100
```

검증 후 서버 종료.

확인 화면:

| 경로 | 결과 | 증거 |
|---|---|---|
| `/login` | 렌더 OK, console error/warn 없음 | `reports/webui-v2-login-smoke.png` |
| `/signup` | 렌더 OK, console error/warn 없음 | `reports/webui-v2-signup-smoke.png` |
| `/setup` | 앱 정책에 따라 로그인 흐름 연결, crash 없음 | DevTools snapshot/log |

---

## 5. Git 상태 / 주의 파일

현재 브랜치에는 v2 포팅 관련 변경이 많다. 커밋 전 검토 권장.

주요 untracked:

- `webui_design/` — Claude Design 원본. 포팅 기준 자료이므로 커밋 여부를 별도로 결정해야 함
- `app/components/ui/Spinner.jsx` — 신규 UI primitive
- `app/components/ui/EmptyState.jsx` — 신규 UI primitive
- `docs/WEBUI_DESIGN_V2_CONTEXT_2026-06-03.md` — 초기 파악 문서
- `docs/WEBUI_DESIGN_V2_PORT_REPORT_2026-06-03.md` — 본 리포트
- `reports/webui-v2-login-smoke.png` — 시각 검증 캡처
- `reports/webui-v2-signup-smoke.png` — 시각 검증 캡처
- `scripts/_fix-settings-columns.js`, `scripts/_seed-test-users.js` — 기존 untracked DB/테스트 보조 스크립트로 보이며 이번 검증에서 실행하지 않음

---

## 6. 남은 리스크 / 다음 추천

1. 인증 필요 화면의 실제 데이터 QA
   - admin, chat, workflow, screen-builder는 로그인/권한/DB 상태에 따라 다르다.
   - 이번에는 DB seed나 테스트 계정 생성 스크립트를 실행하지 않았다.

2. 커밋 전 diff review
   - 변경 범위가 넓으므로 `git diff --stat`와 화면별 핵심 diff를 한 번 더 확인하는 것을 권장한다.

3. 커밋 분리 추천
   - `design/webui-v2-port` 브랜치에서 아래처럼 분리하면 추적이 쉽다.
     1. foundation/token/layout/theme
     2. chat/sidebar
     3. board/notice/profile/tokens
     4. admin
     5. workflow/screen-builder
     6. docs/reports/design-source

4. `webui_design/` tracking 정책 결정
   - 장점: 디자인 원본과 포팅 근거가 repo에 남음
   - 단점: screenshots/standalone HTML 등으로 용량 증가
   - 추천: 최소한 `MIGRATION.md`, `port/`, 핵심 prototype 파일은 보관하고, screenshots 전체 커밋 여부는 별도 결정

---

## 7. 커밋 / Push 기록

분리 커밋:

```txt
c6c72f8 feat: add v2 design token foundation
d10d538 feat: port v2 chat shell
d3d29d4 feat: refresh board notice and account surfaces
ba327ef feat: align admin surfaces with v2 design
3e074c0 feat: retheme workflow and screen builder
9e90d99 feat: port v2 auth and share screens
15fa703 docs: capture webui v2 design source and report
```

후속 문서 상태 업데이트 커밋은 이 리포트 최신화를 위해 별도로 추가될 수 있다.

Push:

```txt
origin/design/webui-v2-port
```

PR 생성 URL:

```txt
https://github.com/flykimjiwon/hanimo-webui/pull/new/design/webui-v2-port
```

---

## 7. 최종 상태

- 구현 1차 완료
- lint 통과
- build 통과
- 공개 auth 화면 smoke 통과
- dev 서버 종료
- 7개 커밋으로 분리 완료
- `origin/design/webui-v2-port` push 완료
- PR 생성 URL: `https://github.com/flykimjiwon/hanimo-webui/pull/new/design/webui-v2-port`

다음 액션은 **필요 시 인증 화면 QA → PR 생성/리뷰 → main 병합** 순서가 안전하다.
