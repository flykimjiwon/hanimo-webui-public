# hanimo-webui 기능 테스트 리포트 (라운드로빈 · Auth · 쓰기 플로우) — 2026-06-01

> 작성: 2026-06-01 · 저자: 김지원(flykimjiwon)
> 방법: dev 서버(:3100) + 가짜 Ollama 서버(`scripts/mock-ollama.js`) + admin 토큰 실측

---

## 1. 가짜 Ollama 서버로 모델서버/라운드로빈 검증

실제 Ollama/GPU 없이 테스트하기 위해 무의존 Node HTTP **mock Ollama**(`scripts/mock-ollama.js`)를 작성. `/api/tags`·`/api/chat`·`/api/generate`·`/v1/chat/completions` 구현, **요청→로딩(0.35s)→응답**, 응답에 처리 포트 표시.

```bash
node scripts/mock-ollama.js 11434 mockA &
node scripts/mock-ollama.js 11435 mockB &
node scripts/mock-ollama.js 11436 mockC &
```

### ① 모델서버 연동 (가짜 서버 → 모델 목록)
`GET /api/model-servers/models?endpoint=http://localhost:11434` → **HTTP 200**, mock 모델(gemma3:1b·qwen2.5:7b) 정상 수신. (※ 이 라우트는 직전에 `endpointParam` ReferenceError로 500이었음 — 수정 실증됨)

### ② 라운드로빈 — 검증·통과 ✅
mock 3대를 **같은 이름 `mockfarm`**으로 `settings.custom_endpoints`에 등록 후:

**감지** `GET /api/admin/check-round-robin?modelName=mockfarm-gemma3:1b`
→ `{"isRoundRobin":true,"serverCount":3,"endpoints":[11434,11435,11436]}`

**회전** `POST /api/model-servers/generate` 6연속 (`model=mockfarm-gemma3:1b`):

| 요청 | 처리 서버 |
|---|---|
| #1 | :11434 |
| #2 | :11435 |
| #3 | :11436 |
| #4 | :11434 |
| #5 | :11435 |
| #6 | :11436 |

mock 히트 로그 분배: **11434×2 · 11435×2 · 11436×2 (균등)**. 실제 코드 경로(`getModelServerEndpointByName` → `serverNameCursors` 회전)로 **부하분산 정상 동작 확인**.

> 결론: 라운드로빈 백엔드는 **정상 작동**. "제대로 안 돈다"의 구조적 결함은 없음. (운영 시엔 mock 대신 실제 Ollama 엔드포인트를 같은 이름으로 N개 등록하면 동일하게 분배됨)

---

## 2. 발견·수정: Auth `sub→id` 매핑 누락 (14개 라우트 영향) ✅

쓰기 플로우 점검 중 **워크플로우를 생성해도 목록에 안 보이는** 현상 발견.

- **원인**: 로그인은 사용자 id를 JWT `sub`에 서명(`login/route.js:78`). `verifyToken`은 `sub→id/userId`를 매핑하지만(`auth.js:34`), **`verifyTokenWithResult`/`verifyAdminWithResult`/`verifyAdminOrManagerWithResult`는 raw payload를 그대로 반환**해 `auth.user.id`가 `undefined`.
- **증상**: `INSERT ... user_id = undefined` → `user_id: null` 저장 → 목록 쿼리 `WHERE user_id=$1`에서 누락. (워크플로우 생성→사라짐)
- **영향 범위**: `verifyTokenWithResult` + `auth.user.id` 사용 **14개 라우트** — workflows(6)·board(4)·screens/screen-builder(4).
- **수정**: 3개 `*WithResult` 함수가 `user: { ...decoded, id: decoded.id || decoded.sub, userId: ... }`를 반환하도록 단일 지점 수정.
- **검증**: 워크플로우 생성 시 `user_id=43cac61a-...` 정상 채워짐 → **목록에 1개 표시**(이전 빈 배열). 워크플로우 기능 end-to-end 복구.

---

## 3. 쓰기 플로우 점검 결과

| 기능 | 결과 |
|---|---|
| 워크플로우 생성/목록 | ✅ (auth 수정 후 정상) |
| 게시판 글 작성 | ✅ 200 |
| 모델서버 generate (라운드로빈) | ✅ 회전 정상 |
| 채팅방/메시지 `POST /api/webapp-chat` | 메시지 필요(설계상 정상) — 방 생성은 별도 흐름 |
| API 토큰 발급 `POST /api/admin/api-tokens` | "User ID is required" — 대상 userId 필요(설계 확인 요) |

---

## 4. 누적 수정 (이 세션, hanimo-webui)

1. `layout.js` 테마 init try/catch (SyntaxError·FOUC)
2. `settings.theme_preset/theme_colors` 컬럼 누락
3. `model-servers/models` `endpointParam` ReferenceError → 가짜 서버로 200 실증
4. `workflows` 테이블 3종 부재 → autoMigrate 추가
5. **Auth `sub→id` 매핑 누락 → 14개 라우트 복구**
6. **라운드로빈 동작 검증**(가짜 Ollama 3대, 균등 회전)

도구: `scripts/mock-ollama.js` (실서버 없이 모델서버·라운드로빈 테스트).

---

## 5. 남은 점검

- `api-tokens` 발급 시 userId 요구 흐름 확인(관리자가 특정 사용자에게 발급하는 설계인지)
- 채팅 UI end-to-end(모델 셀렉터에 mockfarm 모델 노출 → 실제 대화)
- Docker 이미지 빌드 실검증(`docker compose build`)
- 전체 기능 인벤토리 문서(19 admin + 전 페이지) 정리

*검증 환경: Next.js 15.5.9 dev(:3100) · PostgreSQL · mock Ollama ×3*
