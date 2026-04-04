# Contributing to em-analytics-hub

Thanks for your interest in contributing. This guide covers how to get started.

## Development Setup

```bash
git clone https://github.com/facuzarate04/em-analytics-hub.git
cd em-analytics-hub
npm install
```

## Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run build` | Compile TypeScript to dist/ |
| `npx tsc --noEmit` | Type check without emitting |

## Project Structure

```
src/
├── index.ts              # Plugin descriptor
├── sandbox-entry.ts      # Plugin runtime (hooks + routes)
├── beacon.ts             # Client-side tracking script
├── types.ts              # TypeScript interfaces
├── constants.ts          # Constants and plan definitions
├── helpers/              # Pure utility functions
├── storage/              # Storage operations (events, stats)
├── routes/               # API route handlers
├── admin/                # Admin UI builders (Block Kit)
├── license/              # License provider abstraction
│   └── providers/        # Provider implementations
├── astro/                # Astro component
└── __tests__/            # Test suite
```

## How to Contribute

### Reporting Bugs

Use the [bug report template](https://github.com/facuzarate04/em-analytics-hub/issues/new?template=bug_report.yml). Include your runtime (Cloudflare or Node.js), plugin version, and steps to reproduce.

### Suggesting Features

Use the [feature request template](https://github.com/facuzarate04/em-analytics-hub/issues/new?template=feature_request.yml).

### Submitting Changes

1. Fork the repository
2. Create a branch: `git checkout -b my-change`
3. Make your changes
4. Ensure tests pass: `npm test`
5. Ensure types are clean: `npx tsc --noEmit`
6. Commit with a clear message
7. Open a pull request

### Code Style

- TypeScript strict mode
- ES2022 target
- Use safe access patterns (`data_get` style) instead of direct property access
- Use `report()` for error handling in catch blocks
- No info/debug logs unless explicitly needed

### Tests

Tests use [Vitest](https://vitest.dev/). Add tests for new helpers, utilities, and storage operations. Run with:

```bash
npm test
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
