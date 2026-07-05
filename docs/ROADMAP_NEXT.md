# 다음 라운드 ROADMAP — hanimo-webui 본 프로젝트

> 2026-05 기준. hanimo-webui 본 프로젝트 한정 작업.
> 별도 라이브러리(hanimo-pick 등)는 각자 독립 리포에서 관리합니다.

> 공개 OSS 런칭 전 기준: P0(Next 보안 패치, CI, manager auth 정합, public screen SSRF 방어, admin 위험 기능 hardening, README truth pass) 완료 전까지 차단으로 판정. 현재 상태는 내부 데모 가능.

---

## 1. admin/models God 컴포넌트 분해

### 현재 상태 (2026-05-06 갱신)
1차 분해는 이미 진행됨. 진짜 잔존 부채는 ModelForm + useModelConfig.

| 파일 | 줄수 | 상태 |
|---|---|---|
| `app/admin/models/page.js` | **438** | 적정. 분해 1차 완료 |
| `app/admin/models/components/ModelForm.jsx` | **727** | 큰 잔여. 입력 폼 (모델 추가 + 편집) |
| `app/admin/models/hooks/useModelConfig.js` | **653** (이전 732, -79 / 이번 라운드) | 줄어드는 중 |
| `app/admin/models/hooks/useEndpoints.js` | 315 | 적정 |
| `app/admin/models/hooks/useRoundRobin.js` | 240 | 적정 |
| `app/admin/models/components/ModelCard.jsx` | 195 | 적정 |
| `app/admin/models/model-utils.js` | 161 | 적정 |
| `app/admin/models/components/ErrorLogsPanel.jsx` | 113 | 적정 |
| `app/admin/models/hooks/useErrorLogs.js` | 67 | 적정 |
| `app/admin/models/components/CategoryPanel.jsx` | 66 | 적정 |
| `app/admin/models/components/PresetUrlSettings.jsx` | 60 | 적정 |
| `app/admin/models/components/UsageGuide.jsx` | 36 | 적정 |

### 이번 라운드 진행 (commit d2c7953 다음)
- `useModelConfig.js`: PUT `/api/admin/models` 호출 4건(autoSaveCategories, saveLLMModels, saveCategoryOrder, saveModelConfig)을 단일 `putModelsConfig({ categories, setBusy, successMessage })` 헬퍼로 DRY → -79줄
- 동일 동작 유지(setBusy 토글 + 성공 메시지 함수형 주입). 회귀 위험 낮음.

### 다음 라운드 후보
1. **ModelForm.jsx 727줄 분해** — 가장 큰 잔여. 모델 입력 폼 (추가 + 편집 공용) 분해:
   - `ModelBasicFields.jsx` (id / label / tooltip / endpoint / apiKey)
   - `ModelMultiturnFields.jsx` (multiturnLimit / multiturnUnlimited)
   - `ModelSystemPromptEditor.jsx` (systemPrompt 배열 편집)
   - `ModelApiConfigEditor.jsx` (apiConfig JSON 편집)
   - 나머지: 컨테이너 컴포넌트로 축소
   - 예상: 2-3시간, 위험 중간 (UI 회귀)
2. **useModelConfig.js 추가 정리** — 남은 분기에서 PII dead code 제거 (modelTables.js 분해와 함께)
3. **공통 모델 fetch 훅** — chat의 `ModelSelector` / admin/models 양쪽이 같은 modelConfig을 fetch. 단일 캐싱 hook으로 통합 가능.

---

## 2. 추가 PII 잔존 정리

PII 핵심은 이미 제거됐고 2차까지 진행 완료. 남은 항목은 운영 통계 SQL뿐.

### 1차 완료 (commit 6f9ed2a)
- `app/admin/models/page.js` — UI 옵션 제거
- `app/admin/models/components/ModelForm.jsx` — PII 필터 폼 필드 제거
- `app/admin/models/hooks/useModelConfig.js` — PII 설정 read/write 제거
- `app/admin/models/model-utils.js` — PII helper 제거
- `app/lib/dbColumnDescriptions.js` — pii_* 설명 제거

### 2차 완료 (이번 커밋)
- `app/lib/i18n/ko-admin.json`, `en-admin.json` — pii_logs / pii_test / security_logs / 12개 PII 타입 라벨 제거
- `app/lib/i18n/ko.json`, `en.json` — chat.pii_detected 제거
- `app/api/admin/migrate-models/route.js` — REQUIRED_MODEL_COLUMNS / ALTER TABLE에서 pii_* 컬럼 제거
- `app/lib/autoMigrate.js` — pii_* 컬럼 정의 / 잔존 주석 제거
- `app/lib/modelTables.js` — column 체크 쿼리에서 pii 이름 제거, hasPiiColumns/hasPiiOptionColumns 강제 false (deeply nested 분기는 죽은 코드로 남되 실행 경로에서 분기 무효화 — admin/models 분해 라운드와 함께 완전 제거 예정)

### 3차 잔존 (admin/models 분해와 함께)
- `app/api/admin/dashboard/route.js`, `analytics/route.js`, `external-api-logs/route.js`, `db-connection-check/route.js` — PII 관련 통계 SQL (실행 시 컬럼 부재로 폴백 또는 0 반환되므로 무해)
- `app/lib/modelTables.js` 깊은 분기의 pii UPDATE/INSERT 죽은 코드

### 예상
- **시간**: admin/models 분해 라운드에 통합하면 30분 추가
- **위험**: 낮음 — 본 흐름에서 PII는 이미 모든 경로 무력화됨

---

## 3. 운영 / 인프라 (후순위)

> 본 ROADMAP에서 후순위로 분류. admin/models 분해 + PII 잔존 정리 끝난 다음 라운드에서 진행.

### Docker Compose (single stack)
- `docker-compose.yml` — Next.js 컨테이너 + Postgres 컨테이너 단일 stack
- `Dockerfile` — production build (output standalone)
- 단일 명령(`docker compose up`)으로 전체 띄우기
- 추정: 2시간

### GitHub Actions CI
- lint + build 통과 확인
- Playwright 워크플로는 이미 비활성화 — 신규 가벼운 ci.yml로 교체
- 추정: 1시간

### static crypto salt 환경 변수화
- `app/api/user/api-tokens/route.js`의 하드코딩 `'salt'` → `process.env.API_TOKEN_SALT`
- 추정: 30분

---

## 4. (선택) 추가 디자인 라운드

이미 spot amber 톤 + Pretendard + 토큰 시스템 + ThemeDrawer + SidebarRail이 박힘.
추가 변경은 사용자 요청 시 선택적으로:

- ChatHeader / Sidebar / footer 추가 미세 정리
- chat empty state 칩 클릭 → 입력창 자동 채우기 인터랙션
- 모바일 ChatLayout의 SidebarRail 노출 정책
- LanguageSwitcher UX 추가 강화

---

## 우선순위 권장

| 순위 | 작업 | 이유 |
|---|---|---|
| 1 | **PII 잔존 정리** (1번에 통합) | 30분~1시간, 깔끔 |
| 2 | **admin/models God 컴포넌트 분해** | 가장 큰 부채. 단계별 PR |
| 3 | **운영 / 인프라** | Docker Compose / CI / salt env — 점진 도입 |

---

## 별도 리포에서 관리되는 자산

- **hanimo-pick** — LLM 에이전트 개발 도구 (Claude Code / Codex / Gemini용 plugin·skill·harness)
  - 위치: `~/Desktop/kimjiwon/hanimo-pick/` (별도 git, hanimo-webui와 분리)
  - hanimo-webui 본 프로젝트와 의존 관계 없음
  - hanimo-community 채널로 별도 배포 예정

> 이 리포(hanimo-webui)에는 hanimo-pick의 흔적이 남아있지 않습니다. 다른 리포의 ROADMAP은 `hanimo-pick/PLAN.md` 참조.

---
