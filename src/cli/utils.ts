/**
 * CLI Utilities — spinner, logging, formatting
 */

const SPINNER_FRAMES = ['|', '/', '-', '\\']
let spinnerInterval: ReturnType<typeof setInterval> | null = null
let spinnerFrame = 0

export function startSpinner(message: string): void {
  stopSpinner()
  process.stdout.write(`  ${SPINNER_FRAMES[0]} ${message}`)
  spinnerInterval = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length
    process.stdout.write(`\r  ${SPINNER_FRAMES[spinnerFrame]} ${message}`)
  }, 100)
}

export function stopSpinner(finalMessage?: string): void {
  if (spinnerInterval) {
    clearInterval(spinnerInterval)
    spinnerInterval = null
    process.stdout.write('\r' + ' '.repeat(80) + '\r')
    if (finalMessage) {
      console.log(`  ${finalMessage}`)
    }
  }
}

export function writeLine(message: string = ''): void {
  process.stdout.write(`${message}\n`)
}

export function log(message: string): void {
  console.log(`[tester] ${message}`)
}

export function logSuccess(message: string): void {
  console.log(`[tester] OK ${message}`)
}

export function logWarn(message: string): void {
  console.log(`[tester] WARN ${message}`)
}

export function logError(message: string): void {
  console.error(`[tester] ERROR ${message}`)
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}
