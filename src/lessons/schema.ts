/**
 * T-000 Active Lessons Engine — schema types.
 *
 * A Lesson is a structured artefact: detection (static scan) + prevention
 * (auto-fix/lint) + diagnosis (post-failure lookup) + regression_test.
 * Day-1 scope: schema + loader + scanner. Diagnosis/regression-test runner
 * land in subsequent days.
 */

export type LessonSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'
export type LessonStatus = 'active' | 'muted' | 'deprecated'
export type LessonContext = 'cc-session' | 'twg' | 'pipeline'

export type DetectionType =
  | 'regex_in_test_file'
  | 'regex_in_source_file'
  | 'ast_pattern'

export interface DetectionRule {
  type: DetectionType
  pattern: string
  message: string
  flag_required?: string
  file_glob?: string
  /** Optional AST-based post-filter; id maps to a checker in ast-linter.ts. */
  ast_check?: string
}

export interface AutoFix {
  action: string
  value?: string
  confirm_required?: boolean
}

export interface Prevention {
  lint_rule?: string
  auto_fix?: AutoFix
  block_commit_if_unfixed?: boolean
}

export interface SymptomSignature {
  test_failed_assertion?: string
  dom_contains?: string
  error_message?: string
  console_error?: string
}

export interface Diagnosis {
  symptom_signatures: SymptomSignature[]
  suggested_remediation: string
}

export interface Lesson {
  id: string
  slug: string
  title: string
  first_observed: string
  projects_hit: string[]
  contexts_hit: LessonContext[]
  hit_count: number
  severity: LessonSeverity
  tags: string[]
  detection: DetectionRule[]
  prevention?: Prevention
  diagnosis?: Diagnosis
  regression_test?: string
  status: LessonStatus
}

export interface ScanMatch {
  lesson_id: string
  lesson_title: string
  file: string
  line: number
  column: number
  matched_text: string
  detection_message: string
  severity: LessonSeverity
  auto_fixable: boolean
}

export interface LoaderError {
  file: string
  message: string
}

export interface LoaderResult {
  lessons: Lesson[]
  errors: LoaderError[]
}
