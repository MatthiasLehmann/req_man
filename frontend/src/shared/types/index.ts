// Domänentypen des Frontends.
//
// Grundlage sind die aus dem Backend generierten Typen (../api/schema.d.ts, `npm run generate:api`).
// Ändert sich ein Pydantic-Modell, ändern sich diese Typen automatisch mit.
//
// `Narrow<…>` engt Felder ein, die das Backend nur als `str` bzw. `Dict` deklariert, deren Werte
// das Frontend aber kennt (z. B. Rollen). Diese Stellen sind Annahmen des Frontends, die das
// Backend nicht garantiert – sie gehören langfristig als Literal-Typen/Modelle ins Backend.
import type { components } from '../api/schema';

type S = components['schemas'];

/** Ersetzt Felder eines generierten Typs durch genauere Typen. */
type Narrow<T, Fields extends { [K in keyof T]?: unknown }> = Omit<T, keyof Fields> & Fields;

// Benutzer
export type UserRole = 'admin' | 'editor' | 'viewer';
export type User = Narrow<S['UserResponse'], { role: UserRole }>;

export type Project = S['ProjectResponse'];
export type Document = S['DocumentResponse'];

/** Eintrag in der doorstop-`references`-Liste eines Items. */
export type Reference = S['ReferenceOut'];

/** Geprüfter Hash-Status einer Referenz; `loading` ist reiner UI-Zustand. */
export type ReferenceStatus = 'ok' | 'changed' | 'missing' | 'no_hash' | 'loading';
export type ReferenceWithStatus = Narrow<S['ReferenceStatusOut'], { status: ReferenceStatus }>;

// Backend: `references: List[Dict[str, Any]]`
export type Item = Narrow<S['ItemResponse'], { references: Reference[] }>;

export type AttributeType = 'string' | 'boolean' | 'integer' | 'enum' | 'text' | 'list';
export type AttributeDefinition = Narrow<S['AttributeDefinition-Output'], { attr_type: AttributeType }>;

export type TraceabilityNode = S['TraceabilityNode'];
export type TraceabilityLink = S['TraceabilityLink'];
export type TraceabilityData = S['TraceabilityData'];

export type DocumentMetrics = S['DocumentMetrics'];
export type ProjectMetrics = S['ProjectMetrics'];

// Validation models
export type ValidationStatus = 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';

export type ValidationStatusInfo = Narrow<S['ValidationStatusResponse'], { status: ValidationStatus | null }>;

export type ChecklistItemData = S['ChecklistItem'];

export type ChecklistKey =
  | 'requirement_complete'
  | 'acceptance_criteria_defined'
  | 'implementation_linked'
  | 'tests_passed'
  | 'peer_review'
  | 'security_audit';

export type ValidationChecklist = Record<ChecklistKey, ChecklistItemData>;

export type ValidationCreateRequest = Narrow<
  S['ValidationCreate'],
  { status: ValidationStatus; checklist: ValidationChecklist }
>;

export type ValidationCreateResponse = Narrow<S['ValidationCreateResponse'], { status: ValidationStatus }>;

/** Validierungsbericht – ohne Response-Modell im Backend (liefert `list[dict]`), daher von Hand gepflegt. */
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
export type PropertyType = 'text' | 'date' | 'select';
export type PropertyDefinition = Narrow<S['PropertyDefinition-Output'], { type: PropertyType }>;

export type DocumentType = Narrow<S['DocumentTypeResponse'], { properties: PropertyDefinition[] }>;

export type DocumentWithType = Narrow<S['DocumentWithType'], { document_type: DocumentType | null }>;

export type ProjectStructure = Narrow<S['ProjectStructureResponse'], { documents: DocumentWithType[] }>;

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

// KI-Qualitätsprüfung
export type AiQualitySeverity = 'low' | 'medium' | 'high' | 'critical';

export type AiQualityIssue = Narrow<S['AiQualityIssue'], { severity: AiQualitySeverity }>;
export type AiQualityScore = S['AiQualityScore'];
export type AiQualityResult = Narrow<S['AiQualityResult'], { issues: AiQualityIssue[] }>;
export type AiQualityRequest = S['AiQualityRequest'];

// Simulink Traceability
export type SimulinkLinkType = 'implements' | 'verifies' | 'refines';

export type SimulinkLink = Narrow<
  S['SimulinkLink'],
  { link_type: SimulinkLinkType; source_type: 'simulink' | 'matlab' }
>;

export type SimulinkSidecar = Narrow<S['SimulinkSidecar'], { links: SimulinkLink[] }>;
export type SimulinkImportResult = S['SimulinkImportResult'];
export type SimulinkCoverage = S['SimulinkCoverage'];
