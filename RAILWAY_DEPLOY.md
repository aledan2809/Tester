# Railway Deployment Guide for Tester

## Quick Deploy (5 minutes)

### 1. Commit Docker Files
```bash
cd C:\Projects\Tester
git add Dockerfile .dockerignore railway.json
git commit -m "Add Railway deployment configuration"
git push
```

### 2. Deploy to Railway

**Option A: Railway CLI (Recommended)**
```bash
# Install Railway CLI (if not installed)
npm i -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Deploy
railway up
```

**Option B: Railway Dashboard**
1. Go to https://railway.app/new
2. Connect your GitHub account
3. Select the `Tester` repository
4. Railway will auto-detect the Dockerfile
5. Click "Deploy"

### 3. Set Environment Variables

In Railway dashboard, add these variables:

```
TESTER_PORT=3012
TESTER_API_SECRET=tester-secret-key-2024-production
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

**Important:** Get your Anthropic API key from:
- https://console.anthropic.com/settings/keys

### 4. Get Your Public URL

Railway will provide a public URL like:
```
https://tester-production-xxxx.up.railway.app
```

Copy this URL - you'll need it for Website Guru.

### 5. Update Website Guru

Add to Website Guru's Vercel environment variables:

```bash
# Go to website-guru Vercel dashboard
# Settings > Environment Variables > Add:

TESTER_API_URL=https://tester-production-xxxx.up.railway.app
TESTER_API_SECRET=tester-secret-key-2024-production
```

Then redeploy Website Guru:
```bash
cd C:\Projects\website-guru
vercel --prod
```

## Troubleshooting

### Build fails with Chromium errors
- Railway uses Dockerfile which includes all Chromium dependencies
- Check logs: `railway logs`

### Health check fails
- Verify port 3012 is exposed
- Check: `curl https://your-url.railway.app/api/health`

### API key errors
- Ensure ANTHROPIC_API_KEY is set in Railway dashboard
- Verify key is valid at console.anthropic.com

### Timeout errors
- Railway hobby plan: No timeout limits
- Tests can run as long as needed

## Cost

Railway Free Tier:
- $5 free credits/month
- ~500 hours runtime
- Perfect for this use case

## Alternative: Railway without Git

If you prefer not to use Git:

```bash
railway login
railway init
railway up --detach
```

This uploads files directly without needing a git repository.

## Monitoring

View logs in real-time:
```bash
railway logs --follow
```

Check service status:
```bash
railway status
```

## Rollback

If something goes wrong:
```bash
railway rollback
```

Or in dashboard: Deployments > Previous version > Rollback
