import type { LoginFormProps, AuthComponentState } from '../types'

export class LoginForm {
  private container: HTMLElement
  private props: LoginFormProps
  private state: AuthComponentState = {
    isLoading: false,
    error: null,
    success: false
  }

  constructor(container: HTMLElement, props: LoginFormProps) {
    this.container = container
    this.props = props
    this.render()
  }

  private getStyles(): string {
    const theme = this.props.theme || {}
    return `
      .auth-login-form {
        font-family: ${theme.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'};
        max-width: 400px;
        padding: 2rem;
        background: ${theme.backgroundColor || '#ffffff'};
        border-radius: ${theme.borderRadius || '8px'};
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .auth-form-title {
        margin: 0 0 1.5rem;
        color: ${theme.textColor || '#1a1a1a'};
        font-size: 1.5rem;
        font-weight: 600;
      }
      .auth-form-group {
        margin-bottom: 1rem;
      }
      .auth-form-label {
        display: block;
        margin-bottom: 0.5rem;
        color: ${theme.textColor || '#1a1a1a'};
        font-size: 0.875rem;
        font-weight: 500;
      }
      .auth-form-input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: ${theme.borderRadius || '4px'};
        font-size: 1rem;
        transition: border-color 0.2s;
        box-sizing: border-box;
      }
      .auth-form-input:focus {
        outline: none;
        border-color: ${theme.primaryColor || '#3b82f6'};
      }
      .auth-form-input:disabled {
        background-color: #f3f4f6;
        cursor: not-allowed;
      }
      .auth-form-checkbox-group {
        display: flex;
        align-items: center;
        margin-bottom: 1rem;
      }
      .auth-form-checkbox {
        margin-right: 0.5rem;
      }
      .auth-form-checkbox-label {
        color: ${theme.textColor || '#1a1a1a'};
        font-size: 0.875rem;
      }
      .auth-form-error {
        padding: 0.75rem;
        margin-bottom: 1rem;
        background-color: ${theme.errorColor || '#fee'};
        color: ${theme.errorColor || '#dc2626'};
        border-radius: ${theme.borderRadius || '4px'};
        font-size: 0.875rem;
      }
      .auth-form-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 1.5rem;
      }
      .auth-form-button {
        flex: 1;
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: ${theme.borderRadius || '4px'};
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        transition: opacity 0.2s;
      }
      .auth-form-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .auth-form-button-primary {
        background: ${theme.primaryColor || '#3b82f6'};
        color: white;
      }
      .auth-form-button-primary:hover:not(:disabled) {
        opacity: 0.9;
      }
      .auth-form-button-secondary {
        background: transparent;
        color: ${theme.textColor || '#1a1a1a'};
        border: 1px solid #d1d5db;
      }
      .auth-form-button-secondary:hover:not(:disabled) {
        background: #f3f4f6;
      }
      .auth-form-link {
        display: block;
        margin-top: 1rem;
        color: ${theme.primaryColor || '#3b82f6'};
        font-size: 0.875rem;
        text-decoration: none;
        text-align: center;
      }
      .auth-form-link:hover {
        text-decoration: underline;
      }
      .auth-form-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: auth-spin 0.6s linear infinite;
        margin-right: 0.5rem;
      }
      @keyframes auth-spin {
        to { transform: rotate(360deg); }
      }
    `
  }

  private render(): void {
    const disabled = this.state.isLoading || this.props.loading
    const error = this.state.error || this.props.error

    this.container.innerHTML = `
      <style>${this.getStyles()}</style>
      <div class="auth-login-form">
        <h2 class="auth-form-title">Sign In</h2>

        ${error ? `<div class="auth-form-error">${this.escapeHtml(error)}</div>` : ''}

        <form id="auth-login-form-element">
          <div class="auth-form-group">
            <label class="auth-form-label" for="auth-username">Username or Email</label>
            <input
              type="text"
              id="auth-username"
              class="auth-form-input"
              value="${this.escapeHtml(this.props.credentials?.username || '')}"
              ${disabled ? 'disabled' : ''}
              required
              autocomplete="username"
            />
          </div>

          <div class="auth-form-group">
            <label class="auth-form-label" for="auth-password">Password</label>
            <input
              type="password"
              id="auth-password"
              class="auth-form-input"
              value="${this.escapeHtml(this.props.credentials?.password || '')}"
              ${disabled ? 'disabled' : ''}
              required
              autocomplete="current-password"
            />
          </div>

          <div class="auth-form-group">
            <label class="auth-form-label" for="auth-login-url">Login URL (optional)</label>
            <input
              type="url"
              id="auth-login-url"
              class="auth-form-input"
              value="${this.escapeHtml(this.props.credentials?.loginUrl || '')}"
              ${disabled ? 'disabled' : ''}
              placeholder="https://example.com/login"
              autocomplete="url"
            />
          </div>

          ${this.props.showRememberMe !== false ? `
            <div class="auth-form-checkbox-group">
              <input
                type="checkbox"
                id="auth-remember"
                class="auth-form-checkbox"
                ${disabled ? 'disabled' : ''}
              />
              <label class="auth-form-checkbox-label" for="auth-remember">Remember me</label>
            </div>
          ` : ''}

          <div class="auth-form-actions">
            ${this.props.onCancel ? `
              <button
                type="button"
                class="auth-form-button auth-form-button-secondary"
                id="auth-cancel-button"
                ${disabled ? 'disabled' : ''}
              >
                Cancel
              </button>
            ` : ''}
            <button
              type="submit"
              class="auth-form-button auth-form-button-primary"
              ${disabled ? 'disabled' : ''}
            >
              ${disabled ? '<span class="auth-form-spinner"></span>' : ''}
              Sign In
            </button>
          </div>

          ${this.props.showForgotPassword !== false && this.props.forgotPasswordUrl ? `
            <a href="${this.escapeHtml(this.props.forgotPasswordUrl)}" class="auth-form-link">
              Forgot password?
            </a>
          ` : ''}
        </form>
      </div>
    `

    this.attachEventListeners()
  }

  private attachEventListeners(): void {
    const form = this.container.querySelector('#auth-login-form-element') as HTMLFormElement
    if (form) {
      form.addEventListener('submit', this.handleSubmit.bind(this))
    }

    if (this.props.onCancel) {
      const cancelBtn = this.container.querySelector('#auth-cancel-button')
      if (cancelBtn) {
        cancelBtn.addEventListener('click', this.props.onCancel)
      }
    }
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault()

    const usernameInput = this.container.querySelector('#auth-username') as HTMLInputElement
    const passwordInput = this.container.querySelector('#auth-password') as HTMLInputElement
    const loginUrlInput = this.container.querySelector('#auth-login-url') as HTMLInputElement

    const credentials = {
      username: usernameInput.value,
      password: passwordInput.value,
      loginUrl: loginUrlInput.value || undefined
    }

    this.setState({ isLoading: true, error: null, success: false })

    try {
      const result = await this.props.onSubmit(credentials)

      if (result.success) {
        this.setState({ isLoading: false, error: null, success: true })
      } else {
        this.setState({ isLoading: false, error: result.error || 'Login failed', success: false })
      }
    } catch (err) {
      this.setState({
        isLoading: false,
        error: err instanceof Error ? err.message : 'An unexpected error occurred',
        success: false
      })
    }
  }

  private setState(newState: Partial<AuthComponentState>): void {
    this.state = { ...this.state, ...newState }
    this.render()
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  public updateProps(newProps: Partial<LoginFormProps>): void {
    this.props = { ...this.props, ...newProps }
    this.render()
  }

  public destroy(): void {
    this.container.innerHTML = ''
  }
}
