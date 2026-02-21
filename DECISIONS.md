# Decisions — AI Tester

## D001: Puppeteer over Playwright
**Decision**: Use Puppeteer for browser automation
**Reason**: WG already has 2,500 lines of production Puppeteer code. Reuse > rewrite.

## D002: CLI + Library (no web dashboard)
**Decision**: Ship as TypeScript library + CLI tool, no web UI
**Reason**: Alex chose this option. Focused, lightweight. Can be imported by AVE later.

## D003: tsup build (CJS + ESM + DTS)
**Decision**: Use tsup for building, same pattern as @aledan/whatsapp and @aledan/gcalendar
**Reason**: Consistent with other standalone modules.

## D004: Full test suite (Functional + Visual + A11Y + Performance)
**Decision**: Cover all 4 categories from Sprint 1 architecture
**Reason**: Alex chose full suite over minimal functional-only.

## D005: Adapt WG code, don't copy
**Decision**: Write new files inspired by WG, don't symlink or copy-paste
**Reason**: Test context differs from fix context. Need different API surfaces.
