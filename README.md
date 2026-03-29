# EmComm Coordination Platform

A vertical SaaS platform for coordinating amateur radio and emergency communications (EmComm) operations.

## Repository Structure

```
emcomm/
├── packages/
│   ├── api/       — REST API server (Node.js)
│   ├── web/       — Web frontend
│   └── shared/    — Shared types and utilities
├── .github/
│   └── workflows/
│       └── ci.yml — CI pipeline (lint, typecheck, test)
├── tsconfig.json
├── tsconfig.base.json
├── .eslintrc.json
└── .prettierrc.json
```

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0

## Local Development Setup

### 1. Install dependencies

```bash
npm install
```

This installs all workspace dependencies in one shot.

### 2. Build shared package first

```bash
npm run build --workspace=packages/shared
```

### 3. Start the API server

```bash
npm run dev:api
```

The API will start on `http://localhost:3000` (override with `PORT` env var).

### 4. Start the web app (separate terminal)

```bash
npm run dev:web
```

## Common Commands

| Command | Description |
|---|---|
| `npm run lint` | Run ESLint across all packages |
| `npm run format` | Auto-format with Prettier |
| `npm run format:check` | Check formatting without writing |
| `npm run typecheck` | TypeScript type-check all packages |
| `npm run build` | Build all packages |
| `npm test` | Run tests across all packages |

## CI

GitHub Actions runs on every push and pull request to `main` / `develop`:

1. **Lint** — ESLint + Prettier format check
2. **Typecheck** — TypeScript strict mode across all packages
3. **Test** — Jest unit tests

## Environment Variables

Create a `.env` file in `packages/api/`:

```env
PORT=3000
DATABASE_URL=postgresql://localhost:5432/emcomm
```

## Architecture Overview

- `@emcomm/shared` — Domain types (Operator, Net, Incident, CheckIn) shared between API and web
- `@emcomm/api` — Express REST API; routes defined in `BLUAAA-4`
- `@emcomm/web` — Web frontend; to be defined in subsequent tasks
