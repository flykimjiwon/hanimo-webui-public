# Hanimo 운영 가이드

새로운 macOS Apple Silicon 환경에서 Docker Desktop 설치부터 로그인, `hmo_` API Key, 모델 조회까지 직접 확인하려면 [수동 Docker QA 가이드](MANUAL_DOCKER_QA.md)를 따르세요.

## 검증된 revision으로 설치

원격 bootstrap은 기본적으로 변경되지 않는 commit을 사용합니다. 검토되지 않은 branch 이름을 `HANIMO_REF`로 전달하지 마세요.

```bash
curl -fsSLo hanimo-bootstrap.sh https://raw.githubusercontent.com/flykimjiwon/hanimo-webui-public/main/scripts/bootstrap.sh
echo "67a7ff932df0602a380b9483e35d6ad3c60bcd784d0d172bb817a13c4d85bd38  hanimo-bootstrap.sh" | shasum -a 256 -c -
bash hanimo-bootstrap.sh --yes
```

다운로드 후 내용을 먼저 검토하려면 다음처럼 실행합니다.

```bash
curl -fsSLo hanimo-bootstrap.sh https://raw.githubusercontent.com/flykimjiwon/hanimo-webui-public/main/scripts/bootstrap.sh
echo "67a7ff932df0602a380b9483e35d6ad3c60bcd784d0d172bb817a13c4d85bd38  hanimo-bootstrap.sh" | shasum -a 256 -c -
less hanimo-bootstrap.sh
bash hanimo-bootstrap.sh --yes --dir "$HOME/hanimo-webui"
```

## 일상 운영

```bash
./scripts/manage.sh status
./scripts/manage.sh logs app
./scripts/doctor.sh
```

`stop`과 `uninstall`은 PostgreSQL volume을 삭제하지 않습니다.

```bash
./scripts/manage.sh stop
./scripts/manage.sh uninstall
```

## 백업과 복구

백업은 `backups/`에 압축 SQL과 권한이 제한된 `.env` 복사본을 만듭니다. 두 파일을 함께 암호화된 외부 저장소로 옮기세요. `.env`의 credential encryption key가 없으면 저장된 provider API key를 복호화할 수 없습니다.

```bash
./scripts/manage.sh backup
./scripts/manage.sh restore backups/hanimo-YYYYMMDDTHHMMSSZ.sql.gz --yes
```

복구 명령은 먼저 현재 DB를 자동 백업한 다음 `ON_ERROR_STOP`으로 SQL을 적용합니다. 다른 PostgreSQL major version으로 이전할 때는 별도 staging 환경에서 먼저 복구를 검증하세요.

## 업데이트와 롤백

release tag 또는 검토한 40자리 commit을 명시합니다. 업데이트는 먼저 백업하고, source checkout을 해당 revision으로 전환한 뒤 image를 다시 빌드하고 route smoke check를 실행합니다.

```bash
./scripts/manage.sh update --ref <reviewed-tag-or-commit>
```

실패하면 직전 commit과 자동 생성된 백업을 사용합니다.

```bash
git rev-parse HEAD@{1}
./scripts/manage.sh update --ref <previous-commit>
./scripts/manage.sh restore backups/<pre-update-backup>.sql.gz --yes
```

## 데이터까지 완전히 삭제

다음 명령은 되돌릴 수 없습니다. 먼저 `backup` 결과를 별도 저장소에 복사한 경우에만 직접 실행하세요.

```bash
docker compose down --volumes
rm -rf backups
```
