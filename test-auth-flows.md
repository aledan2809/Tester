# Authentication Implementation - Test Plan

## Overview
The authentication system has been fully implemented with the following components:

1. **Server Middleware** (`src/server/middleware.ts`)
2. **Login Handler** (`src/auth/login.ts`)
3. **Browser Core** (`src/core/browser.ts`)
4. **HTTP API Endpoints** (`src/server/index.ts`)

## Authentication Flows

### Flow 1: API Key Authentication
```bash
# Set the API key
export TESTER_API_SECRET="tester_your-secret-key-min-32-chars"

# Make authenticated request
curl -H "Authorization: Bearer tester_your-secret-key-min-32-chars" \
  http://localhost:3012/api/test/start \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

**Expected Response:** `202 Accepted` with `testId`

### Flow 2: Target Site Login + Session Authentication
```bash
# Step 1: Login to target WordPress site
curl -X POST http://localhost:3012/api/auth/login \
  -H "Authorization: Bearer tester_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://utilajhub.ro/wp-admin",
    "username": "utilajhub",
    "password": "MihDan74!?><@#",
    "loginUrl": "http://utilajhub.ro/wp-admin"
  }'

# Expected Response:
{
  "success": true,
  "sessionToken": "session_abc123...",
  "platform": "wordpress",
  "redirectUrl": "http://utilajhub.ro/wp-admin/",
  "usedGenericDetection": false
}

# Step 2: Use session token for subsequent requests
curl -H "Authorization: Bearer session_abc123..." \
  http://localhost:3012/api/test/start \
  -H "Content-Type: application/json" \
  -d '{"url": "http://utilajhub.ro"}'
```

### Flow 3: Session Validation
```bash
curl -H "Authorization: Bearer session_abc123..." \
  http://localhost:3012/api/auth/validate

# Expected Response:
{
  "valid": true,
  "message": "Session is valid"
}
```

## Security Features

### 1. Timing Attack Prevention
- Uses `crypto.timingSafeEqual` for constant-time string comparison
- Prevents attackers from determining valid tokens via timing analysis

### 2. Session Management
- 24-hour session duration
- Automatic cleanup every 5 minutes
- Per-session metadata tracking

### 3. Token Format Validation
- API keys must start with `tester_` prefix
- Minimum 32 characters total length
- Session tokens use `session_` prefix with SHA-256 hash

### 4. Multi-layer Authentication
- Public endpoints bypass auth (`/api/health`)
- Dev mode support (no secret = skip auth)
- Session tokens checked before API keys
- Legacy token fallback for backwards compatibility

## Test Cases

### Test 1: Public Endpoint Access
```bash
curl http://localhost:3012/api/health
# Expected: 200 OK (no auth required)
```

### Test 2: Protected Endpoint Without Auth
```bash
curl http://localhost:3012/api/test/start \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
# Expected: 401 Unauthorized
```

### Test 3: Protected Endpoint With Invalid Token
```bash
curl -H "Authorization: Bearer invalid-token" \
  http://localhost:3012/api/test/start \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
# Expected: 403 Forbidden
```

### Test 4: Protected Endpoint With Valid API Key
```bash
curl -H "Authorization: Bearer tester_your-secret-key-min-32-chars" \
  http://localhost:3012/api/test/start \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
# Expected: 202 Accepted
```

### Test 5: Login With Missing Fields
```bash
curl -X POST http://localhost:3012/api/auth/login \
  -H "Authorization: Bearer tester_api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
# Expected: 400 Bad Request (missing username/password)
```

### Test 6: Login With Invalid URL
```bash
curl -X POST http://localhost:3012/api/auth/login \
  -H "Authorization: Bearer tester_api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "not-a-url", "username": "test", "password": "test"}'
# Expected: 400 Bad Request
```

### Test 7: API Key Format Validation
```bash
curl -H "Authorization: Bearer tester_short" \
  http://localhost:3012/api/test/start \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
# Expected: 403 Forbidden (key too short)
```

### Test 8: Session Expiration
```bash
# Create session, wait 24+ hours, use token
# Expected: 401 Session expired
```

### Test 9: Expired Session Cleanup
```bash
# Sessions older than 24 hours are automatically removed every 5 minutes
# No manual cleanup needed
```

### Test 10: WordPress Login (Real Target)
```bash
curl -X POST http://localhost:3012/api/auth/login \
  -H "Authorization: Bearer tester_api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://utilajhub.ro/wp-admin",
    "username": "utilajhub",
    "password": "MihDan74!?><@#"
  }'
# Expected: 200 OK with sessionToken (or 401 if 2FA required)
```

## Platform Support

### Supported Platforms
- **WordPress** - Auto-detected via `/wp-admin` or `/wp-login.php`
- **Shopify** - Auto-detected via `/admin` or `myshopify.com`
- **Wix** - Auto-detected via `/account/login` or `editor.wix`
- **Squarespace** - Auto-detected via `/config`
- **cPanel** - Auto-detected via `:2083` or `/cpanel`
- **Generic** - Automatic form field detection for unknown platforms

### Platform Detection Logic
```typescript
// URL-based detection in autoLogin()
if (url.includes('wp-admin')) → WordPress plan
if (url.includes('shopify')) → Shopify plan
if (url.includes('wix')) → Wix plan
// etc.

// Fallback: Generic form detection
→ Find password field
→ Find username/email field
→ Find submit button
→ Fill and submit
→ Check for success indicators
```

## Cookie Management

### Saving Session Cookies
```typescript
const cookiesJson = await browser.saveCookies()
// Returns: JSON string with all cookies
```

### Loading Session Cookies
```typescript
await browser.loadCookies(cookiesJson)
// Restores previous session
```

### Cookie Extraction
After successful login, the system:
1. Captures all cookies from target site
2. Searches for session-related cookies (`session`, `token`, `auth`)
3. Returns first matching cookie value
4. Stores cookies in session metadata

## Error Handling

### Authentication Errors
| Code | Message | Cause |
|------|---------|-------|
| 401 | Missing or invalid Authorization header | No Bearer token provided |
| 401 | Session expired or invalid | Session token no longer valid |
| 403 | Invalid API key | API key doesn't match configured secret |
| 403 | Invalid token format | Token format not recognized |

### Login Errors
| Code | Message | Cause |
|------|---------|-------|
| 400 | url, username, and password are required | Missing required fields |
| 400 | Invalid URL | URL format invalid |
| 401 | Login failed | Invalid credentials or login rejected |
| 500 | Login error | Browser crash, network error, etc. |

## Configuration

### Environment Variables
```bash
# Required for production
TESTER_API_SECRET=tester_your-secret-token-here-min-32-chars

# Optional
TESTER_PORT=3012
ANTHROPIC_API_KEY=sk-ant-...
```

### Session Configuration (hardcoded)
```typescript
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours
const API_KEY_PREFIX = 'tester_'
const MIN_KEY_LENGTH = 32
```

## Validation Checklist

- [x] Middleware implements timing-safe comparison
- [x] API key format validation (prefix + length)
- [x] Session token creation with expiration
- [x] Session validation and refresh
- [x] Automatic session cleanup
- [x] Public endpoint bypass
- [x] Dev mode support (no secret)
- [x] Login endpoint (target site auth)
- [x] Session validation endpoint
- [x] Platform auto-detection
- [x] Generic form detection fallback
- [x] Cookie extraction and persistence
- [x] Error handling for all auth flows
- [x] Bearer token parsing
- [x] Multi-layer token validation
- [x] Backwards compatibility with legacy tokens

## Running Tests

### Automated Validation
```bash
# Start the server first
npm run server &

# Wait for server to start
sleep 3

# Run validation script
node validate-auth.mjs

# Expected output:
# === Authentication Validation Tests ===
# Testing: Health check endpoint (public) ... ✓ PASS
# Testing: Protected endpoint without auth ... ✓ PASS
# Testing: Protected endpoint with invalid token ... ✓ PASS
# ...
# ✓ All authentication tests passed!
```

### Manual Testing
```bash
# Terminal 1: Start server
export TESTER_API_SECRET="tester_test-key-min-32-chars-total"
npm run server

# Terminal 2: Test endpoints
curl http://localhost:3012/api/health
curl -H "Authorization: Bearer tester_test-key-min-32-chars-total" \
  http://localhost:3012/api/auth/validate
```

## Integration with Existing System

The authentication system is already integrated into:

1. **HTTP Server** (`src/server/index.ts`)
   - All routes protected except `/api/health`
   - Login endpoint at `/api/auth/login`
   - Validation endpoint at `/api/auth/validate`

2. **Browser Core** (`src/core/browser.ts`)
   - `login()` method for target site auth
   - `saveCookies()` / `loadCookies()` for session persistence
   - Cookie extraction logic

3. **Auth Module** (`src/auth/login.ts`)
   - `autoLogin()` function with platform detection
   - Generic form detection fallback
   - Session token extraction

4. **Middleware** (`src/server/middleware.ts`)
   - `authMiddleware()` for request validation
   - `createSession()` for session management
   - Session cleanup background task

## Next Steps

1. **Deploy to Production**
   ```bash
   npm run build
   export TESTER_API_SECRET="<secure-random-token>"
   npm run start:server
   ```

2. **Test with Real Target Site**
   ```bash
   curl -X POST http://localhost:3012/api/auth/login \
     -H "Authorization: Bearer $TESTER_API_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"url": "http://utilajhub.ro/wp-admin", "username": "utilajhub", "password": "..."}'
   ```

3. **Monitor Sessions**
   - Sessions auto-expire after 24 hours
   - Auto-cleanup runs every 5 minutes
   - Check server logs for session activity

## Documentation

Full documentation available in:
- `AUTH_IMPLEMENTATION.md` - Comprehensive auth guide
- `README.md` - Quick start and API reference
- `.env.example` - Environment variable template
