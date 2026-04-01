export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: 'admin' | 'editor' | 'viewer';
  is_active: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  path: string;
}

export interface Document {
  prefix: string;
  path: string;
  sep: string;
  item_count: number;
  parent: string | null;
  children: string[];
}

/** Eintrag in der doorstop-`references`-Liste eines Items. */
export interface Reference {
  type: string;        // 'file' (einziger von doorstop unterstützter Typ)
  path: string;        // Pfad relativ zum Projektstamm
  keyword: string;     // Suchbegriff / Bezeichner
  sha?: string | null; // SHA256-Hash der Datei (optional)
}

/** Erweitert Reference um den geprüften Hash-Status. */
export type ReferenceStatus = 'ok' | 'changed' | 'missing' | 'no_hash' | 'loading';

export interface ReferenceWithStatus extends Reference {
  status: ReferenceStatus;
  current_sha?: string | null;
}

export interface Item {
  uid: string;
  level: string;
  text: string;
  header: boolean;
  normative: boolean;
  active: boolean;
  derived: boolean;
  links: string[];
  reviewed: string | null;
  reviewed_current: boolean | null;  // null = nie reviewed, true = Fingerprint ok, false = Inhalt geändert
  custom_attributes: Record<string, unknown>;
  references: Reference[];
}

export interface AttributeDefinition {
  key: string;
  display_name: string;
  attr_type: 'string' | 'boolean' | 'integer' | 'enum' | 'text' | 'list';
  default_value: unknown;
  possible_values: string[] | null;
  required: boolean;
  applies_to: string[];
  help_text: string | null;
}

export interface TraceabilityNode {
  uid: string;
  text: string;
  level: string;
  document: string;
  active: boolean;
  normative: boolean;
}

export interface TraceabilityLink {
  source: string;
  target: string;
  valid: boolean;
}

export interface TraceabilityData {
  nodes: TraceabilityNode[];
  links: TraceabilityLink[];
}

export interface DocumentMetrics {
  prefix: string;
  total: number;
  active: number;
  inactive: number;
  normative: number;
  non_normative: number;
  reviewed: number;
  unreviewed: number;
  linked: number;
  unlinked: number;
  headers: number;
}

export interface ProjectMetrics {
  total_items: number;
  total_documents: number;
  documents: DocumentMetrics[];
  link_coverage: number;
  review_coverage: number;
}

// Validation models
export type ValidationStatus = 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';

export interface ValidationStatusInfo {
  status: ValidationStatus | null;
  validation_date: string | null;
  validator_username: string | null;
  validator_display_name: string | null;
  fingerprint_is_current: boolean;
  validation_id: string | null;
}

export interface ChecklistItemData {
  value: boolean;
  note?: string;
  refs?: string[];
  applicable?: boolean;
  coverage_percent?: number;
  test_run_id?: string;
  reviewer_username?: string;
  reviewer_display_name?: string;
  review_date?: string;
}

export interface ValidationChecklist {
  requirement_complete: ChecklistItemData;
  acceptance_criteria_defined: ChecklistItemData;
  implementation_linked: ChecklistItemData;
  tests_passed: ChecklistItemData;
  peer_review: ChecklistItemData;
  security_audit: ChecklistItemData;
}

export interface ValidationCreateRequest {
  status: ValidationStatus;
  checklist: ValidationChecklist;
  summary: string;
  skip_doorstop_check?: boolean;
  /** Opt-out: Review-Stempel NICHT auto-setzen (für DO-178C / ISO 26262 strikte Projekte) */
  skip_review_stamp?: boolean;
}

export interface ValidationCreateResponse {
  validation_id: string;
  commit_hash: string;
  commit_hash_short: string;
  report_path: string;
  status: ValidationStatus;
  /** True wenn doorstop Review-Stempel automatisch gesetzt wurde */
  review_stamped: boolean;
}

export interface ValidationReport {
  schema_version: string;
  requirement_id: string;
  requirement_document: string;
  requirement_text_hash: string;
  validation_id: string;
  validation_date: string;
  validation_time: string;
  validator: { username: string; display_name: string };
  status: ValidationStatus;
  checklist: Record<string, ChecklistItemData>;
  summary: string;
  related_commits: string[];
  supersedes: string | null;
}

// Document Structure models
export interface PropertyDefinition {
  key: string;
  label: string;
  type: 'text' | 'date' | 'select';
  options?: string[];
}

export interface DocumentType {
  id: string;
  name: string;
  color: string;
  default_prefix: string;
  description: string;
  properties: PropertyDefinition[];
}

export interface DocumentWithType extends Document {
  document_type_id: string | null;
  document_type: DocumentType | null;
}

export interface ProjectStructure {
  documents: DocumentWithType[];
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

// KI-Qualitätsprüfung
export type AiQualitySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AiQualityIssue {
  category: string;
  severity: AiQualitySeverity;
  description: string;
  suggestion: string;
}

export interface AiQualityScore {
  overall: number;
  clarity?: number;
  testability?: number;
  completeness?: number;
  consistency?: number;
}

export interface AiQualityResult {
  requirement_uid: string;
  score: AiQualityScore;
  issues: AiQualityIssue[];
  summary: string;
  model_used: string;
  profile_used: string;
  timestamp: string;
}

export interface AiQualityRequest {
  profile?: string;
  model?: string;
}

// Simulink Traceability
export type SimulinkLinkType = 'implements' | 'verifies' | 'refines';

export interface SimulinkLink {
  block_path: string;
  block_type: string;
  model_file: string;
  uid: string;
  link_type: SimulinkLinkType;
  imported_at: string;
  source_type?: 'simulink' | 'matlab';
  file?: string;
  line?: number;
}

export interface SimulinkSidecar {
  requirement_uid: string;
  links: SimulinkLink[];
  last_import: string;
  model: string;
}

export interface SimulinkImportResult {
  imported: number;
  unknown_uids: string[];
  updated_requirements: string[];
  model: string;
  timestamp: string;
}

export interface SimulinkCoverage {
  total_requirements: number;
  covered: number;
  not_covered: number;
  coverage_percent: number;
  not_covered_uids: string[];
  model: string | null;
  last_import: string | null;
}
