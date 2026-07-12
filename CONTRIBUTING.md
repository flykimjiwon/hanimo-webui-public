# Contributing to hanimo-webui

Thanks for your interest in contributing.

한국어 기여도 환영합니다. 문서와 UI 문구를 변경할 때는 가능한 한 한국어와
영어를 함께 갱신하고, 한쪽만 변경했다면 PR에 번역 후속 작업을 명시하세요.

## License and provenance

Unless a separate written agreement applies, intentionally submitted
contributions are accepted under Apache License 2.0 section 5. By submitting a
pull request, you confirm that you have the right to submit the work.

- Disclose copied, adapted, or generated third-party code and assets with their
  source and license.
- Obtain any required employer or client permission before contributing.
- If AI tooling was used, review the result and remain responsible for its
  provenance, security, and correctness.
- Do not remove or falsify copyright, license, or attribution notices.

See `COPYRIGHT_POLICY.md`, `THIRD_PARTY_NOTICES.md`, and `TRADEMARKS.md`.

## Development Setup

1. Fork and clone the repository.
2. Install dependencies:

```bash
npm install
```

3. Create local environment config:

```bash
cp .env.example .env.local
```

4. Start development server:

```bash
npm run dev
```

## Contribution Rules

- Keep changes focused and atomic.
- Follow existing code style and naming conventions.
- Prefer shadcn/ui components and semantic design tokens.
- Do not introduce blue or purple accent colors.
- Do not add `as any`, `@ts-ignore`, or dead code.

## Pull Requests

Before opening a pull request:

```bash
npm run lint
SKIP_DB_CONNECTION=true npm run build
```

Also run the smallest relevant security or behavior tests for the files you
changed. Database migrations require backup, restore, upgrade, and rollback
notes. UI changes require desktop and mobile screenshots in both themes.

In the PR description, include:

- What changed
- Why it changed
- Any screenshots for UI work
- Any migration or breaking-change notes
- Third-party source/license details and AI-tool disclosure when applicable
- Korean/English documentation impact

## Reporting Issues

Please include:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (Node version, OS, browser)

Thank you for helping improve hanimo-webui.

Project contact: Kim Jiwon (김지원), `flykimjiwun@naver.com`.
