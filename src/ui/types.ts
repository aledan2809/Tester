import type { LoginCredentials } from '../core/types'

export interface AuthUITheme {
  primaryColor?: string
  backgroundColor?: string
  textColor?: string
  errorColor?: string
  successColor?: string
  borderRadius?: string
  fontFamily?: string
}

export interface LoginFormProps {
  credentials?: Partial<LoginCredentials>
  onSubmit: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>
  onCancel?: () => void
  loading?: boolean
  error?: string
  theme?: AuthUITheme
  showRememberMe?: boolean
  showForgotPassword?: boolean
  forgotPasswordUrl?: string
}

export interface MfaInputProps {
  length?: number
  onComplete: (code: string) => Promise<{ success: boolean; error?: string }>
  onResend?: () => Promise<void>
  loading?: boolean
  error?: string
  theme?: AuthUITheme
  resendDelay?: number
}

export interface SessionStatusProps {
  isAuthenticated: boolean
  username?: string
  sessionExpiry?: Date
  onLogout?: () => Promise<void>
  theme?: AuthUITheme
}

export interface AuthComponentState {
  isLoading: boolean
  error: string | null
  success: boolean
}
