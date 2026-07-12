<p align="center">
  <img src="app/icon.svg" alt="hanimo — Modol the Honey-Bee Bichon" width="128">
</p>

[English](README_en.md)

# hanimo-webui

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-f5a623.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-f5a623.svg)](https://nextjs.org)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-f5a623.svg)](https://tailwindcss.com)
[![Postgres](https://img.shields.io/badge/Postgres-15+-f5a623.svg)](https://www.postgresql.org)

> **내 모델로, 바로 일하세요.** 질문하고, 만들고, 결정하는 일을 한 화면에서 이어가는 셀프호스팅 AI 워크스페이스.

hanimo-webui는 Next.js 15 기반의 **오픈소스 셀프호스팅 AI 챗 + 관리자 런타임 + OpenAI 호환 API**입니다.

공개판의 core 약속은 채팅, 모델 서버 설정, 사용자/관리자, API 토큰, OpenAI-compatible API입니다. Workflow / Screen / RAG / MCP 계열은 삭제 대상이 아니라, 공개판에서는 Labs 또는 플러그인 후보로 분리합니다.

> 공개 준비 상태: credential/SSRF/upload/auth/Docker 기본값을 보강하고, `hmo_` 발급부터 인증된 OpenAI-compatible 업스트림 프록시까지 standalone E2E를 통과한 release candidate입니다.
> clean Docker 설치 harness와 CI job은 준비됐지만 이 머신에는 Docker 실행기가 없어 로컬 실행은 미확인입니다. Labs의 기존 Workflow credential은 활성화 전에 재입력이 필요하며, 이 상태는 **보안 인증 완료를 의미하지 않습니다**.

---

## 공개 Core

| 기능 | 설명 |
|------|------|
| 채팅 | 방 기반 대화, 모델 선택, 스트리밍 응답, 이미지 입력 |
| 모델 서버 설정 | Ollama, OpenAI-compatible endpoint, Gemini 등 모델 서버 연결/선택 |
| 사용자/관리자 | 로컬 로그인, JWT refresh token, 사용자 관리, admin-only 관리 화면 |
| API 토큰 | 사용자 토큰 발급, 1회 표시, 해시 저장, OpenAI-compatible API 인증 |
| OpenAI-compatible API | `/v1/chat/completions`, `/v1/models`, `/v1/embeddings`, `/v1/rerank` |
| 셀프호스팅 운영 | Docker Compose 설치, 로컬 설치, doctor, route smoke check |

## Labs / Future Plugin

| 영역 | 공개판 기준 |
|------|-------------|
| Workflow / Agents | Labs 또는 future plugin 후보. core 안정화 후 manifest/권한/audit 모델과 함께 분리 공개 |
| Screen / Draw / Canvas | Labs 후보. iframe sandbox와 SSRF guard는 유지하지만 stable core 약속은 아님 |
| RAG / MCP | future plugin 후보. 첫 공개판의 필수 설치/운영 범위 밖 |
| DB viewer / destructive DB tools | 관리자 운영·유지보수 표면. 일반 사용자 기능 또는 stable public API로 약속하지 않음 |
| PII / Community / SSO / team extensions | 운영 확장 후보. 첫 공개판 core가 아님 |
| 다국어 / 테마 | core 사용성을 돕는 UI 기능. 별도 플랫폼 약속으로 과장하지 않음 |

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

## 보안·운영 경계

- 모델 프록시는 호출자의 임의 헤더를 전달하지 않고, 관리자 설정의 endpoint credential만 사용합니다.
- 외부 API 로그는 기본적으로 프롬프트 본문을 저장하지 않습니다. 제한된 본문 기록이 필요한 개발 환경에서만 `HANIMO_LOG_PROMPT_CONTENT=true`를 명시하세요.
- Workflow custom endpoint는 실험 기능이며, 공개/사설 네트워크 및 redirect 정책을 검사합니다. credential은 `HANIMO_CREDENTIAL_ENCRYPTION_KEY`가 없으면 저장되지 않습니다.
- `HANIMO_CREDENTIAL_ENCRYPTION_KEY`는 설치 스크립트가 생성하는 32바이트 이상 키입니다. 키를 잃으면 저장된 provider credential을 복구할 수 없습니다.
- 기존 버전의 Workflow 평문 credential은 자동 사용하지 않습니다. 키를 설정한 뒤 다시 입력해야 합니다.
- Labs 페이지와 API는 기본적으로 404를 반환합니다. 실험 범위를 이해한 운영자만 `.env`에 `HANIMO_ENABLE_LABS=true`를 설정해 활성화하세요.
- 로그인·회원가입·refresh에는 기본 rate limit이 적용됩니다. 브라우저 쿠키가 포함된 상태 변경 요청은 same-origin이어야 합니다.
- reverse proxy 뒤에서 운영할 때는 `HANIMO_PUBLIC_URL`을 실제 공개 origin으로 설정하고, 전달 IP를 통제하는 프록시에서만 `HANIMO_TRUST_PROXY=true`를 사용하세요.
- `hmo_` API Key를 사용하는 `/api/v1/*` 서버 간 호출은 브라우저 cookie CSRF 정책과 분리되어 Hanimo Code·VS Code 같은 공식 클라이언트가 사용할 수 있습니다.

---

## 빠른 시작

### 공식 경로: Docker 원클릭 설치

사전 요구사항은 **Docker Desktop** 하나입니다. 로컬 PostgreSQL 설치는 필요 없습니다.

검증된 revision을 내려받아 설치하는 원격 bootstrap과 백업·복구·업데이트 절차는 [운영 가이드](docs/OPERATIONS.md)를 참고하세요. 처음 직접 검증하는 경우에는 설치 파일 무결성 확인부터 브라우저·API 점검까지 정리한 [수동 Docker QA 가이드](docs/MANUAL_DOCKER_QA.md)를 사용하세요.

```bash
git clone https://github.com/flykimjiwon/hanimo-webui-public.git hanimo-webui
cd hanimo-webui
./scripts/install.sh
```

설치 스크립트가 수행하는 일:

| 단계 | 내용 |
|---|---|
| 환경 파일 | `.env` 생성, 강한 `JWT_SECRET`·`HANIMO_CREDENTIAL_ENCRYPTION_KEY` 자동 생성, `PORT` 반영 |
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

로그인 후 **관리자 → AI 공급사 연결**에서 Ollama·Novita·OpenRouter·OpenAI·DeepSeek·Gemini 프리셋 또는 Custom OpenAI-compatible 주소를 저장할 수 있습니다. 프리셋은 연결값만 채우며, 실제 통신은 공통 호환 어댑터를 사용합니다.

설치 점검:

```bash
./scripts/doctor.sh
./scripts/doctor.sh --json
```

릴리스 전 깨끗한 Docker 설치 검증:

```bash
npm run test:docker-install
```

이 검증은 임시 PostgreSQL 볼륨과 mock provider를 사용해 관리자 로그인, `hmo_` API Key 발급, OpenAI-compatible 모델 조회와 채팅 프록시를 확인한 뒤 테스트 전용 자원만 정리합니다.

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
│   │   ├── database/       #   DB 유지보수/조회 (관리자 운영 표면)
│   │   ├── users/          #   사용자 관리 (역할 변경, 삭제)
│   │   ├── menus/          #   메뉴 관리
│   │   ├── settings/       #   사이트/모델/채팅 설정
│   │   └── ...             #   대시보드, 로그, 분석 등
│   ├── api/                # API 라우트
│   │   ├── v1/             #   OpenAI 호환 API
│   │   ├── admin/          #   관리자 API
│   │   └── webapp-chat/    #   채팅 API
│   ├── components/         # 공유 UI 컴포넌트
│   │   ├── chat/           #   채팅 관련 (ChatInput, MessageList, Sidebar 등)
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

## Core 사용 흐름

### 채팅

1. 로그인 후 **좌측 사이드바**에서 `+` 버튼을 눌러 새 채팅방 생성
2. 상단 **모델 셀렉터**에서 사용할 AI 모델 선택 (별표로 기본 모델 설정 가능)
3. 메시지 입력 후 전송 — 실시간 스트리밍 응답
4. 이미지 업로드 (드래그&드롭 또는 클립보드 붙여넣기) 지원

### Custom Instruction (사용자 지정 프롬프트)

1. 채팅 입력창의 **사람 아이콘**을 클릭
2. 모달에서 원하는 시스템 프롬프트 작성 (최대 5,000자)
3. 활성화 토글을 켜고 저장
4. 해당 채팅방의 모든 대화에 자동 적용

### Labs / 운영 확장 경계

Workflow, Screen, Draw, RAG, MCP, SSO, 커뮤니티/팀 확장, 고급 DB 도구는 현재 코드에 일부 route 또는 UI가 남아 있을 수 있습니다. 공개 core의 안정 기능으로 약속하지 않으며, 별도 plugin/Labs 보안 모델과 운영 문서가 준비된 뒤 분리합니다.

### 관리자 패널

`http://localhost:3000/admin`으로 접속 (admin 역할 필요)

| 메뉴 | 공개판 기준 |
|------|-------------|
| 대시보드 | 사용자/메시지/토큰 통계, 모델 사용 현황, 시스템 상태 |
| 사용자 관리 | 검색/필터, 역할 변경, 삭제 |
| 모델 관리 | 모델 및 모델 서버 설정, 활성화/비활성화, 정렬 |
| 설정 | 사이트 브랜딩, 테마, 채팅/엔드포인트 설정 |
| API 토큰 | 토큰 발급, 1회 표시, 해시 저장 기반 인증 |
| 로그 | 메시지 로그, 외부 API 로그, 보안 로그 |
| Agents / DB 관리 / Screen | Labs 또는 관리자 운영 표면. 첫 공개판 core 약속이 아님 |

### OpenAI 호환 API

외부 도구(Continue, Cursor 등)에서 hanimo-webui를 AI 서버로 사용할 수 있습니다:

Hanimo Code와 Hanimo VS Code 확장은 다음 단계에서 이 동일한 계약에
연결합니다. 기준 문서는 [Hanimo 공식 클라이언트 게이트웨이 계약](docs/HANIMO_OFFICIAL_CLIENT_GATEWAY.md)입니다.

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

> API 토큰은 로그인 후 `/my-api-keys`에서 발급받습니다. `hmo_` 원문은 한 번만 표시됩니다.

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
| `npm run install:docker` | `install:selfhost`와 같은 Docker 설치 경로 |
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
| `npm run test:workflow` | Workflow condition RCE 회귀 테스트 |
| `npm run test:screen-security` | Screen share/outbound SSRF 회귀 테스트 |
| `npm run test:api-tokens` | API token 저장/표시 보안 테스트 |
| `npm run test:admin-policy` | 관리자 정책 회귀 테스트 |
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
