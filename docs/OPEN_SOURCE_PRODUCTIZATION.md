# Hanimo open-source productization roadmap / 오픈소스 제품화 로드맵

- Owner / 책임자: **Kim Jiwon (김지원)**
- GitHub: [@flykimjiwon](https://github.com/flykimjiwon)
- Email: `flykimjiwun@naver.com`
- Updated / 갱신일: 2026-07-12

## 한국어

### 목표

Hanimo WebUI를 단순히 설치 가능한 소스가 아니라, 권리 관계가 명확하고 처음
사용하는 사람도 운영할 수 있으며 외부 기여자가 안전하게 참여할 수 있는
셀프호스팅 오픈소스 솔루션으로 만든다.

### P0: 공개 전에 닫을 항목

- [x] Apache-2.0 `LICENSE`, 저작자와 기여자 범위를 구분한 `NOTICE`·`AUTHORS`
- [x] 저작권·기여 정책, 상표 정책, 지원 정책, 초기 제3자 고지, `CITATION.cff`
- [x] 한국어·영어 수동 Docker 설치·QA 가이드
- [ ] 잠금 파일 기반 전체 dependency license report 생성
- [ ] CycloneDX와 SPDX SBOM을 CI 및 GitHub Release에 첨부
- [ ] 이미지·폰트·아이콘·샘플 데이터별 출처와 라이선스 증빙 완성
- [ ] 고용계약·선행 프로젝트·외부 기여 이력에 대한 별도 법률 검토
- [ ] 비공개 보안 신고 기능과 전용 보안 연락 경로 확정
- [ ] Stable Core 전체 Docker 런타임·브라우저 QA

### P1: 설치 후 첫 성공 경험

- 최초 실행 설정 마법사: 시스템 진단 → 관리자 → 공급사 → 첫 모델 → 첫 대화
- Docker·DB·포트·디스크·권한 오류를 한국어와 영어로 해결 가능한 형태로 표시
- 공급사 연결 테스트, 모델 자동 선택, `hmo_` 키 발급과 복사 안전 안내
- 백업·복구·업데이트·롤백 UI와 데이터 보존 경고
- 모바일, 키보드, 스크린리더, 명암 대비, 한국어 줄바꿈 QA
- 익명 텔레메트리는 기본 비활성화하고 전송 데이터와 목적을 명시

### P1: 완전한 한영 문서

- 설치, 설정, 공급사, API, 백업·복구, 업데이트, 문제 해결, 보안, 기여, FAQ를
  `docs/ko/`와 `docs/en/`에 동일한 정보 구조로 제공
- 한쪽 문서가 바뀌면 번역 동기화 상태를 CI에서 경고
- 모든 명령을 깨끗한 macOS·Windows·Linux 환경에서 검증
- Stable Core와 Labs의 지원 범위, 데이터 저장 위치, 외부 전송 지점을 명시

### P1: 외부 기여 준비

- Issue form, PR template, `CODEOWNERS`, Dependabot, CodeQL, dependency review
- DCO `Signed-off-by` 도입 여부 결정 및 자동 검사
- DB migration, UI screenshot, 번역, AI 도구 사용, 보안 코드의 PR 규칙
- Good First Issue, GitHub Discussions, 문서·번역·디자인 기여자 인정
- 행동강령 위반을 공개 이슈가 아닌 비공개 경로로 접수

### P2: 신뢰 가능한 릴리스

- SemVer, `CHANGELOG.md`, 지원 버전 표, migration/rollback matrix
- 서명된 Git tag, checksum, 멀티 아키텍처 Docker image, immutable digest
- SBOM, provenance, 취약점 및 라이선스 보고서를 릴리스 자산으로 첨부
- ARM64/AMD64, macOS/Windows/Linux, 신규 설치/업데이트/복구 CI 매트릭스
- OpenSSF Scorecard와 정기 dependency/provenance 감사

### P2: 프로젝트 운영

- `GOVERNANCE.md`, maintainer/reviewer 권한, 의사결정 및 릴리스 주기
- `CITATION.cff`, 공개 로드맵, 지원 정책, 장기 미응답 PR 처리 기준
- 제품 홈페이지, 짧은 데모, 실제 도입 예제, 공개 변경 로그

### 완료 정의

기능 구현만으로 완료하지 않는다. 한영 문서, 라이선스·출처 증빙, 깨끗한 설치,
브라우저 사용자 흐름, 백업·복구, 보안 경계, 롤백이 실제 릴리스 revision에서
재현되어야 한다.

## English

### Objective

Turn Hanimo WebUI from installable source into a rights-clear, operable,
self-hosted open-source solution that first-time users can adopt and external
contributors can improve safely.

### P0: close before broad release

- [x] Apache-2.0 license plus scoped `NOTICE` and `AUTHORS`
- [x] Copyright/contribution, trademark, support, initial third-party policies,
  and `CITATION.cff`
- [x] Korean and English manual Docker installation and QA guide
- [ ] Generate a complete license report from the locked dependency graph
- [ ] Attach CycloneDX and SPDX SBOMs to CI and GitHub Releases
- [ ] Complete provenance records for images, fonts, icons, and sample data
- [ ] Obtain legal review for employment, predecessor, and contribution history
- [ ] Enable private vulnerability reporting and confirm a dedicated security path
- [ ] Run full Docker and browser QA for the Stable Core

### P1: first successful user outcome

- A first-run wizard covering diagnostics, admin setup, provider, first model,
  and first conversation
- Actionable Korean and English errors for Docker, DB, port, disk, and permissions
- Provider connection tests, safe `hmo_` key issuance, backup/restore/update UI
- Mobile, keyboard, screen-reader, contrast, and Korean line-breaking QA
- Telemetry off by default, with explicit disclosure of purpose and transmitted data

### P1: complete Korean and English documentation

- Mirrored installation, configuration, provider, API, operations, security,
  contribution, troubleshooting, and FAQ content under `docs/ko/` and `docs/en/`
- CI translation-sync warnings and clean-machine command verification
- Explicit Stable Core/Labs scope, data locations, and external data flows

### P1: contributor readiness

- Issue forms, PR template, `CODEOWNERS`, Dependabot, CodeQL, dependency review
- Decide and enforce DCO sign-off
- Rules for migrations, UI evidence, translation, AI tooling, and security changes
- Good First Issues, Discussions, contributor recognition, private conduct reports

### P2: trustworthy releases and governance

- SemVer, changelog, support matrix, migration and rollback matrix
- Signed tags, checksums, multi-architecture images, immutable digests
- SBOM, provenance, vulnerability, and license reports as release assets
- OS/architecture and fresh-install/update/restore CI matrices
- Governance, maintainer roles, release cadence, citation, and public roadmap

### Definition of done

A feature is not complete until its Korean and English documentation, license
and provenance evidence, clean installation, browser workflow, backup/restore,
security boundaries, and rollback are reproducible from the released revision.
