# Contributing to hanimo-webui

Thanks for your interest in contributing.

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

In the PR description, include:

- What changed
- Why it changed
- Any screenshots for UI work
- Any migration or breaking-change notes

## Reporting Issues

Please include:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (Node version, OS, browser)

Thank you for helping improve hanimo-webui.
