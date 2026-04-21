# Authentication UI Components

Self-contained, zero-dependency authentication UI components for the Tester framework.

## Components

### LoginForm

Login form with username, password, and optional login URL fields.

```typescript
import { LoginForm } from '@aledan007/tester/ui'

const container = document.getElementById('auth-container')!

const loginForm = new LoginForm(container, {
  credentials: {
    username: 'user@example.com',
    password: ''
  },
  onSubmit: async (credentials) => {
    const result = await someLoginFunction(credentials)
    return { success: result.success, error: result.error }
  },
  onCancel: () => {
    console.log('Login cancelled')
  },
  showRememberMe: true,
  showForgotPassword: true,
  forgotPasswordUrl: '/forgot-password'
})
```

### MfaInput

Multi-factor authentication code input with auto-focus and paste support.

```typescript
import { MfaInput } from '@aledan007/tester/ui'

const container = document.getElementById('mfa-container')!

const mfaInput = new MfaInput(container, {
  length: 6,
  onComplete: async (code) => {
    const result = await verifyMfaCode(code)
    return { success: result.success, error: result.error }
  },
  onResend: async () => {
    await resendMfaCode()
  },
  resendDelay: 60
})
```

### SessionStatus

Session status indicator with expiry warnings and logout button.

```typescript
import { SessionStatus } from '@aledan007/tester/ui'

const container = document.getElementById('session-container')!

const sessionStatus = new SessionStatus(container, {
  isAuthenticated: true,
  username: 'John Doe',
  sessionExpiry: new Date(Date.now() + 3600000),
  onLogout: async () => {
    await logoutFunction()
  }
})
```

## Theming

All components support custom theming:

```typescript
import { LoginForm } from '@aledan007/tester/ui'
import { darkTheme } from '@aledan007/tester/ui/utils/theme'

const loginForm = new LoginForm(container, {
  theme: darkTheme,
  onSubmit: async (credentials) => {
    // ...
  }
})
```

Available theme properties:

```typescript
interface AuthUITheme {
  primaryColor?: string
  backgroundColor?: string
  textColor?: string
  errorColor?: string
  successColor?: string
  borderRadius?: string
  fontFamily?: string
}
```

Built-in themes:
- `defaultTheme` - Light theme (default)
- `darkTheme` - Dark theme
- `compactTheme` - Compact light theme

## Features

- Zero external dependencies
- Self-contained styling (scoped CSS)
- TypeScript support
- Accessible (ARIA labels, keyboard navigation)
- Mobile-friendly
- Customizable theming
- Auto-focus and paste support (MFA input)
- Session expiry warnings (SessionStatus)
- Loading states and error handling
- Remember me checkbox
- Forgot password link

## Lifecycle Management

All components support updating and cleanup:

```typescript
// Update props
loginForm.updateProps({ loading: true })

// Cleanup
loginForm.destroy()
```

## Integration Example

Complete authentication flow:

```typescript
import { LoginForm, MfaInput, SessionStatus } from '@aledan007/tester/ui'

const container = document.getElementById('auth-root')!
let currentComponent: any = null

// Start with login form
currentComponent = new LoginForm(container, {
  onSubmit: async (credentials) => {
    const result = await login(credentials)

    if (result.requiresMfa) {
      currentComponent.destroy()
      showMfaInput()
      return { success: false }
    }

    if (result.success) {
      currentComponent.destroy()
      showSessionStatus()
    }

    return result
  }
})

function showMfaInput() {
  currentComponent = new MfaInput(container, {
    onComplete: async (code) => {
      const result = await verifyMfa(code)

      if (result.success) {
        currentComponent.destroy()
        showSessionStatus()
      }

      return result
    }
  })
}

function showSessionStatus() {
  currentComponent = new SessionStatus(container, {
    isAuthenticated: true,
    username: getCurrentUser(),
    sessionExpiry: getSessionExpiry(),
    onLogout: async () => {
      await logout()
      currentComponent.destroy()
      // Restart flow
    }
  })
}
```
