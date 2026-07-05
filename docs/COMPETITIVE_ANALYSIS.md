# hanimo-webui 경쟁 분석 & 시장 조사

> 조사일: 2026-03-13 | 소스: GitHub, 공식 문서, 기술 뉴스, 산업 리포트

---

## 목차

1. [hanimo-webui 자체 피쳐 인벤토리](#1-hanimo-webui-자체-피쳐-인벤토리)
2. [Open WebUI 분석](#2-open-webui-분석)
3. [한국 엔터프라이즈 AI 플랫폼](#3-한국-엔터프라이즈-ai-플랫폼)
4. [경쟁 비교 매트릭스](#4-경쟁-비교-매트릭스)
5. [한국 시장 환경](#5-한국-시장-환경)

---

## 1. hanimo-webui 자체 피쳐 인벤토리

### 기술 스택

| 항목 | 세부 |
|---|---|
| 프레임워크 | Next.js 15.5.9 (App Router) |
| 런타임 | React 19.2.1 |
| 언어 | JavaScript (TypeScript 미사용) |
| UI | shadcn/ui + Tailwind CSS v4 |
| 데이터베이스 | PostgreSQL (pg 8.16.3) |
| 인증 | JWT + 리프레시 토큰 + 범용 OAuth SSO |
| 차트 | Recharts |
| 로깅 | Winston |
| 배포 | Standalone output (Docker 지원) |

### 핵심 기능

#### 채팅 & AI
- 멀티모델 채팅 (Ollama, OpenAI 호환, Gemini)
- 멀티턴 대화 관리
- 스트리밍 응답
- 파일 업로드 & 파싱 (이미지, 문서)
- 채팅방 관리 (생성, 삭제, 이름 자동 생성)

#### OpenAI 호환 API (프록시)
- `/v1/chat/completions` — 채팅 완성
- `/v1/completions` — 텍스트 완성
- `/v1/embeddings` — 임베딩
- `/v1/rerank` — 리랭킹
- `/v1/models` — 모델 목록

#### 관리자 패널
- **대시보드** — 통계 개요
- **사용자 관리** — 역할(admin/user), 생성/수정/삭제
- **모델 서버 관리** — Ollama/OpenAI/Gemini 엔드포인트 관리, 헬스체크
- **메시지 조회** — 전체 채팅 로그 검색/필터
- **분석** — 사용량 차트 (Recharts)
- **설정** — 사이트 설정, 로그인 방식, 테마, 파비콘
- **환경 설정** — 시스템 환경변수 관리
- **API 토큰 관리** — 외부 API 접근용 토큰 발급

#### 엔터프라이즈 기능
- PII(개인정보) 탐지 & 테스트
- 감사 로그 (Winston 기반)
- 범용 OAuth SSO (특정 기업 종속 아님)
- API 토큰 인증
- 모델 서버 모니터링

#### 고유 기능 (경쟁사 대비 차별점)
- **PPT 생성 워크플로우** (`PPTMaker.js`) — 채팅에서 바로 프레젠테이션 생성
- **멀티 프로바이더 모델 라우팅** — 단일 인터페이스에서 Ollama + OpenAI + Gemini
- **OpenAI 호환 API 프록시** — 기존 OpenAI 클라이언트로 접속 가능
- **게시판/공지사항 시스템** — 로그인 페이지 팝업 공지 포함
- **쪽지 시스템** — 사용자 간 다이렉트 메시지
- **다국어 지원** — 한국어/영어 완전 i18n

#### 알려진 약점
- TypeScript 미사용 (전체 JavaScript)
- 테스트 인프라 없음 (unit/integration/e2e)
- RAG/벡터 DB 미지원
- 플러그인/확장 시스템 없음
- Docker Compose 설정 미포함
- 실시간 협업 기능 없음

---

## 2. Open WebUI 분석

> 소스: docs.openwebui.com, GitHub (127K stars), 커뮤니티

### 개요

| 항목 | 세부 |
|---|---|
| GitHub Stars | ~127,000 |
| Forks | ~18,000 |
| 스택 | SvelteKit (프론트) + Python/FastAPI (백엔드) |
| DB | SQLite (기본) 또는 PostgreSQL |
| 배포 | Docker (주력), Kubernetes, pip install |
| 라이선스 | 커스텀 "Open WebUI License" (MIT/Apache 아님) |
| 최신 버전 | v0.8.10 (2026-03-09) |

### 핵심 기능

#### 채팅 & 대화
- ChatGPT 스타일 UI (Markdown, LaTeX 렌더링)
- 비동기 채팅, 메시지 큐
- 멀티모델 동시 채팅 (`@model-name` 전환)
- 임시 채팅 모드 (서버 미저장)
- 대화 브랜칭 (플로우 다이어그램)
- 채팅 폴더, 핀, 태그, 자동태그, 아카이브
- RLHF 어노테이션 (평점 + 피드백)
- 채널 (Beta) — Discord/Slack식 실시간 룸
- 아티팩트 저장소 (세션 간 키-값 저장)

#### RAG (검색 증강 생성)
- **9개 벡터 DB**: ChromaDB, PGVector, Qdrant, Milvus, Elasticsearch, OpenSearch, Pinecone, S3Vector, Oracle 23ai
- **5개 문서 추출 엔진**: Apache Tika, Docling, Azure Document Intelligence, Mistral OCR, 커스텀
- **15+ 웹 검색 프로바이더**: SearXNG, Google PSE, Brave, Kagi, Tavily, Perplexity, Exa 등
- 하이브리드 검색 (BM25 + CrossEncoder 리랭킹)
- YouTube RAG 파이프라인
- 인라인 인용 (관련성 퍼센트)
- Google Drive + OneDrive/SharePoint 가져오기

#### 모델 관리
- 모델 빌더 (커스텀 모델 생성)
- GGUF 파일 업로드 → Ollama 모델 생성
- 모델 플레이그라운드 (Beta)
- 모델 평가 아레나 (블라인드 A/B 테스트, ELO 리더보드)

#### 플러그인 & 확장성
- 파이프라인 프레임워크 (Python 플러그인 시스템)
- 네이티브 Python 함수 호출
- 프리빌트 파이프라인: Langfuse, 속도 제한, LibreTranslate, Detoxify, LLM-Guard
- Skills (실험적, v0.8.0)

#### 미디어 & 생성
- 이미지 생성 (DALL-E, Gemini, ComfyUI, AUTOMATIC1111)
- 음성 입력 (Whisper, Deepgram, Azure Speech)
- TTS (다중 프로바이더)
- 인터랙티브 아티팩트 (SVG, 웹 콘텐츠 라이브 렌더링)

#### 관리자 & 멀티유저
- 풀 관리자 패널 (사용자, 모델, 파이프라인)
- RBAC — 세분화된 역할, 사용자 그룹, 워크스페이스 격리
- SCIM 2.0 (Okta, Azure AD, Google Workspace)
- SSO (SAML + OIDC)
- LDAP / Active Directory
- MFA
- 분석 대시보드 (v0.8.0) — 토큰 소비/모델/사용자별

#### 옵저버빌리티
- OpenTelemetry (트레이스, 메트릭, 로그)
- 인프라 레벨 로깅 (stdout → Splunk, Datadog, ELK)

### 비즈니스 모델
- 오픈소스 무료 (기능 제한 없음)
- 엔터프라이즈 라이선스 옵션 (커스텀 가격, sales@openwebui.com)
- 엔터프라이즈: 화이트라벨링, 전담 지원, SLA, 컴플라이언스 가이드
- GitHub Sponsors
- Open WebUI Inc. (상업 법인)

### 주요 고객
- Samsung Semiconductor Inc. (보안 자체 호스팅)
- Johannes Gutenberg University Mainz (3만+ 학생, 5천+ 직원)

### 강점
- 압도적 기능 폭 (OSS 최강)
- 벤더 종속 없음
- RAG 깊이 (9 벡터 DB, 5 추출 엔진)
- 프라이버시 우선 (완전 자체 호스팅)
- 확장성 (파이프라인 + Python 함수)
- 멀티모델 UX
- 배포 유연성 (Docker, K8s, pip, 에어갭)
- 커뮤니티 (127K stars)

### 약점
- 안정성 이슈 ("업데이트마다 뭔가 깨짐" — Reddit 2025)
- Docker 이미지 비대 (~40GB)
- 감사 로깅 기본적 (인프라 레벨만, 네이티브 구조화 감사 로그 없음)
- 비용 귀속 없음 (부서별 과금 불가)
- 라이선스 논란 (MIT/Apache 아님)
- 거버넌스 우려 (GitHub #22253: "absolute lack of governance")
- 대규모 성능 저하 (GitHub #14945: WebSocket 이슈)
- 롤링 업데이트 미지원 (v0.8.0 전 노드 동시 업데이트 필요)

---

## 3. 한국 엔터프라이즈 AI 플랫폼

### 3.1 웍스AI / 네이버웍스 AI Studio

| 항목 | 세부 |
|---|---|
| 운영사 | Naver Cloud |
| 출시 | 2025년 11월 |
| AI 모델 | HyperCLOVA X (한국어 네이티브) |
| 가격 | ₩9,000~11,000/user/month |
| 토큰 | 140만 토큰/user/month (~200쿼리) |

**핵심 기능:**
- WORKS Mate (기본 AI 어시스턴트 — 메일, 메시지, 게시판에서 접근)
- 8개 빌트인 어시스턴트 (업무 정리, 보고서, 번역, 가이드, 아이디어, 교정, 뉴스 요약, 소통 분석)
- 노코드 커스텀 어시스턴트 빌더
- 내부 데이터 통합 검색 (게시판, 메시지, Drive)
- ClovaNote (회의 녹음 전사 + 요약)
- 게시판/메일/캘린더 AI (초안, 제목 추천, 일정 제안, 파일 요약/번역)

**강점:** 한국어 LLM 최강, 네이버웍스 워크플로우 통합, CSAP 인증 (정부 사용 가능)
**약점:** 네이버웍스 생태계 종속

**정부 수주:** 행안부, 과기부, 식약처 공식 협업 플랫폼 선정 (2026.03)

### 3.2 더존비즈온 (Douzone Bizon) — ONE AI

| 항목 | 세부 |
|---|---|
| 포지션 | 한국 ERP 1위 |
| 전략 | AI 네이티브 ERP ("ONE AI") |
| 타겟 | 한국 중소/중견기업 |

**핵심 전략 (2026):**
- ONE AI Orchestration — AI 에이전트가 자율적으로 업무 판단/실행 (인보이스, 급여, 재고, 리스크 예측)
- Agentic ERP — AI가 어시스턴트가 아닌 자율 업무 수행자
- OmniEsol, Amaranth 10, WEHAGO — 주력 제품

**파트너십:** 롯데이노베이트, PwC 삼일, AWS, EQT

### 3.3 삼성SDS — Brity AI / AX Platform

| 항목 | 세부 |
|---|---|
| 포지션 | 한국 최대 IT 서비스 |
| 핵심 | ChatGPT Enterprise 한국 첫 공식 리셀러 (2025.12) |
| 고객 | 고려아연, iCRAFT, TmaxSoft, 세크타나인, 하나투어 등 10+ |

**핵심:**
- Brightics Works (자체 AI 생산성 스위트)
- Fabrix (AI 플랫폼)
- "One-Team" AX 모델 (컨설팅 + 개발 + 클라우드 + 보안 통합)
- 국가 AI 컴퓨팅센터 컨소시엄 리더 (네이버, 카카오, KT 참여)

**강점:** 삼성 브랜드 신뢰, 풀스택 AX, 보안
**타겟:** 대기업

### 3.4 KT — Agent Fabric / AX OS

| 항목 | 세부 |
|---|---|
| 발표 | MWC 2026 (바르셀로나) |
| 핵심 | Agent Fabric — 5계층 엔터프라이즈 AI OS |

**구조:** Experience → Intelligence → Context → Execution → Governance

**핵심:**
- Agent Orchestra — 오케스트레이터가 전문 서브 에이전트 관리 (진단, 분석, 최적화)
- KRAI Assessment — 책임 AI 평가 도구 (11개 리스크 영역, 자동 레드팀 테스트)
- KT Innovation Hub — 서울 광화문 B2B AI 체험센터 (MS 공동)
- Mi:dm — KT 대규모 AI 모델

**파트너:** Microsoft (Azure, Copilot)

### 3.5 기타

| 업체 | 포지션 |
|---|---|
| **카카오엔터프라이즈** | KakaoWork + AI, 전략 재편 중 (공격성 낮음) |
| **뤼튼 (Wrtn)** | 소비자 AI → 엔터프라이즈 확장, 멀티모델 (GPT-4, Claude, HyperCLOVA X) |
| **LG CNS** | AI 컨설팅/구현, 삼성SDS와 AX 시장 경쟁 |
| **SK AX** | 제조/통신 AI, Anthropic(Claude) 한국 파트너 |

---

## 4. 경쟁 비교 매트릭스

| 기능 | hanimo-webui | Open WebUI | 웍스AI | 삼성SDS |
|---|:---:|:---:|:---:|:---:|
| **자체 호스팅** | O | O | X | △ |
| **멀티 LLM 프로바이더** | O (Ollama+OpenAI+Gemini) | O (모든 OpenAI 호환) | X (HyperCLOVA X만) | O (ChatGPT Enterprise) |
| **OpenAI 호환 API** | O | X | X | X |
| **RAG/벡터 DB** | X | O (9개 DB) | X | O |
| **플러그인 시스템** | X | O (파이프라인) | X | O |
| **PPT 생성** | O | X | X | X |
| **게시판/공지** | O | X | O (네이버웍스) | X |
| **쪽지 시스템** | O | X | O (네이버웍스) | X |
| **PII 탐지** | O | X | X | △ |
| **다국어 (한/영)** | O | O (다국어) | O (한국어) | O |
| **SSO/OAuth** | O | O (SAML+OIDC) | O | O |
| **RBAC** | △ (admin/user) | O (세분화) | O | O |
| **감사 로그** | △ (Winston) | △ (인프라 레벨) | O | O |
| **분석 대시보드** | O | O (v0.8.0+) | X | O |
| **모델 서버 모니터링** | O | △ | X | O |
| **이미지 생성** | X | O (DALL-E 등) | X | X |
| **음성 입출력** | X | O (Whisper, TTS) | O (ClovaNote) | X |
| **SCIM 2.0** | X | O | X | O |
| **MFA** | X | O | O | O |
| **테스트 커버리지** | X | △ | N/A | N/A |
| **TypeScript** | X | N/A (Svelte) | N/A | N/A |

**범례:** O = 지원, △ = 부분 지원, X = 미지원, N/A = 해당 없음

---

## 5. 한국 시장 환경

### 시장 규모

| 지표 | 데이터 |
|---|---|
| 한국 AI 시장 (2027 예상) | ₩4.4조 (~$3.2B) |
| 디지털 전환 CAGR | 18.23% (2035년까지) |
| 정부 AI 투자 (2026) | ₩30조 (₩150조 공공 성장 펀드에서) |
| AI/반도체 예산 (2027) | ₩9.4조 ($6.94B) |
| 대기업 AI 도입률 | 50% 이상 |
| 직장인 주간 GenAI 사용률 | ~45% |
| AI 구독 성장률 (YoY) | 187% |

### 핵심 트렌드

1. **온프레미스/하이브리드 선호** — 대기업/공공기관은 자체 인프라 선호. 외부 AI에 독점 데이터 유출 우려. CSAP 인증 필수 (공공).

2. **데이터 주권 & 보안** — 세계 최초 AI 생성 콘텐츠 워터마크법. PIPA(개인정보보호법) 엄격 적용. 외국 LLM API에 데이터 전송 제한.

3. **에이전틱 AI** — 2026 한국 엔터프라이즈 AI 핵심 내러티브: "AI 어시스턴트 → AI 자율 에이전트". 더존(ONE AI), KT(Agent Fabric), 삼성SDS 모두 에이전틱 방향.

4. **정부가 퍼스트 바이어** — 국가 AI 컴퓨팅센터 (₩2,500억, GPU 15,000대→50,000대), 네이버웍스 정부 선정, SME AI R&D 세액공제 40%.

5. **한국어 LLM 생태계** — HyperCLOVA X (네이버), EXAONE 2.0 (LG AI Research), Mi:dm (KT), Kakao Brain. GPT-4/Claude는 엔터프라이즈 계약 통해 사용하나 데이터 주권 우려.

### 주요 규제

| 규제 | 영향 |
|---|---|
| AI 워터마크법 | 세계 최초, AI 생성 콘텐츠 공개 의무 |
| PIPA | 엄격한 데이터 처리, 외국 API 전송 제한 |
| CSAP 인증 | 공공부문 클라우드 필수, 외국 벤더 진입 장벽 |
| AI 윤리 헌장 | 50+ 기업 서명, 3원칙 10요건 |
| AI 신뢰성 검증센터 | 2024 설립, AI 시스템 인증 |
| 금융 AI 규정 | FSC — 은행/보험 AI 설명 가능성 + 감사 추적 필수 |

### 엔터프라이즈 공통 페인포인트

| 문제 | 설명 |
|---|---|
| 레거시 시스템 연동 | 깊이 커스터마이징된 ERP/그룹웨어에 AI 통합 필요 |
| AI 거버넌스 & 설명 가능성 | AI 의사결정 감사 필요 (특히 금융/HR) |
| 한국어 품질 | 외국 LLM은 한국어 뉘앙스, 업계 용어, 규제 용어에 약함 |
| 보안 & 컴플라이언스 | PIPA, 금융 규정, 업종별 규칙으로 높은 컴플라이언스 오버헤드 |
| ROI 불확실성 | 다수 기업이 PoC 단계, 본격 배포 전환이 핵심 과제 |
| 인재 부족 | AI 연구 인력은 있으나, 엔터프라이즈 AI 구현 인력 부족 |

---

## 6. hanimo-webui 포지셔닝 시사점

### 경쟁 우위
1. **올인원 JS 스택** — Next.js 단일 스택으로 프론트/백엔드/API, 배포 단순
2. **OpenAI 호환 API 프록시** — 기존 OpenAI 클라이언트 즉시 연동 (경쟁사 없는 기능)
3. **PPT 생성** — 채팅에서 바로 프레젠테이션 (유일)
4. **PII 탐지** — 엔터프라이즈 컴플라이언스 차별점
5. **게시판/공지/쪽지** — 한국식 엔터프라이즈에 익숙한 소통 도구
6. **가벼운 배포** — Docker 단일 이미지 (Open WebUI의 ~40GB vs hanimo-webui 경량)

### 보강 필요 영역
1. **RAG/벡터 DB** — Open WebUI 대비 최대 약점
2. **테스트 인프라** — 엔터프라이즈 신뢰성 확보에 필수
3. **TypeScript 전환** — 코드 품질/유지보수성
4. **플러그인 시스템** — 확장성
5. **RBAC 세분화** — admin/user 2단계 → 커스텀 역할
6. **MFA** — 보안
7. **이미지/음성** — 멀티모달
8. **에이전틱 AI 워크플로우** — 2026 시장 트렌드 반영

---

*이 문서는 2026-03-13 기준 조사 결과입니다. 시장 상황은 빠르게 변합니다.*
