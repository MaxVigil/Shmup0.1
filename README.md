# Shmup MVP

This repository contains the browser-based Shmup MVP.

## Authority

Current product and technical contracts are stored in [`Project Documentation/`](./Project%20Documentation/README.md). Missing or conflicting behaviour must not be invented during implementation.

## Environment

```text
Node 24.19.0
npm 11.17.0
```

Install the exact locked dependencies with:

```text
npm ci
```

## Commands

```text
npm run dev
npm run verify
npm run verify:browser
npm run verify:all
```

See [`MVP_VERIFICATION_AND_QUALITY_GATES_v0.1.md`](./Project%20Documentation/MVP_VERIFICATION_AND_QUALITY_GATES_v0.1.md) for the complete command and evidence contract.

## Current status

The technical scaffold, governance package, and final technical audit are verified. Feature implementation is authorized only through explicitly scoped tasks governed by `AGENTS.md`.
