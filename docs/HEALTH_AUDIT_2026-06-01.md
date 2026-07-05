# hanimo-webui 기능 헬스 감사 & 수정 로그 — 2026-06-01

> 작성: 2026-06-01 · 저자: 김지원(flykimjiwon)
> 범위: 런타임 기능 헬스 스윕(로그인 토큰 기반 전 GET API 실측) + 발견 버그 수정 + 저작권 표기 보강

---

## 0. 한 줄 요약

dev 서버(`:3100`)를 띄우고 admin 토큰으로 **전체 GET API 56개를 실측 순회**해 실제로 깨진 기능을 찾아 수정했다. 브라우저 콘솔/서버 로그에서 발견된 **4건의 실제 버그를 수정·검증**했고, 오픈소스 배포를 위한 **저작권 표기(김지원/flykimjiwon)**를 보강했다.

---

## 1. 테스트 계정 (로컬 검증용)

비밀번호 공통 `hanimo@test1` (bcrypt 12라운드):

| email | 역할 |
|---|---|
| `test-admin@hanimo.ai` | admin |
| `test-manager@hanimo.ai` | manager |
| `test-user@hanimo.ai` | user |

> 운영 배포 시 삭제 권장. 생성은 `node scripts/create-admin.js <email> <pw> <name>` 또는 멀티롤 시드.

---

## 2. 헬스 스윕 방법

1. `POST /api/auth/login` → JWT access token(`{"token": "..."}`) 획득
2. 전 `app/api/**/route.js` 중 `export async function GET` 보유 + 동적 `[param]` 없는 라우트 **56개**를 Bearer 토큰으로 순회
3. HTTP 코드 수집 → 5xx(실제 깨짐) 집중 진단, 4xx(권한/파라미터)는 정상 분류

**결과:** 56개 중 2xx/3xx 51 · 5xx **2건(실제 버그)** · 4xx 3건(정상: `/v1/models`는 API 토큰 인증, `/admin/check-round-robin`·`/admin/system-status/endpoint`는 파라미터 필요)

---

## 3. 발견·수정한 버그 (4건, 전부 검증 완료)

### ① `app/layout.js` — no-flash 테마 inline script SyntaxError
- **증상:** 브라우저 콘솔 `Uncaught SyntaxError: Missing catch or finally after try` → 테마/언어 복원 스크립트 전체 무효화(FOUC)
- **원인:** IIFE의 바깥 `try {`에 `catch`/`finally` 누락(내부 try만 닫힘)
- **수정:** 바깥 try에 `catch (e) {}` 추가 → 서빙 HTML에서 확인
- **영향:** 전 사용자(첫 로드 깜빡임/테마 미적용)

### ② `settings` 테이블 `theme_preset`/`theme_colors` 컬럼 누락
- **증상:** 서버 로그 `column "theme_preset" does not exist`, `GET /api/public/settings` 에러(기본값으로 degrade되나 노이즈)
- **원인:** `public/settings` 라우트가 컬럼 존재를 가정하나 미생성(컬럼 추가 로직은 admin 라우트에만 lazy 존재)
- **수정:** `theme_preset VARCHAR(30) DEFAULT 'amber-soft'`, `theme_colors JSONB DEFAULT '{}'` 컬럼 추가 → `/api/public/settings` **HTTP 200** 확인

### ③ `app/api/model-servers/models/route.js:646` — `ReferenceError: endpointParam is not defined`
- **증상:** 모델서버 연결 실패 시 catch 블록이 또 크래시 → 500
- **원인:** `endpointParam`·`provider`·`modelServerUrl`이 `try` 블록 내부 선언이라 `catch`에서 스코프 밖
- **수정:** 3개 변수를 함수 스코프로 hoist → 이제 모델서버 미연결 시 **graceful 에러 JSON** 반환(올라마 연결 시 정상 200)

### ④ `workflows`/`workflow_endpoints`/`workflow_executions` 테이블 부재 → 워크플로우 기능 전체 불능
- **증상:** `GET /api/workflows` 500 `relation "workflows" does not exist`
- **원인:** 워크플로우 기능이 참조하는 3개 테이블이 `autoMigrate.js` CORE_TABLES에 미정의(스키마 누락)
- **수정:** 라우트 쿼리에서 전체 컬럼을 도출해 `autoMigrate.js`에 3개 테이블 추가(IF NOT EXISTS) → admin 로그인 시 자동 생성, `GET /api/workflows` **HTTP 200** 확인
- **컬럼:** workflows(definition/input_schema/output_schema/version/status/is_published 등), workflow_endpoints(endpoint_url/api_key_encrypted/provider_type/model_name), workflow_executions(inputs/outputs/node_states/status/source/total_tokens/execution_time/error/completed_at)

---

## 4. 저작권 표기 보강 (오픈소스 배포 대비)

- `package.json`: `author`("Kim Jiwon (김지원) (https://github.com/flykimjiwon)")·`license`("Apache-2.0")·`repository`·`homepage`·`bugs`·`keywords` 필드 신설
- `README.md`: **저작자/Author 섹션** 신설(김지원/flykimjiwon, 개인 OSS·non-work-for-hire 명시) + 라이선스 저작권 라인
- 기존 `NOTICE`(Copyright 2025-2026 Kim Jiwon, 생태계 내력)·`LICENSE`(Apache 2.0 + 저작권 라인)는 양호 — 유지

---

## 5. 남은 점검 항목 (후속)

- **Ollama 서버 등록**: 연동 코드는 존재(`model-servers/instances`). 실서버 등록·라운드로빈 end-to-end는 실제 Ollama 인스턴스로 검증 필요
- **라운드로빈**: 로직 존재(`modelServers.js` 서버명/라벨/전역 커서 3종). `check-round-robin?modelName=` 로 동작 확인 가능 — 멀티서버 환경 실측 권장
- **POST/PUT/DELETE 라우트 + 클라이언트 페이지** 인터랙션 레벨 헬스 스윕(이번엔 GET만)
- **듀얼 DB(Postgres/Mongo) 호환성** 타당성 검토 + OSS 셋업 가이드 (별도 문서 작성 예정)
- 기능 총망라 인벤토리(19 admin + 전 페이지 + API + infra)는 별도 문서로 정리 예정

---

*검증 환경: Next.js 15.5.9 dev(:3100) · PostgreSQL(:5432) · node v24*
