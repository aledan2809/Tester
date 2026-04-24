# @aledan007/tester-service

> HTTP server for [@aledan007/tester](../../README.md) — T-D2 monorepo split.

## What it is

`@aledan007/tester-service` is a thin wrapper around the Express app that
lives inside `@aledan007/tester`'s `src/server/`. It exists so the HTTP
surface can be published, versioned, and deployed **independently** from
the testing library itself:

- CLI consumers (scripts, CI, session-starter templates) keep depending
  on `@aledan007/tester` — no change.
- Deployments that just want to run the HTTP service (Website Guru,
  Master dashboard operators) install only `@aledan007/tester-service`
  + its dependency chain.

## Install

```bash
npm install @aledan007/tester-service
# or, for a workspace checkout:
npm install --workspace @aledan007/tester-service
```

## Run

```bash
# Via the bundled binary:
npx @aledan007/tester-service

# Via Node:
node dist/index.js

# In development:
npm run dev
```

The service reads:

- `TESTER_PORT` — HTTP port (default `3012`)
- `TESTER_API_SECRET` — Bearer token required on protected routes
- `ANTHROPIC_API_KEY` — Optional, for AI-generated scenarios

## API surface

Unchanged from the version shipped inside `@aledan007/tester@<0.2.x>`.
See `@aledan007/tester`'s README section "HTTP Server" for endpoints
(`/api/test/start`, `/api/test/:id/status`, `/api/test/:id/results`,
`/api/test/:id/report`, `/api/health`).

## Versioning contract

Per T-D2 API contract (see `docs/API_CONTRACT.md` in the main package):

- **Tier 1** CLI flags in `@aledan007/tester` are semver-locked.
- **Tier 2** library helpers (`buildUntestedReport`, `evaluateDone`, etc.)
  are minor-mutable; breaking changes bump minor + CHANGELOG.
- **Tier 3** HTTP server routes/bodies belong to this package. Breaking
  changes to the HTTP schema bump this package's minor (not the lib's).

## Upgrade path

| Scenario | What to install | What to change |
|---|---|---|
| Existing `@aledan007/tester@0.2.x` consumer running the HTTP server | Continue using the combined package OR migrate to `@aledan007/tester-service` after pinning tester to >=0.2.x | Swap `node dist/server/index.js` → `npx tester-service` |
| New HTTP-only deployment | `npm i @aledan007/tester-service` | `npx tester-service` |
| CLI-only consumer (`tester run`, `tester lessons`, etc.) | `npm i @aledan007/tester` | No change |

## Roadmap

- v0.1.0 (this release): thin re-export of the combined package's server
  code. Same binary, same endpoints, separate versioning handle.
- v0.2.0+: physical move of `src/server/**` into this package, with
  `@aledan007/tester` re-exporting for backwards compat. Requires a
  major bump of the combined package.
