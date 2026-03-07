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

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}
