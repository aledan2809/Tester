import type { SessionStatusProps } from '../types'

export class SessionStatus {
  private container: HTMLElement
  private props: SessionStatusProps
  private updateTimer: NodeJS.Timeout | null = null

  constructor(container: HTMLElement, props: SessionStatusProps) {
    this.container = container
    this.props = props
    this.render()
    this.startUpdateTimer()
  }

  private getStyles(): string {
    const theme = this.props.theme || {}
    return `
      .auth-session-container {
        font-family: ${theme.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'};
        padding: 1rem;
        background: ${theme.backgroundColor || '#ffffff'};
        border-radius: ${theme.borderRadius || '8px'};
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      .auth-session-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.75rem;
      }
      .auth-session-user {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .auth-session-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: ${theme.primaryColor || '#3b82f6'};
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 1rem;
      }
      .auth-session-info {
        display: flex;
        flex-direction: column;
      }
      .auth-session-username {
        color: ${theme.textColor || '#1a1a1a'};
        font-weight: 500;
        font-size: 0.875rem;
      }
      .auth-session-status {
        color: ${theme.textColor || '#666'};
        font-size: 0.75rem;
      }
      .auth-session-status-indicator {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 0.5rem;
      }
      .auth-session-status-indicator.active {
        background: ${theme.successColor || '#10b981'};
      }
      .auth-session-status-indicator.expiring {
        background: #f59e0b;
      }
      .auth-session-status-indicator.expired {
        background: ${theme.errorColor || '#ef4444'};
      }
      .auth-session-logout {
        padding: 0.5rem 1rem;
        border: 1px solid #d1d5db;
        border-radius: ${theme.borderRadius || '4px'};
        background: transparent;
        color: ${theme.textColor || '#1a1a1a'};
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
      }
      .auth-session-logout:hover {
        background: #f3f4f6;
      }
      .auth-session-logout:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .auth-session-expiry {
        padding: 0.5rem;
        background: #fef3c7;
        border-radius: ${theme.borderRadius || '4px'};
        font-size: 0.75rem;
        color: #92400e;
        text-align: center;
      }
      .auth-session-expiry.critical {
        background: #fee;
        color: ${theme.errorColor || '#991b1b'};
      }
      .auth-session-unauthenticated {
        padding: 1rem;
        text-align: center;
        color: ${theme.textColor || '#666'};
        font-size: 0.875rem;
      }
    `
  }

  private render(): void {
    if (!this.props.isAuthenticated) {
      this.container.innerHTML = `
        <style>${this.getStyles()}</style>
        <div class="auth-session-container">
          <div class="auth-session-unauthenticated">
            Not authenticated
          </div>
        </div>
      `
      return
    }

    const username = this.props.username || 'User'
    const initials = this.getInitials(username)
    const expiryStatus = this.getExpiryStatus()

    this.container.innerHTML = `
      <style>${this.getStyles()}</style>
      <div class="auth-session-container">
        <div class="auth-session-header">
          <div class="auth-session-user">
            <div class="auth-session-avatar">${this.escapeHtml(initials)}</div>
            <div class="auth-session-info">
              <span class="auth-session-username">${this.escapeHtml(username)}</span>
              <span class="auth-session-status">
                <span class="auth-session-status-indicator ${expiryStatus.className}"></span>
                ${this.escapeHtml(expiryStatus.text)}
              </span>
            </div>
          </div>
          ${this.props.onLogout ? `
            <button class="auth-session-logout" id="auth-session-logout">
              Sign Out
            </button>
          ` : ''}
        </div>
        ${expiryStatus.showWarning ? `
          <div class="auth-session-expiry ${expiryStatus.critical ? 'critical' : ''}">
            ${this.escapeHtml(expiryStatus.warningText || '')}
          </div>
        ` : ''}
      </div>
    `

    this.attachEventListeners()
  }

  private attachEventListeners(): void {
    if (this.props.onLogout) {
      const logoutBtn = this.container.querySelector('#auth-session-logout')
      if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
          logoutBtn.setAttribute('disabled', 'true')
          try {
            await this.props.onLogout!()
          } finally {
            logoutBtn.removeAttribute('disabled')
          }
        })
      }
    }
  }

  private getInitials(name: string): string {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

  private getExpiryStatus(): {
    className: string
    text: string
    showWarning: boolean
    warningText?: string
    critical?: boolean
  } {
    if (!this.props.sessionExpiry) {
      return { className: 'active', text: 'Active', showWarning: false }
    }

    const now = new Date()
    const expiry = new Date(this.props.sessionExpiry)
    const msUntilExpiry = expiry.getTime() - now.getTime()
    const minutesUntilExpiry = Math.floor(msUntilExpiry / 60000)

    if (msUntilExpiry <= 0) {
      return {
        className: 'expired',
        text: 'Session expired',
        showWarning: true,
        warningText: 'Your session has expired. Please sign in again.',
        critical: true
      }
    }

    if (minutesUntilExpiry <= 5) {
      return {
        className: 'expiring',
        text: `Expires in ${minutesUntilExpiry}m`,
        showWarning: true,
        warningText: `Your session will expire in ${minutesUntilExpiry} minute${minutesUntilExpiry !== 1 ? 's' : ''}`,
        critical: true
      }
    }

    if (minutesUntilExpiry <= 15) {
      return {
        className: 'expiring',
        text: `Expires in ${minutesUntilExpiry}m`,
        showWarning: true,
        warningText: `Your session will expire in ${minutesUntilExpiry} minutes`
      }
    }

    const hoursUntilExpiry = Math.floor(minutesUntilExpiry / 60)
    if (hoursUntilExpiry < 24) {
      return {
        className: 'active',
        text: `Active (expires in ${hoursUntilExpiry}h)`,
        showWarning: false
      }
    }

    return { className: 'active', text: 'Active', showWarning: false }
  }

  private startUpdateTimer(): void {
    this.updateTimer = setInterval(() => {
      if (this.props.sessionExpiry) {
        this.render()
      }
    }, 30000)
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  public updateProps(newProps: Partial<SessionStatusProps>): void {
    this.props = { ...this.props, ...newProps }
    this.render()
  }

  public destroy(): void {
    if (this.updateTimer) clearInterval(this.updateTimer)
    this.container.innerHTML = ''
  }
}
