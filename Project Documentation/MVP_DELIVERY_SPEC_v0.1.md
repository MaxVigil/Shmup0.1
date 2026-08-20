# MVP Delivery Specification v0.1

**Product:** Shmup  
**Scope:** Production build and deployment acceptance  
**Status:** READY FOR IMPLEMENTATION  

## 1. Delivery model

The MVP is delivered as one client-only static web application with one entry URL.

- It requires a static HTTP(S) host.
- Production hosting uses HTTPS.
- Local development and verification may use HTTP through a local static server.
- Direct execution through `file://` is unsupported.
- The MVP has no client-side routes that require server rewrite rules.

Hosting-provider selection remains intentionally deferred. The approved architecture is defined by `MVP_TECHNICAL_FOUNDATION_v0.1.md`; it does not authorize a hosting provider.

## 2. Runtime boundary

The production application must not require:

- a backend or server-side application runtime;
- a database;
- accounts, authentication, or profiles;
- analytics, advertising, telemetry, or tracking;
- cookies or consent UI;
- remote configuration or content APIs;
- font, icon, image, script, or style CDNs;
- a Service Worker, offline mode, or custom persistent cache.

All required game content is packaged with the production artifact.

## 3. Supported environment

The production acceptance environment is:

```text
platform: Windows 10 64-bit
browsers: latest stable Chrome and Edge available for Windows 10 at test time
input: keyboard and mouse
minimum viewport: 1280 × 600 CSS pixels
performance viewport: native 1366 × 768
```

Mobile, touch, portrait layout, and browsers outside this acceptance set are not delivery blockers for MVP.

## 4. Production-mode requirements

- `DEV_MODE = false`.
- Debug UI is absent and `F1` has no product effect.
- Development diagnostics do not appear in player-facing UI.
- Normal golden-path use produces no uncaught error or application warning in the browser console.
- A build identifier is available in console diagnostics and performance records but is not displayed in normal player UI.
- Fatal startup errors may write technical detail to the console while showing only the approved player-facing fatal view.

## 5. Deployable output

The deployable directory contains only files required at production runtime.

It must not contain:

- source JPEG backgrounds from `assets/source/`;
- test files, fixtures, or test reports;
- development-only assets or Debug configuration enabled by default;
- complete font or icon packages;
- unrelated source documents or speculative game assets;
- dependency installation directories.

Runtime asset paths must work under the approved hosting base path and must not depend on a developer's absolute filesystem path.

## 6. Build contract

- A clean checkout uses `npm ci` and produces the production artifact through `npm run build`.
- A second build from the same source revision and dependency lock must not require manual file editing.
- Build failure returns a non-zero status and must not leave an artifact represented as releasable.
- Vite, the dependency matrix, repository lockfile, and commands are approved by the Technical Foundation and Verification specifications.
- Production source maps are disabled for the MVP. Development tooling may use its normal local source mapping.
- Phaser and Combat presentation must remain in the separate lazy Combat chunk. Further feature-level chunk tuning must be measurement-driven and satisfy the approved delivery and performance boundaries.
- Any later stack decision must preserve the product performance and runtime boundaries defined by the Master Design Document.

## 7. Required release verification

Before a build is handed to testers, record:

```text
build identifier
source revision
build command result
production output size
runtime asset total
tested browser versions
tested viewport
Boot timing
Base interaction result
Combat performance result
five-mission cleanup result
keyboard-only UI audit result
Design System audit result
```

The smoke test must cover:

1. cold page load to Operations;
2. Operations ↔ Hangar navigation;
3. weapon selection and Repair availability rules;
4. mission start;
5. one Success or Defeat path;
6. Return to Base through Aborted;
7. refresh reset;
8. one representative asset-failure fallback;
9. production confirmation that Debug Mode is unavailable.

## 8. Negative requirements

The implementation agent must not select or configure a production hosting provider, backend, analytics product, CDN, Service Worker, deployment account, domain, or release channel without a later explicit decision.

## 9. Acceptance criteria

### DELIVERY-AC-001 — Clean production build

**Given** a clean checkout and approved dependency lock,  
**when** the documented production build command runs,  
**then** it succeeds without manual edits and produces one deployable static application directory.

### DELIVERY-AC-002 — Client-only runtime

**Given** the production artifact is served from a static host,  
**when** the complete MVP loop runs,  
**then** it requires no backend, database, authentication, analytics, telemetry, remote content API, or runtime CDN.

### DELIVERY-AC-003 — Production-mode isolation

**Given** the production build is open,  
**when** the player presses `F1` or follows the normal MVP loop,  
**then** Debug UI remains unavailable and normal use produces no uncaught browser-console error or application warning.

### DELIVERY-AC-004 — Artifact hygiene

**Given** the deployable directory is inspected,  
**when** its files are compared with the approved runtime requirements,  
**then** it contains no source JPEG, test artifact, development-only enabled configuration, complete icon/font package, dependency installation directory, or speculative asset.

### DELIVERY-AC-005 — Release evidence

**Given** a build is proposed for external testing,  
**when** release readiness is reviewed,  
**then** every required build, browser, performance, lifecycle, keyboard, and Design System record is present and passing.
