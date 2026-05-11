/**
 * Audit-Suite Module C — Scenario assertions.
 *
 * Provides assertStatus / assertJson / assertHeader helpers for HTTP responses.
 * Throws AssertionError (Error subclass) on mismatch with a descriptive message.
 */

export class AssertionError extends Error {
  readonly actual: unknown
  readonly expected: unknown

  constructor(msg: string, actual: unknown, expected: unknown) {
    super(msg)
    this.name = 'AssertionError'
    this.actual = actual
    this.expected = expected
  }
}

export class ScenarioAssertions {
  /** Assert HTTP status code. */
  status(res: Response, expected: number): void {
    if (res.status !== expected) {
      throw new AssertionError(
        `Expected HTTP ${expected}, got ${res.status} (${res.url})`,
        res.status,
        expected,
      )
    }
  }

  /**
   * Assert a dot-path field in the parsed JSON body equals expected value.
   * Clones the response so the body stream remains available for further reads.
   */
  async json(res: Response, key: string, expected: unknown): Promise<void> {
    const data = (await res.clone().json()) as Record<string, unknown>
    const actual = key.split('.').reduce<unknown>((obj, k) => {
      if (obj != null && typeof obj === 'object') return (obj as Record<string, unknown>)[k]
      return undefined
    }, data)
    if (actual !== expected) {
      throw new AssertionError(
        `Expected json.${key} = ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        actual,
        expected,
      )
    }
  }

  /**
   * Assert a response header is present and its value includes the expected string.
   * Case-insensitive header name lookup (Headers API handles this automatically).
   */
  header(res: Response, name: string, expected: string): void {
    const actual = res.headers.get(name)
    if (actual === null) {
      throw new AssertionError(`Expected header "${name}" to be present`, null, expected)
    }
    if (!actual.includes(expected)) {
      throw new AssertionError(
        `Expected header "${name}" to include "${expected}", got "${actual}"`,
        actual,
        expected,
      )
    }
  }
}
