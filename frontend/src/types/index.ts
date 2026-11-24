export type SchemeType = 'REGULAR' | 'QRMP' | 'COMPOSITION';
export type LanguageType = 'en' | 'hi';
export type DocType = 'SALES' | 'PURCHASE' | 'REGISTER_PAGE';
export type SeverityType = 'BLOCKING' | 'WARNING' | 'INFO';

export interface User {
  id: number;
  email: string;
  business_name?: string | null;
  gstin?: string | null;
  state_code?: string | null;
  scheme: SchemeType;
  language: LanguageType;
  created_at?: string;
}

export interface UserUpdate {
  business_name?: string;
  gstin?: string;
  state_code?: string;
  scheme?: SchemeType;
  language?: LanguageType;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Document {
  id: number;
  user_id: number;
  file_path: string;
  mime: string;
  sha256: string;
  doc_type: DocType;
  created_at: string;
}

export interface ExtractedEntryOut {
  id: number;
  document_id: number;
  line_no: number;
  invoice_no?: string | null;
  invoice_date?: string | null;
  party_name?: string | null;
  party_gstin?: string | null;
  hsn_or_category?: string | null;
  description?: string | null;
  taxable_value?: number | null;
  tax_rate?: number | null;
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
  total?: number | null;
  field_confidence?: Record<string, number | null> | null;
  extraction_provider: string;
  extraction_model_version: string;
  created_at: string;
}

export interface ExtractDocumentResponse {
  status: 'OK' | 'PARTIAL' | 'FAILED';
  entries: ExtractedEntryOut[];
  page_notes?: string | null;
}

export interface EntryReviewed {
  id: number;
  user_id: number;
  extracted_entry_id?: number | null;
  source: 'MANUAL' | 'EXTRACTED_EDITED';
  entry_type: 'SALES' | 'PURCHASE';
  invoice_no?: string | null;
  invoice_date?: string | null;
  party_name?: string | null;
  party_gstin?: string | null;
  hsn_or_category?: string | null;
  description?: string | null;
  taxable_value?: number | null;
  tax_rate?: number | null;
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
  total?: number | null;
  is_demo?: boolean;
  field_confidence?: Record<string, number | null> | null;
  reviewed_at: string;
}

export interface EntryCreate {
  entry_type?: 'SALES' | 'PURCHASE';
  invoice_no?: string | null;
  invoice_date?: string | null;
  party_name?: string | null;
  party_gstin?: string | null;
  hsn_or_category?: string | null;
  description?: string | null;
  taxable_value?: number | null;
  tax_rate?: number | null;
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
  total?: number | null;
  extracted_entry_id?: number | null;
  source?: 'MANUAL' | 'EXTRACTED_EDITED';
}

export interface EntryUpdate {
  entry_type?: 'SALES' | 'PURCHASE';
  invoice_no?: string | null;
  invoice_date?: string | null;
  party_name?: string | null;
  party_gstin?: string | null;
  hsn_or_category?: string | null;
  description?: string | null;
  taxable_value?: number | null;
  tax_rate?: number | null;
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
  total?: number | null;
}

export interface ValidationCountsOut {
  blocking: number;
  warning: number;
  info: number;
}

export interface ValidationFinding {
  id?: number | null;
  rule_id: string;
  severity: SeverityType;
  message_key: string;
  message_params?: Record<string, any> | null;
  message: string;
  rule_version?: string;
}

export interface EntryValidationGroup {
  entry_id: number;
  invoice_no?: string | null;
  invoice_date?: string | null;
  party_name?: string | null;
  total?: number | null;
  has_blocking: boolean;
  results: ValidationFinding[];
}

export interface ValidationResponse {
  period?: string | null;
  total_entries: number;
  blocking_count: number;
  warning_count: number;
  info_count: number;
  counts?: ValidationCountsOut;
  has_blocking_errors: boolean;
  entries: EntryValidationGroup[];
}

export interface ValidationSummaryOut {
  period?: string | null;
  total_entries: number;
  valid_entries: number;
  blocking_count: number;
  warning_count: number;
  info_count: number;
  counts?: ValidationCountsOut;
  has_blocking_errors: boolean;
  rate_table_version?: string;
  rates_verified?: boolean;
}

export interface TopIssueOut {
  rule_id: string;
  count: number;
  message_key: string;
  first_entry_id?: number | null;
}

export interface RecentDocumentOut {
  id: number;
  doc_type: string;
  uploaded_at: string;
  status: string;
}

export interface NextActionOut {
  key: 'scan_first_bill' | 'review_entries' | 'fix_blocking_errors' | 'export_return' | string;
  params: Record<string, any>;
}

export interface DeadlineOut {
  return_type: string;
  due_date: string;
  verified: boolean;
  source_ref: string;
}

export interface RateTableStatusOut {
  version: string;
  has_unverified: boolean;
}

export interface DashboardTotalsOut {
  sales: number;
  tax_collected: number;
  purchases_itc: number;
  excluded_entries: number;
}

export interface DashboardResponse {
  period: string;
  scheme: string;
  readiness_pct: number;
  entries_total: number;
  entries_reviewed: number;
  errors: ValidationCountsOut;
  totals: DashboardTotalsOut;
  top_issues: TopIssueOut[];
  recent_documents: RecentDocumentOut[];
  next_action: NextActionOut;
  deadlines: DeadlineOut[];
  rate_table: RateTableStatusOut;
}
