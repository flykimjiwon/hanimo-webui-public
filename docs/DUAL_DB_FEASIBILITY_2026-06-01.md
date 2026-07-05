# hanimo-webui — DB 추상화(PostgreSQL + MongoDB) 타당성 평가 & OSS 셋업 가이드

> 작성: 2026-06-01 · 저자: 김지원(flykimjiwon)
> 질문: "next.js + Postgres **or** MongoDB 2개 DB 권장·호환되게 만들 수 있나? 가능성 먼저 파악하고 가이드 작성. 오픈소스로 만들 거니 누구나 쉽게 세팅."
> 방법: 코드 전수 조사(읽기 전용) 기반 실측. 추측 아님.

---

## 1. 결론 먼저 (TL;DR)

- **표면적 호환(단순 CRUD)**: 약 60%는 기계적으로 변환 가능.
- **진짜 이식(전체 기능 동작)**: **난이도 높음 — 대규모 리팩터링**. 단순 어댑터 교체로 안 됨.
- **가장 빠르게 "누구나 쉽게 세팅" 달성하는 법**: MongoDB 추가가 아니라 **기존 PostgreSQL 세팅을 Docker 원클릭으로 만드는 것**(이번에 추가됨 → `docker-compose.yml`).
- **권장**: Postgres 기본 유지 + **Docker 1-command**(Phase 0, 완료) → 필요 시 **Repository 레이어**(Phase 1) → 그 위에 **MongoDB 어댑터**(Phase 2). 총 7~10주.

---

## 2. 현재 PostgreSQL 결합도 (실측)

| 지표 | 수치 | 의미 |
|---|---|---|
| 전체 API 라우트 | 99 | `app/api/**/route.js` |
| `@/lib/postgres` import | **80 (80.8%)** | 라우트 대부분 DB 직접 접근 |
| `query()` 호출 | **478회** | 라우트당 평균 ~6회 |
| `RETURNING` (PG 전용) | 30+ | `INSERT...RETURNING *` |
| `ILIKE`/`::int`/`COALESCE`/`TO_CHAR` 등 PG 문법 | 181 | 캐스팅·함수 |
| `JOIN` | 52 | Mongo는 `$lookup` 변환 필요 |
| `ON CONFLICT` (upsert) | 9 | PG 전용 |
| `information_schema`/`pg_stat_*`/DDL introspection | **348** | **최대 장벽** |
| 날짜 함수(`NOW()`/`CURRENT_TIMESTAMP`/`TO_CHAR`) | 153 | 변환 필요 |
| 트랜잭션(BEGIN/COMMIT/ROLLBACK) | 5~6 | autoMigrate/db-reset 등 |
| JSONB 컬럼 | 20+ 테이블 | Mongo 강점 영역 |
| DB 의존성 | `pg ^8.16.3` 단일 | — |

### 핵심 장벽
- **A. 관계형 스키마 + FK 체인** — `users→chat_rooms→chat_history→messages`, FK `ON DELETE CASCADE/SET NULL`. Mongo는 앱 레벨에서 참조 무결성 보장 필요.
- **B. `information_schema` 동적 DDL (매우 높음)** — 런타임에 컬럼 존재 확인 후 `ALTER TABLE ADD COLUMN`. (`admin/settings`, `webapp-chat`, `board/posts`, `admin/database`, `modelTables.js` 등). Mongo엔 동등 introspection 없음 → 마이그레이션 전략 자체가 다름.
- **C. 복합 분석 쿼리** — `admin/analytics`(530줄): `TO_CHAR`/`UNION ALL`/서브쿼리/캐스팅 8+개 병렬. Mongo aggregation 변환 시 코드 2~3배.
- **D. `RETURNING *`** — 30+곳. Mongo는 `insertOne` 후 추가 `findOne` 필요.

---

## 3. 아키텍처 옵션 비교

| 옵션 | Mongo 달성 | 기존 코드 변경 | 프로젝트 철학("No ORM") | 공수 | 추천 |
|---|---|---|---|---|---|
| **A. Repository/DAL 자체** | O | 매우 높음 | 유지 | 6~8주 | **1순위(장기)** |
| B. Prisma | 부분(Mongo relation 미지원) | 매우 높음 | 위반 | 5~7주 | 3순위 |
| C. Drizzle | **X(SQL 계열만)** | 중간 | 유지 | 3~4주 | 목표 불충족 |
| D. SQL→Mongo 번역기 | 이론상 | 최소 | 유지 | 10주+ | 비추천(비현실적) |

- **A**: 80파일·478쿼리를 `db.users.findByEmail()` 같은 repository로 캡슐화. ORM 없이 완전한 제어, 각 DB 최적화 가능. 초기 공수 큼.
- **B(Prisma)**: PG/Mongo 공식 지원이나 **Mongo에서 JOIN/relation 미지원** → 결국 코드 분기 부담 동일 + CLAUDE.md "Don't add an ORM" 위반.
- **D**: 범용 SQL 파서(JOIN/서브쿼리/`information_schema` 변환)는 별도 프로젝트급 — 절대 비추천.

---

## 4. 권장 로드맵 (단계적)

### Phase 0 — Docker 원클릭 (1~2일) ✅ **이번에 추가됨**
> 진짜 진입장벽은 "Mongo 부재"가 아니라 "PostgreSQL 직접 설치". → `Dockerfile` + `docker-compose.yml` 추가로 해소.
```bash
git clone https://github.com/flykimjiwon/hanimo-webui.git
cd hanimo-webui && cp .env.example .env   # JWT_SECRET 변경
docker compose up -d                       # 끝. 5분 이내.
# http://localhost:3000  (.env의 HANIMO_ADMIN_EMAIL / HANIMO_ADMIN_PASSWORD)
```

### Phase 1 — Repository 레이어 (2~3주)
raw SQL을 라우트에서 분리해 `app/lib/db/postgres/<table>.js`로 캡슐화(아직 Mongo 미구현, 인터페이스만 정립).
```
app/lib/db/
├── driver.js          # DB_DRIVER 분기
├── index.js           # export { users, chatRooms, messages, settings, ... }
├── postgres/          # 기존 pg 기반 구현
└── mongo/             # Phase 2 스텁
```
우선순위: `users → chat_rooms/chat_history → messages → settings → models → board → 부가`.
**PG 전용 유지(제외)**: `admin/database`(information_schema 본질 의존), `admin/analytics`, `db-schema/backup/reset/restore`, `autoMigrate`/`modelTables`.

### Phase 2 — MongoDB 어댑터 (4~6주)
Phase 1 인터페이스에 `app/lib/db/mongo/*.js` 구현. `.env`의 `DB_DRIVER=mongo`로 전환.

| PostgreSQL | MongoDB |
|---|---|
| `UUID PK DEFAULT uuid_generate_v4()` | `_id: ObjectId()` |
| `REFERENCES ... ON DELETE CASCADE` | 앱 레벨 참조 + 수동 cascade |
| `INSERT ... RETURNING *` | `insertOne()` + `findOne()` |
| `JOIN` | `$lookup` 또는 2-query |
| `ILIKE $1` | `{ $regex, $options: 'i' }` |
| `ON CONFLICT DO UPDATE` | `updateOne(..., { upsert: true })` |
| `JSONB` | 네이티브 document |
| `information_schema` | `listCollections()`/`stats()` (제한적) |

---

## 5. OSS 셋업 가이드

### A. Docker (권장 · 가장 빠름)
```bash
git clone https://github.com/flykimjiwon/hanimo-webui.git
cd hanimo-webui
cp .env.example .env          # JWT_SECRET 변경 (openssl rand -hex 32)
docker compose up -d
# http://localhost:3000
```

### B. 직접 설치 (Node 20+ · PostgreSQL 14+)
```bash
git clone https://github.com/flykimjiwon/hanimo-webui.git
cd hanimo-webui && npm install
createdb hanimo
cp .env.example .env
#   POSTGRES_URI=postgresql://user:pass@127.0.0.1:5432/hanimo
#   JWT_SECRET=$(openssl rand -hex 32)
npm run setup-postgres && npm run create-admin
npm run dev   # http://localhost:3000
```

### C. 클라우드 PostgreSQL (Supabase/Neon/Railway/Render)
```bash
POSTGRES_URI=postgresql://user:pass@cloud-host:5432/hanimo?sslmode=require
```

### `.env` DB 선택 스위치(설계 — Phase 2 이후)
```bash
# DB_DRIVER: postgres (default) | mongo
DB_DRIVER=postgres
POSTGRES_URI=postgresql://hanimo:hanimo@127.0.0.1:5432/hanimo
# MONGODB_URI=mongodb://127.0.0.1:27017/hanimo   # DB_DRIVER=mongo 시
```
```javascript
// app/lib/db/driver.js (제안)
const D = (process.env.DB_DRIVER || 'postgres').toLowerCase();
module.exports = D === 'mongo' ? require('./mongo') : require('./postgres');
```

---

## 6. 공수 견적

| Phase | 공수 | 파일 | 라인 |
|---|---|---|---|
| 0 Docker | 1~2일 | 4 | ~135 |
| 1 Repository | 2~3주 | ~78 | ~3,700 |
| 2 Mongo | 4~6주 | ~25 | ~3,490 |
| **합계** | **7~10주** | **~107** | **~7,325** |

### Trade-off
- **Phase 0만**: 즉시 효과, OSS 사용자 99%의 셋업 고통 해결. Mongo 선택지는 없음. ← **현 시점 최선의 ROI**
- **Phase 0+1**: 코드 품질↑(raw SQL 분리), DB 교체 가능 구조. 2~3주 리팩터링 투자.
- **전부**: "Postgres or Mongo" OSS 셀링포인트. 7~10주 + 테스트/유지보수 2배. admin 분석은 PG에서만 완전 동작.

---

## 7. 권고

1. **지금**: Phase 0(Docker)로 "누구나 쉽게 세팅" 달성 — 완료(`Dockerfile`/`docker-compose.yml`).
2. **다음**: 수요가 확인되면 Phase 1(Repository)로 구조 정비 — 그 자체로 코드 품질·테스트성 향상.
3. **그 후**: MongoDB 수요가 실재하면 Phase 2. 단, `admin/database`·`analytics`는 PG 전용으로 남기는 현실적 타협 권장.

*근거 파일: `app/lib/postgres.js`(query/transaction 계약), `app/lib/autoMigrate.js`(22 CORE_TABLES DDL), `app/api/admin/{settings,analytics,database}/route.js`(information_schema 의존), `scripts/create-postgres-schema.js`(30+ 테이블), `package.json`(pg 단일 의존).*
