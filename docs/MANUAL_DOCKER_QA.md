# Hanimo 수동 Docker QA

이 절차는 macOS Apple Silicon에서 Hanimo의 깨끗한 Docker 설치를 사용자가 직접 검증하기 위한 체크리스트입니다. 설치 전 준비 단계에서는 Docker Desktop이나 Hanimo 컨테이너를 실행하지 않습니다.

## 준비된 파일

2026-07-12 기준 테스트 키트는 `~/Downloads/Hanimo-Test-Kit/`에 있습니다.

| 파일 | 용도 | SHA-256 |
|---|---|---|
| `Docker-Desktop-4.81.0-arm64.dmg` | Apple Silicon용 Docker Desktop 설치 이미지 | `a35a0b14fbf182fb2ef9f8e650ace9a8ebcc81ad4872d51bccc4496f5cdb0158` |
| `hanimo-bootstrap.sh` | 공개 저장소의 pinning된 설치 bootstrap | `67a7ff932df0602a380b9483e35d6ad3c60bcd784d0d172bb817a13c4d85bd38` |
| `hanimo-webui-public-c254a4e.tar.gz` | 공개 저장소 commit `c254a4e56a9d63c395cdab6ac879094d0eff2eeb`의 오프라인 소스 사본 | `9bc7967eb8aa4ab308560d8fcbf0fc083c627dd24ccebaafa8167a367a95b672` |

Docker Desktop 4.81.0은 Docker 공식 릴리스 페이지에서 2026-07-06 배포본으로 확인했습니다. Docker Desktop의 조직·정부 사용에는 구독 조건이 적용될 수 있으므로 설치 전에 [Docker Desktop 라이선스 조건](https://docs.docker.com/subscription/desktop-license/)을 확인하세요.

## 1. 설치 전 무결성 확인

```bash
cd ~/Downloads/Hanimo-Test-Kit
shasum -a 256 -c SHA256SUMS
```

세 항목이 모두 `OK`여야 합니다. 하나라도 실패하면 해당 파일을 실행하지 말고 다시 다운로드하세요.

## 2. Docker Desktop 설치와 최초 실행

1. `Docker-Desktop-4.81.0-arm64.dmg`를 더블 클릭합니다.
2. Docker 아이콘을 Applications 폴더로 옮깁니다.
3. `/Applications/Docker.app`을 처음 실행합니다.
4. 라이선스와 권한 안내를 확인하고 권장 설정을 선택합니다.
5. 메뉴 막대의 Docker 상태가 `Engine running`이 될 때까지 기다립니다.

Rosetta 2는 기본 컨테이너 실행에 필수는 아닙니다. Intel 전용 이미지나 선택적 CLI가 필요하다는 메시지가 나타날 때만 별도로 설치하세요.

## 3. Docker 준비 상태 확인

```bash
docker version
docker compose version
docker info
```

세 명령이 오류 없이 끝나야 합니다. `Cannot connect to the Docker daemon`이면 Docker Desktop이 완전히 시작되지 않은 상태입니다.

## 4. Hanimo 설치 테스트

권장 경로는 검증된 공개 bootstrap입니다. 기존 `~/hanimo-webui`가 있다면 다른 디렉터리를 지정하세요.

```bash
cd ~/Downloads/Hanimo-Test-Kit
less hanimo-bootstrap.sh
bash hanimo-bootstrap.sh --yes --dir "$HOME/hanimo-webui-test"
```

네트워크에서 소스를 다시 받지 않고 준비된 사본을 사용하려면 다음처럼 압축을 해제한 뒤 설치합니다.

```bash
mkdir -p "$HOME/hanimo-webui-test"
tar -xzf ~/Downloads/Hanimo-Test-Kit/hanimo-webui-public-c254a4e.tar.gz \
  --strip-components=1 -C "$HOME/hanimo-webui-test"
cd "$HOME/hanimo-webui-test"
./scripts/install.sh
```

설치 스크립트가 `.env`의 비밀값과 초기 관리자 비밀번호를 자동 생성합니다. `.env`를 채팅, 이슈, 스크린샷에 노출하지 마세요.

## 5. 사용자 관점 검증

```bash
cd "$HOME/hanimo-webui-test"
./scripts/doctor.sh
./scripts/doctor.sh --json
open http://localhost:3000
```

브라우저에서 다음을 순서대로 확인합니다.

1. 첫 화면과 로그인 화면이 라이트·다크 모드에서 정상 표시됩니다.
2. `.env`의 `HANIMO_ADMIN_EMAIL`과 `HANIMO_ADMIN_PASSWORD`로 로그인됩니다.
3. 관리자 페이지에서 AI 공급사 연결 화면이 열립니다.
4. Ollama 또는 사용할 OpenAI-compatible 공급사를 연결하고 모델 목록을 불러옵니다.
5. API Key 메뉴에서 `hmo_` 키를 발급합니다.
6. 아래 요청에서 `200`과 모델 목록을 확인합니다.

```bash
export HANIMO_API_KEY='hmo_발급받은_키'
curl -i http://localhost:3000/api/v1/models \
  -H "Authorization: Bearer $HANIMO_API_KEY"
```

잘못된 키의 인증 경계도 확인합니다.

```bash
curl -i http://localhost:3000/api/v1/models \
  -H 'Authorization: Bearer hmo_invalid'
```

정상 키는 `200`, 잘못된 키는 `401`이어야 합니다. 실제 키는 터미널 기록에 남을 수 있으므로 테스트 후 `unset HANIMO_API_KEY`를 실행하세요.

## 6. 전체 릴리스 게이트

다른 Hanimo 환경과 격리된 테스트 머신에서만 실행하세요. 전용 PostgreSQL volume과 mock provider를 만들었다가 테스트 자원만 정리합니다.

```bash
cd "$HOME/hanimo-webui-test"
npm run test:docker-install
```

## 7. 로그 수집과 안전한 종료

문제가 있으면 비밀값을 제외하고 다음 결과를 보관합니다.

```bash
./scripts/doctor.sh --json
docker compose ps
docker compose logs --no-color --tail=200 app db
```

데이터를 보존한 채 종료하려면 다음을 사용합니다.

```bash
./scripts/manage.sh stop
```

테스트 설치를 제거하되 PostgreSQL volume과 백업을 보존하려면 다음을 사용합니다.

```bash
./scripts/manage.sh uninstall
```

`docker compose down --volumes`는 DB 데이터를 삭제하므로 백업을 확인하기 전에는 실행하지 마세요. 백업·복구·업데이트 절차는 [운영 가이드](OPERATIONS.md)를 따릅니다.

