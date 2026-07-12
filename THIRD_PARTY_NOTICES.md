# Third-party notices / 제3자 고지

Hanimo WebUI uses open-source packages and web assets owned by their respective
authors. The project-level Apache License 2.0 does not replace those licenses.

Hanimo WebUI는 각 저작자가 권리를 보유한 오픈소스 패키지와 웹 자산을
사용합니다. 프로젝트의 Apache License 2.0은 해당 개별 라이선스를 대체하지
않습니다.

## Direct runtime and UI dependencies / 주요 직접 의존성

The authoritative package names and versions are pinned in `package-lock.json`.
Major dependency families include Next.js and React, PostgreSQL `pg`, Radix UI,
Lucide, Phosphor Icons, Recharts, bcryptjs, jose/jsonwebtoken, Winston,
rehype-sanitize, Sonner, and dnd-kit. Their license texts and copyright notices
remain available in the installed packages and upstream repositories.

정확한 패키지명과 버전은 `package-lock.json`에 고정되어 있습니다. 설치된
패키지와 업스트림 저장소에 포함된 각 라이선스 및 저작권 고지를 유지해야 합니다.

| Direct package family | Declared license |
|---|---|
| Next.js, React, `pg`, Radix UI, dnd-kit, Phosphor Icons, Recharts, bcryptjs, jose, jsonwebtoken, Winston, rehype-sanitize, Sonner, Tailwind CSS | MIT |
| Lucide | ISC |
| class-variance-authority | Apache-2.0 |
| dotenv | BSD-2-Clause |
| TypeScript | Apache-2.0 |

This compact table is an orientation aid, not a replacement for the locked
package inventory or the license texts shipped by each package.

## Assets and fonts / 자산 및 폰트

- Pretendard variable web font is loaded from the upstream jsDelivr package.
  Its upstream license applies.
- The default `next.svg`, `vercel.svg`, `globe.svg`, `window.svg`, and
  `file.svg` assets originate from the Next.js starter template and retain
  their upstream terms.
- Hanimo-specific icons and branding remain covered by the project copyright
  and the separate `TRADEMARKS.md` policy.

## License audit snapshot / 라이선스 감사 스냅샷

An initial local inventory on 2026-07-12 found packages under MIT, ISC,
Apache-2.0, BSD, MPL-2.0, LGPL-3.0-or-later, Python-2.0, CC-BY-4.0, CC0-1.0,
and 0BSD identifiers. Notable transitive components included:

- `@img/sharp-libvips-darwin-arm64` — LGPL-3.0-or-later
- `axe-core` and `lightningcss` — MPL-2.0
- `argparse` — Python-2.0
- `caniuse-lite` — CC-BY-4.0

This is an inventory, not a compatibility opinion. A release gate should
generate a complete machine-readable SBOM and license report from the locked
dependency graph, review exceptions, and attach the results to each release.

이 목록은 현황 기록이며 법적 호환성 판단이 아닙니다. 릴리스 시 잠금 파일을
기준으로 SBOM과 전체 라이선스 보고서를 생성하고 예외를 검토해야 합니다.
