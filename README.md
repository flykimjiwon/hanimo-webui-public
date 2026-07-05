<p align="center">
  <img src="app/icon.svg" alt="hanimo — Modol the Honey-Bee Bichon" width="128">
</p>

[English](README_en.md)

# hanimo-webui

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-f5a623.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-f5a623.svg)](https://nextjs.org)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-f5a623.svg)](https://tailwindcss.com)
[![Postgres](https://img.shields.io/badge/Postgres-15+-f5a623.svg)](https://www.postgresql.org)

hanimo-webui는 Next.js 15 기반의 **오픈소스 셀프호스팅 AI 챗 + 관리자 런타임 + OpenAI 호환 API**입니다.

첫 공개판의 핵심 약속은 채팅, 모델 서버 설정, 사용자/권한 관리, API 토큰, OpenAI-compatible API입니다. Workflow / Screen / RAG / MCP 계열은 삭제 대상이 아니라, 공개판에서는 Labs 또는 플러그인 후보로 분리합니다.

> 공개 준비 상태: P0 RCE/SSRF 계열 게이트는 `main`에서 코드 실측으로 해소됐습니다.
> 다만 공개 전에는 `test:workflow`, `test:screen-security`, API 토큰/JWT, 관리자 DB 작업, smoke check를 다시 통과시키고, "보안 완료"가 아니라 **P0 해소 + 운영 게이트 잔여**로 표기합니다.

---

## 주요 특징

| 기능 | 설명 |
|------|------|
| 멀티모델 채팅 | Ollama, OpenAI 호환, Gemini 등 여러 모델을 동시에 연결하고 방별로 선택 |
| 에이전트/워크플로우/스크린 | 첫 공개판에서는 Labs 또는 플러그인 후보. core 안정화 후 manifest/권한/audit 모델과 함께 분리 공개 |
| Draw (캔버스) | AI가 HTML 시각화를 생성하면 실시간 미리보기 (iframe 샌드박싱) |
| Custom Instruction | 채팅방별 사용자 지정 시스템 프롬프트 설정 |
| OpenAI 호환 API | `/v1/chat/completions`, `/v1/models`, `/v1/embeddings`, `/v1/rerank` |
| 관리자 패널 | 사용자, 모델, 모델 서버, 로그, 설정, 분석 대시보드 |
| DB 뷰어 | 관리자용 데이터베이스 조회/검색/정렬/CRUD + 컬럼 설명 툴팁 |
| PII/커뮤니티/SSO | 첫 공개판에서는 stable core가 아닌 Labs/운영 확장 영역 |
| 인증 | 로컬 로그인 + JWT 리프레시 토큰. SSO는 운영 확장 후보 |
| 다국어 | 한국어 / 영어 완전 지원 (i18n) |
| 테마 | 프리셋 + 커스텀 색상, 다크/라이트 모드 |

---

## 기술 스택

| 항목 | 버전/도구 |
|------|----------|
| 프레임워크 | Next.js 15.5.9 |
| 런타임 | React 19.2.1 |
| 언어 | JavaScript (`app/` App Router, `jsconfig` alias) |
| UI | shadcn/ui + Tailwind CSS v4 |
| 데이터베이스 | PostgreSQL 14+ / 15 Docker 기본, raw SQL + `pg` |
| 인증 | JWT + HttpOnly refresh token cookie |
| 차트 | Recharts |
| 패키지 매니저 | npm |
| 기본 배포 | Docker Compose |

---

## 빠른 시작

### 공식 경로: Docker 원클릭 설치

사전 요구사항은 **Docker Desktop** 하나입니다. 로컬 PostgreSQL 설치는 필요 없습니다.

```bash
git clone https://github.com/flykimjiwon/hanimo-webui.git
cd hanimo-webui
./scripts/install.sh
```

설치 스크립트가 수행하는 일:

| 단계 | 내용 |
|---|---|
| 환경 파일 | `.env` 생성, 강한 `JWT_SECRET` 자동 생성, `PORT` 반영 |
| 컨테이너 | PostgreSQL 15 + Next.js app을 `docker compose up -d --build`로 실행 |
| 부트스트랩 | app 컨테이너에서 DB 스키마와 기본 관리자 계정 생성 |
| 검증 | `/api/public/settings`, 주요 페이지, 보호 API 401 경계 smoke check |

실행 후 접속:

```bash
open http://localhost:3000
```

초기 관리자 계정:

| 항목 | 값 |
|------|---|
| 이메일 | `.env`의 `HANIMO_ADMIN_EMAIL` |
| 비밀번호 | `.env`의 `HANIMO_ADMIN_PASSWORD` |

`./scripts/install.sh`는 `.env`가 없거나 placeholder 값이면 강한 초기 비밀번호를 자동 생성합니다. 첫 로그인 후 비밀번호를 변경하세요.

설치 점검:

```bash
./scripts/doctor.sh
./scripts/doctor.sh --json
```

### 로컬 개발 경로

Docker 없이 개발하려면 Node.js 20+와 PostgreSQL 14+가 필요합니다. macOS/Linux에서는 로컬 설치 스크립트를 사용할 수 있습니다.

```bash
./scripts/install-local.sh --no-start
npm run dev
```

Windows에서는 PostgreSQL과 Node.js 20+를 설치한 뒤 아래 경로를 사용하세요.

```bash
npm install
copy .env.example .env
npm run setup-postgres
npm run create-admin
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

### 빌드 (프로덕션)

```bash
npm run build        # 빌드
npm run start        # 프로덕션 서버 실행
```

---

## 프로젝트 구조

```
hanimo-webui/
├── app/                    # Next.js 앱 라우트
│   ├── admin/              # 관리자 UI 페이지
│   │   ├── database/       #   DB 뷰어 (테이블 조회/CRUD)
│   │   ├── users/          #   사용자 관리 (역할 변경, 삭제)
│   │   ├── menus/          #   메뉴 관리
│   │   ├── settings/       #   사이트 설정 (테마, Draw, 위젯)
│   │   └── ...             #   대시보드, 로그, 분석 등
│   ├── api/                # API 라우트
│   │   ├── v1/             #   OpenAI 호환 API
│   │   ├── admin/          #   관리자 API
│   │   └── webapp-chat/    #   채팅 API
│   ├── components/         # 공유 UI 컴포넌트
│   │   ├── chat/           #   채팅 관련 (ChatInput, MessageList, Sidebar, DrawPreviewPanel)
│   │   ├── ui/             #   shadcn/ui 기본 컴포넌트
│   │   └── ...             #   PatchNotesModal, NoticePopup 등
│   ├── hooks/              # React 커스텀 훅
│   │   ├── useChatSender.js    # 채팅 메시지 전송 로직
│   │   ├── useChat.js          # 채팅 상태 관리
│   │   └── useTranslation.js   # 다국어 지원
│   └── lib/                # 유틸리티 라이브러리
│       ├── i18n/           #   번역 파일 (en.json, ko.json)
│       ├── postgres.js     #   DB 연결
│       ├── autoMigrate.js  #   자동 스키마 마이그레이션
│       └── modelServers.js #   모델 서버 라우팅
├── scripts/                # 설정/관리 스크립트
├── public/                 # 정적 파일
├── docs/                   # 프로젝트 문서
└── tests/                  # 테스트 코드
```

---

## 주요 기능 상세 가이드

### 채팅

1. 로그인 후 **좌측 사이드바**에서 `+` 버튼을 눌러 새 채팅방 생성
2. 상단 **모델 셀렉터**에서 사용할 AI 모델 선택 (별표로 기본 모델 설정 가능)
3. 메시지 입력 후 전송 — 실시간 스트리밍 응답
4. 이미지 업로드 (드래그&드롭 또는 클립보드 붙여넣기) 지원

### Draw (캔버스) 모드

1. 채팅 입력창 좌측의 **붓 아이콘**을 클릭하여 Draw 모드 활성화
2. "차트 그려줘", "대시보드 만들어줘" 등 요청
3. AI가 HTML 코드를 생성하면 **미리보기 패널**에서 실시간 확인
4. 코드 복사 또는 새 탭에서 열기 가능

> 관리자가 설정 > Draw에서 활성화해야 사용 가능합니다.

### Custom Instruction (사용자 지정 프롬프트)

1. 채팅 입력창의 **사람 아이콘**을 클릭
2. 모달에서 원하는 시스템 프롬프트 작성 (최대 5,000자)
3. 활성화 토글을 켜고 저장
4. 해당 채팅방의 모든 대화에 자동 적용

### 관리자 패널

`http://localhost:3000/admin`으로 접속 (admin 역할 필요)

| 메뉴 | 기능 |
|------|------|
| 대시보드 | 사용자/메시지/토큰 통계, 인기 모델 차트, 시스템 상태 |
| 사용자 관리 | 검색/필터, 역할 변경, 삭제 |
| 모델 관리 | 드래그&드롭 정렬, 활성화/비활성화, PII 설정, 카테고리 분류 |
| 에이전트 | Labs 또는 플러그인 후보 |
| 설정 | 사이트 브랜딩, 테마, Draw 설정, 채팅 위젯, 엔드포인트 |
| DB 관리 | DB 뷰어 (테이블 조회/검색/CRUD), 스키마 수복, 백업/복원 |
| 로그 | 메시지 로그, 외부 API 로그, 보안 로그 |

### OpenAI 호환 API

외부 도구(Continue, Cursor 등)에서 hanimo-webui를 AI 서버로 사용할 수 있습니다:

```bash
# 채팅 요청
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# 모델 목록 조회
curl http://localhost:3000/v1/models \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

> API 토큰은 관리자 패널 > 설정에서 발급받을 수 있습니다.

---

## 데이터베이스 마이그레이션

기존 DB에서 버전을 업그레이드할 때:

```bash
# 방법 1: 관리자 패널에서 실행
# 설정 > DB 관리 > "스키마 마이그레이션" 버튼 클릭

# 방법 2: API 호출
curl -X POST http://localhost:3000/api/admin/migrate-models \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

자동 마이그레이션이 로그인 시마다 누락 컬럼을 자동 추가합니다.

---

## 환경별 실행

### 개발 환경

```bash
npm run dev                    # 기본 개발 서버
npm run dev:turbopack           # Turbopack으로 빠른 개발 서버
```

### 프로덕션 환경

```bash
npm run build                  # 프로덕션 빌드
npm run start                  # 프로덕션 서버 실행
```

### Docker

```bash
./scripts/install.sh
docker compose logs -f app
docker compose down
```

---

## 유용한 스크립트

| 명령어 | 설명 |
|--------|------|
| `npm run install:selfhost` | Docker Compose 기반 원클릭 설치 |
| `npm run install:local` | macOS/Linux 로컬 Node + PostgreSQL 설치 경로 |
| `npm run doctor` | Node/Docker/env/app/DB 상태 점검 |
| `npm run scan:public` | public export 전 금지어/비밀 패턴 검사 |
| `npm run export:public` | `git ls-files` 기반 clean public export 생성 |
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 프로덕션 서버 실행 |
| `npm run setup-postgres` | DB 스키마 초기화 |
| `npm run create-admin` | 관리자 계정 생성 |
| `npm run create-admin:interactive` | 대화형 관리자 계정 생성 |
| `npm run test-postgres` | DB 연결 테스트 |
| `npm run test:ollama` | Ollama 엔드포인트 테스트 |
| `npm run smoke` | 공개 페이지와 보호 API 경계 smoke check |
| `npm run lint` | ESLint 검사 |

---

## 문제 해결

### DB 연결 실패

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

PostgreSQL이 실행 중인지 확인하세요:

```bash
# macOS
brew services start postgresql@14

# Linux
sudo systemctl start postgresql
```

### 빌드 시 DB 오류

DB 없이 빌드하려면:

```bash
SKIP_DB_CONNECTION=true npm run build
```

### 모델 로딩 실패

1. 관리자 패널 > 설정에서 Ollama/OpenAI 엔드포인트가 올바른지 확인
2. 모델 서버가 실행 중인지 확인: `curl http://localhost:11434/api/tags`

---

## 기여

`CONTRIBUTING.md`를 참고하세요.

## 저작자 / Author

**김지원 (Kim Jiwon)** — [@flykimjiwon](https://github.com/flykimjiwon)

hanimo 오픈소스 생태계의 제작자입니다. 제작 내력·생태계 링크는 [`NOTICE`](NOTICE)를 참고하세요.

## 라이선스

Copyright © 2025–2026 **김지원 (Kim Jiwon)**. All rights reserved.

Apache License 2.0 — 자세한 내용은 [`LICENSE`](LICENSE)를 참고하세요.
