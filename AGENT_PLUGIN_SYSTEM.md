# hanimo-webui Agent Plugin System — 컨셉 설계서

> 최초 작성: 2026-03-11  
> 상태: **컨셉 단계** (미구현) 

---

## 1. 한 줄 요약

> "에이전트는 WordPress 플러그인처럼 — 필요한 것만 설치하고, 업데이트하면 즉시 반영된다."

---

## 2. 비전 & 메타포

### WordPress Plugin 모델
WordPress가 기능을 플러그인으로 분리해 독립적으로 설치/업데이트/비활성화할 수 있듯이,  
hanimo-webui의 에이전트도 **독립 패키지**로 존재한다.

| WordPress | hanimo-webui Agent |
|---|---|
| 플러그인 설치 | 에이전트 등록 (DB or 파일) |
| 플러그인 활성화 | 에이전트 enable |
| 플러그인 업데이트 | git pull 또는 fetch latest config |
| 관리자 > 플러그인 목록 | Admin > 에이전트 관리 |
| 플러그인 설정 페이지 | 에이전트 파라미터 설정 |
| 공개 플러그인 디렉토리 | (미래) hanimo-webui Agent Hub |

---

## 3. 현재 구조 (AS-IS)

```js
// app/components/AgentSelector.js
const AGENTS = [
  { id: 'chat',   name: 'Chat',     path: '/' },
  { id: 'agent7', name: 'PPT Maker', path: '/agent/7' },
];
```

**문제점**:
- 에이전트 목록이 프론트엔드 코드에 하드코딩
- 새 에이전트 추가 = 코드 수정 + 배포 필요
- 에이전트 간 독립성 없음

---

## 4. 목표 구조 (TO-BE)

### 4.1 에이전트 정의 (Agent Manifest)

각 에이전트는 **manifest** 파일(또는 DB 레코드)로 자신을 정의한다.

```json
{
  "id": "ppt-maker",
  "version": "1.2.0",
  "name": {
    "ko": "PPT 메이커",
    "en": "PPT Maker"
  },
  "description": {
    "ko": "AI가 프레젠테이션 슬라이드를 자동 생성합니다",
    "en": "Auto-generate presentation slides with AI"
  },
  "icon": "Presentation",
  "path": "/agent/ppt-maker",
  "category": "productivity",
  "author": "hanimo Team",
  "enabled": true,
  "config": {
    "model": "gpt-4o",
    "maxSlides": 20,
    "allowedUsers": "all"
  },
  "requiredPermissions": ["chat", "file_upload"],
  "ui": {
    "showInSelector": true,
    "selectorOrder": 2
  }
}
```

### 4.2 에이전트 등록 방식 (3가지 레벨)

#### Level 1 — DB 기반 (현재 구조 확장)
```
agents 테이블에 manifest JSON 저장
Admin 패널에서 CRUD
→ 코드 배포 없이 에이전트 추가/제거 가능
```

#### Level 2 — 파일 기반 (플러그인 디렉토리)
```
/agents/
  ppt-maker/
    manifest.json
    page.js         ← Next.js 페이지
    prompt.txt      ← 시스템 프롬프트
    config.json     ← 기본 설정
  code-review/
    manifest.json
    ...
```
**git pull 후 자동 감지** — 새 에이전트 디렉토리가 생기면 서버 재시작 없이 등록

#### Level 3 — 원격 레지스트리 (미래)
```
Agent Hub (npmjs 같은 개념):
npm install @hanimo-webui-agents/sql-assistant
→ /agents/sql-assistant/ 에 설치
→ Admin에서 활성화
```

### 4.3 에이전트 선택기 (AgentSelector) TO-BE

```jsx
// 하드코딩 대신 API에서 동적 로드
const { agents } = useAgents(); // GET /api/agents?enabled=true

return (
  <select>
    {agents.map(agent => (
      <option key={agent.id} value={agent.id}>
        {agent.name[lang]}  {/* i18n 지원 */}
      </option>
    ))}
  </select>
);
```

---

## 5. 에이전트 라이프사이클

```
[개발/작성]
     │
     ▼
[manifest.json 작성]
     │
     ▼
[설치] ──── git pull or npm install or Admin UI에서 JSON 업로드
     │
     ▼
[등록] ──── DB insert or 파일 감지
     │
     ▼
[활성화] ─── Admin > 에이전트 관리 > enable 토글
     │
     ▼
[사용자 화면] ─── AgentSelector에 자동 노출
     │
     ▼
[업데이트] ─── manifest version bump → git pull → hot reload
     │
     ▼
[비활성화/삭제] ─── Admin에서 disable or 파일 제거
```

---

## 6. 에이전트 카테고리 (예시)

| 카테고리 | 예시 에이전트 |
|---|---|
| `productivity` | PPT Maker, 문서 요약, 회의록 작성 |
| `dev` | 코드 리뷰, SQL 생성, 디버깅 어시스턴트 |
| `data` | 데이터 분석, 차트 생성, Excel 처리 |
| `creative` | 카피라이팅, 이미지 프롬프트 생성 |
| `hr` | 채용 공고 작성, 인터뷰 질문 생성 |
| `custom` | 조직 맞춤 에이전트 |

---

## 7. 권한 모델

```
에이전트 접근 권한:
  - "all"       → 모든 사용자
  - "admin"     → 관리자만
  - ["group_a", "group_b"] → 특정 그룹
  - userIds[]   → 특정 사용자 지정
```

Admin > 에이전트 관리 에서 접근 범위 설정.  
AgentSelector는 현재 사용자 권한에 맞는 에이전트만 노출.

---

## 8. 구현 우선순위 (Roadmap)

### Phase 1 — DB 기반 동적 로드 (단기)
- [ ] `agents` 테이블에 `manifest JSONB` 컬럼 추가
- [ ] `GET /api/agents` — 활성화된 에이전트 목록 반환
- [ ] `AgentSelector` → API 기반으로 전환 (하드코딩 제거)
- [ ] Admin > 에이전트 페이지에서 활성화/비활성화 UI

### Phase 2 — 파일 기반 플러그인 (중기)
- [ ] `/agents/` 디렉토리 스캔 → 자동 등록
- [ ] manifest schema 정의 및 validation
- [ ] 에이전트별 시스템 프롬프트 파일 분리

### Phase 3 — Agent Hub (장기, 선택)
- [ ] 원격 레지스트리 API 설계
- [ ] install/uninstall CLI 또는 Admin UI
- [ ] 에이전트 버전 관리 (semver)
- [ ] 서드파티 에이전트 샌드박싱

---

## 9. 현재 에이전트 목록

| ID | 이름 | 경로 | 상태 |
|---|---|---|---|
| `chat` | 기본 채팅 | `/` | ✅ 운영 중 |
| `agent7` | PPT Maker | `/agent/7` | ✅ 운영 중 (ID 정규화 필요) |

> ⚠️ agent ID가 숫자(`agent7`)로 되어있음 → Phase 1에서 slug 기반(`ppt-maker`)으로 정규화 권장

---

## 10. 관련 파일

| 파일 | 역할 |
|---|---|
| `app/components/AgentSelector.js` | 메인 화면 에이전트 선택 UI (현재 하드코딩) |
| `app/components/chat/AgentSidebar.js` | 채팅 내 에이전트 사이드바 |
| `app/admin/agents/page.js` | Admin 에이전트 관리 페이지 |
| `app/agent/[id]/page.js` | 에이전트 실행 페이지 (동적 라우팅) |
| `app/api/agents/` | 에이전트 CRUD API (확장 예정) |
