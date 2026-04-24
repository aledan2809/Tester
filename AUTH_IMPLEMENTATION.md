# Authentication Implementation

## Overview
Comprehensive authentication system for the AI Tester platform with multi-layer security, session management, and platform detection.

## Components

### 1. Server Middleware (`src/server/middleware.ts`)

#### Features
- **Bearer Token Authentication**: Supports both API keys and session tokens
- **Constant-Time Comparison**: Prevents timing attacks using `crypto.timingSafeEqual`
- **Session Management**: 24-hour session duration with automatic cleanup
- **API Key Validation**: Format validation with `tester_` prefix (min 32 chars)
- **Backwards Compatibility**: Supports legacy token formats

#### API Key Format
```
tester_<random-string-min-32-chars-total>
```

#### Session Token Format
```
session_<sha256-hash>
```

#### Middleware Flow
1. Public endpoints (`/api/health`) bypass auth
2. Dev mode (no `TESTER_API_SECRET`) skips auth
3. Session tokens checked first (prefix: `session_`)
4. API key format validation and comparison
5. Legacy token fallback

#### Security Features
- Automatic session expiration (24h)
- Background session cleanup (every 5min)
- Constant-time string comparison
- Per-session metadata tracking

### 2. Login Handler (`src/auth/login.ts`)

#### Enhanced `LoginResult`
```typescript
interface LoginResult {
  success: boolean
  error?: string
  platform?: string
  usedGenericDetection?: boolean
  sessionToken?: string      // NEW: extracted from cookies
  redirectUrl?: string        // NEW: post-login URL
}
```

#### Auto-Detection
- Platform-specific login plans (WordPress, Shopify, Wix, Squarespace, cPanel)
- Generic form detection fallback
- Cookie-based session token extraction

### 3. Browser Core (`src/core/browser.ts`)

#### Enhanced `login()` Method
```typescript
async login(
  credentials: LoginCredentials,
  loginPlan?: LoginPlan,
): Promise<{
  success: boolean
  error?: string
  sessionToken?: string
  redirectUrl?: string
}>
```

#### Session Extraction
- Searches cookies for: `session`, `token`, `auth`
- Returns first matching cookie value
- Supports cookie persistence via `saveCookies()`/`loadCookies()`

### 4. HTTP API Endpoints (`src/server/index.ts`)

#### `POST /api/auth/login`
Authenticates with target site and returns session token.

**Request:**
```json
{
  "url": "https://example.com",
  "username": "admin",
  "password": "secret",
  "loginUrl": "https://example.com/wp-admin" // optional
}
```

**Response (Success):**
```json
{
  "success": true,
  "sessionToken": "session_abc123...",
  "platform": "wordpress",
  "redirectUrl": "https://example.com/wp-admin/",
  "usedGenericDetection": false
}
```

**Response (Failure):**
```json
{
  "success": false,
  "error": "Invalid credentials",
  "platform": "wordpress"
}
```

#### `GET /api/auth/validate`
Validates the current session token (implicitly via Bearer header).

**Response:**
```json
{
  "valid": true,
  "message": "Session is valid"
}
```

## Usage Examples

### 1. API Key Authentication
```bash
# Set API key in environment
export TESTER_API_SECRET="tester_your-secret-key-min-32-chars"

# Use in requests
curl -H "Authorization: Bearer tester_your-secret-key-min-32-chars" \
  http://localhost:3012/api/test/start \
  -d '{"url": "https://example.com"}'
```

### 2. Login and Session Authentication
```bash
# Step 1: Login to target site
curl -X POST http://localhost:3012/api/auth/login \
  -H "Authorization: Bearer tester_api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/wp-admin",
    "username": "admin",
    "password": "secret"
  }'

# Response includes sessionToken
{
  "success": true,
  "sessionToken": "session_abc123def456...",
  "platform": "wordpress"
}

# Step 2: Use session token for subsequent requests
curl -H "Authorization: Bearer session_abc123def456..." \
  http://localhost:3012/api/test/start \
  -d '{"url": "https://example.com", "config": {"credentials": {...}}}'
```

### 3. Validate Session
```bash
curl -H "Authorization: Bearer session_abc123def456..." \
  http://localhost:3012/api/auth/validate
```

## Configuration

### Environment Variables
```bash
# Required for production
TESTER_API_SECRET=tester_your-secret-token-here-min-32-chars

# Optional
TESTER_PORT=3012
ANTHROPIC_API_KEY=sk-ant-...
```

### Session Configuration
```typescript
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours
const API_KEY_PREFIX = 'tester_'
```

## Security Considerations

1. **Timing Attacks**: Prevented via `timingSafeEqual`
2. **Session Expiration**: Automatic 24-hour timeout
3. **Token Format Validation**: Enforces prefix and length requirements
4. **Memory Management**: Automatic cleanup of expired sessions
5. **HTTPS**: Required in production (enforce via reverse proxy)
6. **Cookie Security**: Sessions extracted from target site cookies

## Platform Support

### Supported Platforms
- WordPress (`/wp-admin`, `/wp-login.php`)
- Shopify (`/admin`, `myshopify.com`)
- Wix (`/account/login`, `editor.wix`)
- Squarespace (`/config`)
- cPanel (`:2083`, `/cpanel`)

### Generic Detection
- Automatic form field detection
- Username/email input identification
- Password input identification
- Submit button detection
- Success indicator validation

## Error Handling

### Authentication Errors
- `401 Unauthorized`: Missing/invalid auth header
- `403 Forbidden`: Invalid API key or session
- `401 Session expired`: Session token no longer valid

### Login Errors
- `400 Bad Request`: Missing required fields (url, username, password)
- `401 Unauthorized`: Login failed (invalid credentials)
- `500 Internal Server Error`: Browser launch or network errors

## Maintenance

### Session Cleanup
Background task runs every 5 minutes to purge expired sessions.

### Cookie Persistence
```typescript
// Save session cookies
const cookiesJson = await browser.saveCookies()

// Restore session cookies
await browser.loadCookies(cookiesJson)
```

## Migration Notes

### Breaking Changes
- None (backwards compatible with legacy tokens)

### New Features
- Session-based authentication
- Login endpoint for target site authentication
- Cookie extraction and persistence
- Session validation endpoint

### Deprecations
- None (legacy token format still supported)
