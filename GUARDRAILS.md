# Guardrails — AI Tester

## Safety
- Domain lock: browser never navigates outside allowed domains
- URL blocklist: logout, delete account, cancel plan URLs always skipped
- Dangerous evaluate scripts blocked (cookie writes, localStorage.clear, innerHTML=)
- MFA: never auto-submit MFA unless user provides TOTP secret
- Screenshots: only viewport, never capture sensitive data fields

## Quality
- All code must pass `tsc --noEmit` before commit
- All tests must pass before commit
- tsup build must succeed before release
- No Puppeteer in unit tests (mock or skip)

## Scope
- Tester does NOT modify websites (read-only by design)
- Tester does NOT store credentials (passed at runtime, never persisted)
- Tester reports MUST NOT include passwords or secrets in output
