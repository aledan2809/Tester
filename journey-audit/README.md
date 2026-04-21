# Journey Audit — Reusable cross-project user-journey E2E

Walks a real logged-in user through every nav link of a web app, screenshots
every page, and reports what's **functional / gated / empty / broken**. Meant
to catch UX regressions that API-shape tests and unit tests miss.

Lives in Tester because it's project-agnostic: each target app provides its
own JSON config (login URL, nav list, selectors) and the spec does the rest.

## Why it exists

Static code review and API-shape tests can pass while the UI is broken for
real users. Journey audit replicates what a user sees:

1. Login on the real login page
2. Click every sidebar link in order
3. Screenshot the result
4. Classify: `OK`, `GATED` (onboarding wall), `EMPTY`, `HAS_ERRORS`, `CRASHED`

Two bugs it has already caught on TradeInvest:
- Signals page trapped as a hidden tab on `/ctrader`, invisible without cTrader
- Signal generation blocked at the source whenever cTrader wasn't linked

Neither shows up in unit tests or API-shape E2E. Only walking the app does.

## Config format

`journey-audit/configs/<project>.json`:

```json
{
  "name": "TradeInvest",
  "baseUrl": "https://tradeinvest.knowbest.ro",
  "login": {
    "path": "/auth/login",
    "emailSelector": "input[type=email]",
    "passwordSelector": "input[type=password]",
    "submitSelector": "button[type=submit]",
    "successUrlPattern": "/(dashboard|simulator|settings|$)"
  },
  "credentials": {
    "emailEnv": "JOURNEY_EMAIL",
    "passwordEnv": "JOURNEY_PASSWORD"
  },
  "navLinks": [
    { "name": "Dashboard", "href": "/dashboard" },
    { "name": "Portofoliu", "href": "/portfolio" }
  ],
  "onboardingMarkers": "Set CTRADER_|Link your|Connect|Configure|Activate.*account",
  "viewport": { "width": 1440, "height": 900 }
}
```

Credentials NEVER stored in the config file. Only env var names. Values come
from the shell that runs the audit.

## Usage

### Against a project that has a config:
```bash
cd ~/Projects/Tester
JOURNEY_PROJECT=tradeinvest \
JOURNEY_EMAIL=you@example.com \
JOURNEY_PASSWORD='...' \
  npx playwright test --config=journey-audit/playwright.config.ts --headed
```

### Outputs
- `journey-audit/results/<project>/screenshots/*.png` — one per page, full-page
- `journey-audit/results/<project>/report.json` — structured findings
- Console table with status per page + totals

### Add a new project
1. Drop a JSON config in `journey-audit/configs/<name>.json`
2. Run with `JOURNEY_PROJECT=<name>`

No code changes needed.

## Interpretation

| Status | Meaning | Action |
|---|---|---|
| **OK** | Page rendered, no empty/error markers | Good |
| **GATED** | Onboarding wall matched (e.g. "Connect X to continue") | Check if user has a way to bypass |
| **EMPTY** | Body text < 200 chars | Page probably broken or missing content |
| **HAS_ERRORS** | Text like "error/failed" visible | May be false positive (content mentions "error") — inspect screenshot |
| **CRASHED** | Navigation throw / timeout | Real bug |

Screenshots always saved — fastest triage is visual.
