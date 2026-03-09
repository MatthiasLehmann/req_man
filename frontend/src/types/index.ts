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

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}
