# T-D3 — Deploying the docs site

The static build lives in `docs-build/` (gitignored). Three deploy options are supported without further config.

## Build

```bash
npm run docs:build    # writes docs-build/*.html
npm run docs:serve    # local preview on http://localhost:4173
```

Source of truth: `docs/*.md`. The build script (`scripts/build-docs.mjs`) walks every `.md`, rewrites inline `*.md` links to `*.html`, and wraps each page in a shared template with a sidebar.

## Option 1 — GitHub Pages

```bash
npm run docs:build
# Push docs-build/ as a fresh commit on a gh-pages branch:
git checkout --orphan gh-pages
git rm -rf .
cp -R docs-build/* .
git add -A && git commit -m "docs: deploy"
git push origin gh-pages
git checkout master
```

Hosted at `https://<org>.github.io/Tester/` when GH Pages is enabled on the `gh-pages` branch.

## Option 2 — Vercel

Project setup (one-time):

```
vercel link
vercel env add  # (none required)
```

`vercel.json` (committed at repo root — see below):

```json
{
  "buildCommand": "npm run docs:build",
  "outputDirectory": "docs-build",
  "framework": null
}
```

Every push triggers a rebuild.

## Option 3 — VPS1 nginx (tester.techbiz.ae/docs)

```bash
npm run docs:build
rsync -av --delete docs-build/ root@187.77.179.159:/var/www/tester-docs/
# Ensure nginx serves /var/www/tester-docs/ under /docs:
#   location /docs/ {
#     alias /var/www/tester-docs/;
#     try_files $uri $uri/ =404;
#     index index.html;
#   }
# Reload: ssh root@187.77.179.159 'nginx -t && systemctl reload nginx'
```

Vercel + VPS1 configs are compatible: the build output doesn't reference a CDN or absolute hostname, so it works under any path prefix.

## Automating on commit

If you want docs to rebuild on every commit to `master`, add a GitHub Actions workflow:

```yaml
# .github/workflows/docs.yml
name: Deploy docs
on:
  push:
    branches: [master]
    paths: ['docs/**', 'scripts/build-docs.mjs']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run docs:build
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs-build
```

## What the build produces

```
docs-build/
  index.html           ← copy of README.html
  README.html
  cookbook.html
  anti-patterns.html
  scenarios.html
  API_CONTRACT.html
```

~170 lines per page, self-contained (inline CSS, no JS, no CDN). Adding a new page: just drop a `docs/<name>.md`; it appears in the sidebar on next build.
