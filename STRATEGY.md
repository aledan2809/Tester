# Strategy — AI Tester

## Vision
Standalone AI-powered web testing engine that autonomously discovers and tests any website — functional, visual, accessibility, and performance.

## Position in AVE Ecosystem
- **AVE audits** web standards (9 pillars: SEO, security, a11y, etc.)
- **Website Guru fixes** issues found by AVE
- **AI Tester tests** whether web apps actually work (forms, buttons, flows, bugs)

## Target Users
1. Alex (direct CLI usage for internal testing)
2. AVE ecosystem (library import for automated testing pipelines)
3. Future: standalone SaaS offering

## Tech Stack
- TypeScript library + CLI (tsup build)
- Puppeteer for browser automation
- Claude API for scenario generation + AI element finder
- pixelmatch for visual regression
- axe-core for accessibility
- Commander for CLI

## Sprint Plan
1. Foundation (COMPLETE) — core, discovery, CLI skeleton
2. Auth + Scenario Generation — login, MFA, AI test scenarios
3. Execution Engine + Assertions — DOM, network, visual, a11y, perf
4. Reporter + Polish — HTML/JSON reports, self-healing, CI/CD
