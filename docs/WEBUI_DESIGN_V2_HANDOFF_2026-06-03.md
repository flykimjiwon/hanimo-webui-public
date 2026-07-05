# Hanimo WebUI v2 디자인 포팅 핸드오프

- 작성일: 2026-06-03
- 브랜치: `design/webui-v2-port`
- 원격 브랜치: `origin/design/webui-v2-port`
- PR 생성 URL: <https://github.com/flykimjiwon/hanimo-webui/pull/new/design/webui-v2-port>
- 범위: `webui_design/` 기반 v2 디자인 포팅 상태 인수인계

---

## 1. 지금 상태

`webui_design/`에서 받은 Claude Design v2 시안을 라이브 앱 기능에 맞춰 포팅한 브랜치가 준비되어 있다.

현재 이 문서는 **추가 구현 없이 문서화/인수인계만** 목적으로 작성됐다.

브랜치에 포함된 큰 흐름:

1. v2 token foundation 반영
2. chat shell / sidebar 포팅
3. board / notice / profile / API token 화면 정리
4. admin 화면 v2 tone 정리
5. workflow / screen-builder raw 색 정리
6. login / signup / setup / sso / share 화면 정리
7. design source(`webui_design/`)와 검증 리포트 보관

---

## 2. 검증 완료 항목

아래 검증은 통과했다.

```bash
npm run lint -- --quiet
SKIP_DB_CONNECTION=true npm run build
git diff --check
```

브라우저 smoke:

- `/login` 렌더 확인
- `/signup` 렌더 확인
- `/setup` 로그인 흐름 연결 확인
- console error/warn 없음

증거 파일:

```txt
reports/webui-v2-login-smoke.png
reports/webui-v2-signup-smoke.png
```

---

## 3. 주요 문서

자세한 파악/포팅 기록은 아래 문서를 기준으로 보면 된다.

```txt
docs/WEBUI_DESIGN_V2_CONTEXT_2026-06-03.md
docs/WEBUI_DESIGN_V2_PORT_REPORT_2026-06-03.md
docs/WEBUI_DESIGN_V2_HANDOFF_2026-06-03.md
```

문서 역할:

| 문서 | 역할 |
|---|---|
| `WEBUI_DESIGN_V2_CONTEXT_2026-06-03.md` | `webui_design/` 유입 직후 구조 파악 / 디자인 DNA / 포팅 순서 |
| `WEBUI_DESIGN_V2_PORT_REPORT_2026-06-03.md` | 실제 포팅 결과 / 검증 / 커밋 / push 상태 |
| `WEBUI_DESIGN_V2_HANDOFF_2026-06-03.md` | 다음 작업자용 짧은 인수인계 |

---

## 4. 커밋 기록

현재 브랜치의 포팅 커밋:

```txt
c6c72f8 feat: add v2 design token foundation
d10d538 feat: port v2 chat shell
d3d29d4 feat: refresh board notice and account surfaces
ba327ef feat: align admin surfaces with v2 design
3e074c0 feat: retheme workflow and screen builder
9e90d99 feat: port v2 auth and share screens
15fa703 docs: capture webui v2 design source and report
610f418 docs: update v2 port completion status
```

이 핸드오프 문서가 추가되면 문서화 전용 커밋이 하나 더 붙는다.

---

## 5. 현재 남겨둔 파일 / 건드리지 않은 것

아래 파일은 DB 영향 가능성이 있어 실행/커밋하지 않았다.

```txt
scripts/_fix-settings-columns.js
scripts/_seed-test-users.js
```

의도:

- `_seed-test-users.js`: 테스트 사용자/DB seed 가능성
- `_fix-settings-columns.js`: settings DB column 수정 가능성

다음 작업자가 실제 인증 화면 QA를 할 때 필요 여부를 판단해야 한다.

---

## 6. 다음 추천 액션

지금은 추가 구현보다 아래 순서가 안전하다.

1. GitHub에서 PR 생성
   - <https://github.com/flykimjiwon/hanimo-webui/pull/new/design/webui-v2-port>
2. PR diff 검토
3. 실제 로그인 계정/DB로 인증 필요 화면 QA
   - `/`
   - `/chat`
   - `/admin/*`
   - `/workflow`
   - `/workflow/[id]`
   - `/screen-builder`
   - `/screen-builder/[id]`
4. 문제가 없으면 main 병합

---

## 7. QA 시 체크리스트

### Theme / Token

- `--hn-primary` 변경 시 primary/ring/sidebar/chart가 같이 반응하는지
- dark/light 전환 시 대비가 깨지지 않는지
- ThemeDrawer density/font/type-scale/reduce-motion prefs가 reload 후 복원되는지

### Chat

- room list / search / recent rooms 동작
- message send / loading / empty-state
- model selector
- DrawPreviewPanel이 root `/`에서 유지되는지

### Admin

- admin nav active state
- dashboard chart 색
- database table horizontal scroll
- settings 저장/취소/토스트

### Workflow / Screen Builder

- node select/focus 색
- connector 색
- test panel success/error 상태
- screen-builder preview/action 버튼

### Auth / Share

- login / signup / setup / sso
- shared screen password flow
- mobile width에서 full-bleed layout 깨짐 여부

---

## 8. 현재 판단

현재 상태는 **문서화/포팅 브랜치 준비 완료**다.

더 진행하지 않고 멈춘다면, 이 브랜치는 PR 리뷰용으로 충분히 정리되어 있다.
