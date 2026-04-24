import type { AuthUITheme } from '../types'

export const defaultTheme: AuthUITheme = {
  primaryColor: '#3b82f6',
  backgroundColor: '#ffffff',
  textColor: '#1a1a1a',
  errorColor: '#dc2626',
  successColor: '#10b981',
  borderRadius: '8px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
}

export const darkTheme: AuthUITheme = {
  primaryColor: '#60a5fa',
  backgroundColor: '#1f2937',
  textColor: '#f9fafb',
  errorColor: '#f87171',
  successColor: '#34d399',
  borderRadius: '8px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
}

export const compactTheme: AuthUITheme = {
  primaryColor: '#3b82f6',
  backgroundColor: '#ffffff',
  textColor: '#1a1a1a',
  errorColor: '#dc2626',
  successColor: '#10b981',
  borderRadius: '4px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
}

export function mergeTheme(customTheme?: Partial<AuthUITheme>): AuthUITheme {
  return { ...defaultTheme, ...customTheme }
}
