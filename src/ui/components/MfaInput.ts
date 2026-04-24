import type { MfaInputProps, AuthComponentState } from '../types'

export class MfaInput {
  private container: HTMLElement
  private props: MfaInputProps
  private state: AuthComponentState & { code: string; canResend: boolean; countdown: number } = {
    isLoading: false,
    error: null,
    success: false,
    code: '',
    canResend: false,
    countdown: 0
  }
  private resendTimer: NodeJS.Timeout | null = null

  constructor(container: HTMLElement, props: MfaInputProps) {
    this.container = container
    this.props = { length: 6, resendDelay: 60, ...props }
    this.render()
  }

  private getStyles(): string {
    const theme = this.props.theme || {}
    return `
      .auth-mfa-container {
        font-family: ${theme.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'};
        max-width: 400px;
        padding: 2rem;
        background: ${theme.backgroundColor || '#ffffff'};
        border-radius: ${theme.borderRadius || '8px'};
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .auth-mfa-title {
        margin: 0 0 0.5rem;
        color: ${theme.textColor || '#1a1a1a'};
        font-size: 1.5rem;
        font-weight: 600;
      }
      .auth-mfa-description {
        margin: 0 0 1.5rem;
        color: ${theme.textColor || '#666'};
        font-size: 0.875rem;
      }
      .auth-mfa-error {
        padding: 0.75rem;
        margin-bottom: 1rem;
        background-color: ${theme.errorColor || '#fee'};
        color: ${theme.errorColor || '#dc2626'};
        border-radius: ${theme.borderRadius || '4px'};
        font-size: 0.875rem;
      }
      .auth-mfa-success {
        padding: 0.75rem;
        margin-bottom: 1rem;
        background-color: ${theme.successColor || '#d1fae5'};
        color: ${theme.successColor || '#059669'};
        border-radius: ${theme.borderRadius || '4px'};
        font-size: 0.875rem;
      }
      .auth-mfa-input-group {
        display: flex;
        gap: 0.5rem;
        justify-content: center;
        margin-bottom: 1.5rem;
      }
      .auth-mfa-digit {
        width: 3rem;
        height: 3.5rem;
        text-align: center;
        font-size: 1.5rem;
        font-weight: 600;
        border: 2px solid #d1d5db;
        border-radius: ${theme.borderRadius || '4px'};
        transition: border-color 0.2s;
      }
      .auth-mfa-digit:focus {
        outline: none;
        border-color: ${theme.primaryColor || '#3b82f6'};
      }
      .auth-mfa-digit:disabled {
        background-color: #f3f4f6;
        cursor: not-allowed;
      }
      .auth-mfa-actions {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .auth-mfa-button {
        width: 100%;
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: ${theme.borderRadius || '4px'};
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        transition: opacity 0.2s;
        background: ${theme.primaryColor || '#3b82f6'};
        color: white;
      }
      .auth-mfa-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .auth-mfa-button:hover:not(:disabled) {
        opacity: 0.9;
      }
      .auth-mfa-resend {
        background: transparent;
        color: ${theme.primaryColor || '#3b82f6'};
        border: 1px solid ${theme.primaryColor || '#3b82f6'};
      }
      .auth-mfa-resend:hover:not(:disabled) {
        background: ${theme.primaryColor || '#3b82f6'}10;
      }
      .auth-mfa-spinner {
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
    const length = this.props.length || 6

    this.container.innerHTML = `
      <style>${this.getStyles()}</style>
      <div class="auth-mfa-container">
        <h2 class="auth-mfa-title">Two-Factor Authentication</h2>
        <p class="auth-mfa-description">
          Enter the ${length}-digit code from your authenticator app
        </p>

        ${error ? `<div class="auth-mfa-error">${this.escapeHtml(error)}</div>` : ''}
        ${this.state.success ? '<div class="auth-mfa-success">Code verified successfully</div>' : ''}

        <div class="auth-mfa-input-group">
          ${Array.from({ length }, (_, i) => `
            <input
              type="text"
              maxlength="1"
              class="auth-mfa-digit"
              data-index="${i}"
              ${disabled ? 'disabled' : ''}
              autocomplete="off"
              inputmode="numeric"
              pattern="[0-9]"
            />
          `).join('')}
        </div>

        <div class="auth-mfa-actions">
          <button
            type="button"
            class="auth-mfa-button"
            id="auth-mfa-verify"
            ${disabled || this.state.code.length !== length ? 'disabled' : ''}
          >
            ${disabled ? '<span class="auth-mfa-spinner"></span>' : ''}
            Verify Code
          </button>

          ${this.props.onResend ? `
            <button
              type="button"
              class="auth-mfa-button auth-mfa-resend"
              id="auth-mfa-resend"
              ${!this.state.canResend || disabled ? 'disabled' : ''}
            >
              ${this.state.canResend ? 'Resend Code' : `Resend in ${this.state.countdown}s`}
            </button>
          ` : ''}
        </div>
      </div>
    `

    this.attachEventListeners()
  }

  private attachEventListeners(): void {
    const inputs = this.container.querySelectorAll('.auth-mfa-digit') as NodeListOf<HTMLInputElement>

    inputs.forEach((input, index) => {
      input.addEventListener('input', (e) => this.handleInput(e, index, inputs))
      input.addEventListener('keydown', (e) => this.handleKeyDown(e, index, inputs))
      input.addEventListener('paste', (e) => this.handlePaste(e, inputs))
    })

    const verifyBtn = this.container.querySelector('#auth-mfa-verify')
    if (verifyBtn) {
      verifyBtn.addEventListener('click', this.handleVerify.bind(this))
    }

    if (this.props.onResend) {
      const resendBtn = this.container.querySelector('#auth-mfa-resend')
      if (resendBtn) {
        resendBtn.addEventListener('click', this.handleResend.bind(this))
      }
      this.startResendTimer()
    }

    inputs[0]?.focus()
  }

  private handleInput(e: Event, index: number, inputs: NodeListOf<HTMLInputElement>): void {
    const input = e.target as HTMLInputElement
    const value = input.value.replace(/[^0-9]/g, '')

    input.value = value

    if (value && index < inputs.length - 1) {
      inputs[index + 1].focus()
    }

    this.updateCode(inputs)
  }

  private handleKeyDown(e: KeyboardEvent, index: number, inputs: NodeListOf<HTMLInputElement>): void {
    const input = e.target as HTMLInputElement

    if (e.key === 'Backspace' && !input.value && index > 0) {
      inputs[index - 1].focus()
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputs[index - 1].focus()
    } else if (e.key === 'ArrowRight' && index < inputs.length - 1) {
      inputs[index + 1].focus()
    }
  }

  private handlePaste(e: ClipboardEvent, inputs: NodeListOf<HTMLInputElement>): void {
    e.preventDefault()
    const pasteData = e.clipboardData?.getData('text').replace(/[^0-9]/g, '') || ''

    pasteData.split('').forEach((char, index) => {
      if (index < inputs.length) {
        inputs[index].value = char
      }
    })

    const nextEmptyIndex = Math.min(pasteData.length, inputs.length - 1)
    inputs[nextEmptyIndex].focus()

    this.updateCode(inputs)
  }

  private updateCode(inputs: NodeListOf<HTMLInputElement>): void {
    const code = Array.from(inputs).map(input => input.value).join('')
    this.state.code = code

    if (code.length === this.props.length) {
      this.handleVerify()
    } else {
      this.render()
    }
  }

  private async handleVerify(): Promise<void> {
    if (this.state.code.length !== this.props.length) return

    this.setState({ isLoading: true, error: null, success: false })

    try {
      const result = await this.props.onComplete(this.state.code)

      if (result.success) {
        this.setState({ isLoading: false, error: null, success: true })
      } else {
        this.setState({ isLoading: false, error: result.error || 'Invalid code', success: false })
        this.clearInputs()
      }
    } catch (err) {
      this.setState({
        isLoading: false,
        error: err instanceof Error ? err.message : 'An unexpected error occurred',
        success: false
      })
      this.clearInputs()
    }
  }

  private async handleResend(): Promise<void> {
    if (!this.props.onResend || !this.state.canResend) return

    this.setState({ isLoading: true, error: null, success: false })

    try {
      await this.props.onResend()
      this.setState({ isLoading: false, canResend: false })
      this.startResendTimer()
    } catch (err) {
      this.setState({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to resend code'
      })
    }
  }

  private startResendTimer(): void {
    this.state.countdown = this.props.resendDelay || 60
    this.state.canResend = false

    this.resendTimer = setInterval(() => {
      this.state.countdown--

      if (this.state.countdown <= 0) {
        this.state.canResend = true
        if (this.resendTimer) clearInterval(this.resendTimer)
      }

      this.render()
    }, 1000)
  }

  private clearInputs(): void {
    const inputs = this.container.querySelectorAll('.auth-mfa-digit') as NodeListOf<HTMLInputElement>
    inputs.forEach(input => input.value = '')
    inputs[0]?.focus()
    this.state.code = ''
  }

  private setState(newState: Partial<typeof this.state>): void {
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

  public updateProps(newProps: Partial<MfaInputProps>): void {
    this.props = { ...this.props, ...newProps }
    this.render()
  }

  public destroy(): void {
    if (this.resendTimer) clearInterval(this.resendTimer)
    this.container.innerHTML = ''
  }
}
