export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export type RoleEnum = "PRODUCT_TEAM" | "VP" | "CTO" | "CEO";

export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  role: RoleEnum;
  organization_id: string;
  created_at: string;
  updated_at: string;
}

export type ProjectStatusEnum = "DRAFT" | "ACTIVE" | "SUBMITTED" | "AWARDED" | "LOST" | "ARCHIVED";

export interface RFPProjectCreate {
  name: string;
  reference_number: string;
  description?: string | null;
  customer_name?: string | null;
  customer_contact?: string | null;
  submission_deadline?: string | null;
}

export interface RFPProjectUpdate {
  name?: string | null;
  reference_number?: string | null;
  description?: string | null;
  customer_name?: string | null;
  customer_contact?: string | null;
  submission_deadline?: string | null;
  status?: ProjectStatusEnum | null;
}

export interface RFPProjectResponse {
  id: string;
  organization_id: string;
  created_by_id: string;
  name: string;
  reference_number: string;
  description?: string | null;
  customer_name?: string | null;
  customer_contact?: string | null;
  status: ProjectStatusEnum;
  submission_deadline?: string | null;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
}

export interface RFPProjectListResponse {
  items: RFPProjectResponse[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail || `HTTP Error ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

const TOKEN_KEY = "ai_rfp_auth_token";
let inMemoryToken: string | null = null;

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
}

export function getToken(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem(TOKEN_KEY) || inMemoryToken;
  }
  return inMemoryToken;
}

export function setToken(token: string): void {
  inMemoryToken = token;
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

export function removeToken(): void {
  inMemoryToken = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;

  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  let response: Response;
  try {
    response = await fetch(url, config);
  } catch (err: any) {
    throw new ApiError(0, `Backend service unavailable (${err?.message || "Network Error"})`);
  }

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errorJson = await response.json();
      if (errorJson?.detail) {
        errorDetail = typeof errorJson.detail === "string" 
          ? errorJson.detail 
          : JSON.stringify(errorJson.detail);
      }
    } catch {
      // Failed to parse JSON error
    }

    if (response.status === 401) {
      removeToken();
    }

    throw new ApiError(response.status, errorDetail);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

export async function loginApi(username: string, password: string): Promise<TokenResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl.replace(/\/$/, "")}/auth/login`;

  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });
  } catch (err: any) {
    throw new ApiError(0, `Backend service unavailable (${err?.message || "Network Error"})`);
  }

  if (!response.ok) {
    let errorDetail = "Incorrect email or password";
    try {
      const errorJson = await response.json();
      if (errorJson?.detail) {
        errorDetail = typeof errorJson.detail === "string" 
          ? errorJson.detail 
          : JSON.stringify(errorJson.detail);
      }
    } catch {
      // use default error detail
    }
    throw new ApiError(response.status, errorDetail);
  }

  const tokenData: TokenResponse = await response.json();
  if (tokenData.access_token) {
    setToken(tokenData.access_token);
  }
  return tokenData;
}

export async function getCurrentUserApi(): Promise<UserResponse> {
  return apiFetch<UserResponse>("/auth/me");
}

/* ============================================================================
   RFP Project APIs (Phase 3)
   ============================================================================ */

export async function listRFPProjectsApi(
  page: number = 1,
  pageSize: number = 20,
  statusFilter?: ProjectStatusEnum
): Promise<RFPProjectListResponse> {
  let url = `/api/v1/rfp-projects?page=${page}&page_size=${pageSize}`;
  if (statusFilter) {
    url += `&status=${encodeURIComponent(statusFilter)}`;
  }
  return apiFetch<RFPProjectListResponse>(url);
}

export async function createRFPProjectApi(data: RFPProjectCreate): Promise<RFPProjectResponse> {
  return apiFetch<RFPProjectResponse>("/api/v1/rfp-projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getRFPProjectApi(projectId: string): Promise<RFPProjectResponse> {
  return apiFetch<RFPProjectResponse>(`/api/v1/rfp-projects/${projectId}`);
}

export async function updateRFPProjectApi(
  projectId: string,
  data: RFPProjectUpdate
): Promise<RFPProjectResponse> {
  return apiFetch<RFPProjectResponse>(`/api/v1/rfp-projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function archiveRFPProjectApi(projectId: string): Promise<RFPProjectResponse> {
  return apiFetch<RFPProjectResponse>(`/api/v1/rfp-projects/${projectId}/archive`, {
    method: "POST",
  });
}

/* ============================================================================
   RFP Document APIs (Phase 4 & Phase 5)
   ============================================================================ */

export type DocumentTypeEnum = "PDF" | "DOCX" | "XLSX" | "PPTX";
export type DocumentStatusEnum = "ACTIVE" | "ARCHIVED";
export type ProcessingStatusEnum = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type SourceTypeEnum = "PAGE" | "PARAGRAPH" | "TABLE_ROW" | "SLIDE" | "ROW";

export interface DocumentVersionResponse {
  id: string;
  organization_id: string;
  rfp_document_id: string;
  version_number: number;
  original_filename: string;
  content_type: string;
  file_size_bytes: number;
  checksum_sha256: string;
  processing_status: ProcessingStatusEnum;
  processing_started_at?: string | null;
  processing_completed_at?: string | null;
  processing_error?: string | null;
  created_by_id: string;
  created_at: string;
}

export interface RFPDocumentResponse {
  id: string;
  organization_id: string;
  rfp_project_id: string;
  created_by_id: string;
  name: string;
  document_type: DocumentTypeEnum;
  status: DocumentStatusEnum;
  current_version_id?: string | null;
  current_version?: DocumentVersionResponse | null;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
}

export interface RFPDocumentListResponse {
  items: RFPDocumentResponse[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface PresignedUrlResponse {
  download_url: string;
  expires_in_seconds: number;
}

export interface ProcessingStatusResponse {
  status: ProcessingStatusEnum;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
}

export interface DocumentContentBlockResponse {
  id: string;
  sequence_number: number;
  source_type: SourceTypeEnum;
  source_index: number;
  text: string;
  metadata_json?: Record<string, any> | null;
}

export interface DocumentContentResponse {
  id: string;
  document_version_id: string;
  full_text: string;
  character_count: number;
  source_unit_count: number;
  created_at: string;
  blocks: DocumentContentBlockResponse[];
}

export async function uploadRFPDocumentApi(
  projectId: string,
  file: File
): Promise<RFPDocumentResponse> {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch<RFPDocumentResponse>(`/api/v1/rfp-projects/${projectId}/documents`, {
    method: "POST",
    body: formData,
  });
}

export async function uploadNewDocumentVersionApi(
  projectId: string,
  documentId: string,
  file: File
): Promise<RFPDocumentResponse> {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch<RFPDocumentResponse>(
    `/api/v1/rfp-projects/${projectId}/documents/${documentId}/versions`,
    {
      method: "POST",
      body: formData,
    }
  );
}

export async function listRFPDocumentsApi(
  projectId: string,
  page: number = 1,
  pageSize: number = 20
): Promise<RFPDocumentListResponse> {
  return apiFetch<RFPDocumentListResponse>(
    `/api/v1/rfp-projects/${projectId}/documents?page=${page}&page_size=${pageSize}`
  );
}

export async function getRFPDocumentApi(
  projectId: string,
  documentId: string
): Promise<RFPDocumentResponse> {
  return apiFetch<RFPDocumentResponse>(
    `/api/v1/rfp-projects/${projectId}/documents/${documentId}`
  );
}

export async function getRFPDocumentVersionsApi(
  projectId: string,
  documentId: string
): Promise<DocumentVersionResponse[]> {
  return apiFetch<DocumentVersionResponse[]>(
    `/api/v1/rfp-projects/${projectId}/documents/${documentId}/versions`
  );
}

export async function downloadRFPDocumentApi(
  projectId: string,
  documentId: string,
  versionId?: string
): Promise<PresignedUrlResponse> {
  let url = `/api/v1/rfp-projects/${projectId}/documents/${documentId}/download`;
  if (versionId) {
    url += `?version_id=${encodeURIComponent(versionId)}`;
  }
  return apiFetch<PresignedUrlResponse>(url);
}

export async function archiveRFPDocumentApi(
  projectId: string,
  documentId: string
): Promise<RFPDocumentResponse> {
  return apiFetch<RFPDocumentResponse>(
    `/api/v1/rfp-projects/${projectId}/documents/${documentId}/archive`,
    {
      method: "POST",
    }
  );
}

export async function getVersionProcessingStatusApi(
  projectId: string,
  documentId: string,
  versionId: string
): Promise<ProcessingStatusResponse> {
  return apiFetch<ProcessingStatusResponse>(
    `/api/v1/rfp-projects/${projectId}/documents/${documentId}/versions/${versionId}/processing`
  );
}

export async function triggerVersionProcessingApi(
  projectId: string,
  documentId: string,
  versionId: string
): Promise<ProcessingStatusResponse> {
  return apiFetch<ProcessingStatusResponse>(
    `/api/v1/rfp-projects/${projectId}/documents/${documentId}/versions/${versionId}/process`,
    {
      method: "POST",
    }
  );
}

export async function getExtractedContentApi(
  projectId: string,
  documentId: string,
  versionId: string
): Promise<DocumentContentResponse> {
  return apiFetch<DocumentContentResponse>(
    `/api/v1/rfp-projects/${projectId}/documents/${documentId}/versions/${versionId}/content`
  );
}

/* ============================================================================
   Requirement Intelligence APIs (Phase 6)
   ============================================================================ */

export type RequirementCategoryEnum =
  | "FUNCTIONAL"
  | "TECHNICAL"
  | "SECURITY"
  | "COMPLIANCE"
  | "LEGAL"
  | "COMMERCIAL"
  | "FINANCIAL"
  | "OPERATIONAL"
  | "SUPPORT"
  | "IMPLEMENTATION"
  | "GENERAL";

export type RequirementTypeEnum = "MANDATORY" | "OPTIONAL" | "INFORMATIONAL";
export type RequirementPriorityEnum = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type RequirementStatusEnum = "EXTRACTED" | "REVIEW_REQUIRED" | "ACCEPTED" | "REJECTED";
export type ExtractionStatusEnum = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface RequirementEvidenceResponse {
  id: string;
  requirement_id: string;
  document_version_id: string;
  content_block_id: string;
  evidence_text: string;
  source_type: string;
  source_reference: string;
  relevance_score: number;
  created_at: string;
}

export interface RequirementResponse {
  id: string;
  organization_id: string;
  rfp_project_id: string;
  document_version_id: string;
  requirement_code: string;
  title: string;
  description: string;
  category: RequirementCategoryEnum;
  requirement_type: RequirementTypeEnum;
  priority: RequirementPriorityEnum;
  mandatory: boolean;
  confidence_score: number;
  status: RequirementStatusEnum;
  review_required: boolean;
  created_at: string;
  updated_at: string;
  evidence_list?: RequirementEvidenceResponse[];
}

export interface RequirementUpdate {
  title?: string;
  description?: string;
  category?: RequirementCategoryEnum;
  requirement_type?: RequirementTypeEnum;
  priority?: RequirementPriorityEnum;
  mandatory?: boolean;
  status?: RequirementStatusEnum;
  review_required?: boolean;
}

export interface RequirementListResponse {
  items: RequirementResponse[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface RequirementExtractionStatusResponse {
  status: ExtractionStatusEnum;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
}

export async function triggerRequirementExtractionApi(
  projectId: string,
  versionId?: string
): Promise<RequirementExtractionStatusResponse> {
  let url = `/api/v1/rfp-projects/${projectId}/requirement-extraction`;
  if (versionId) {
    url += `?version_id=${encodeURIComponent(versionId)}`;
  }
  return apiFetch<RequirementExtractionStatusResponse>(url, {
    method: "POST",
  });
}

export async function getRequirementExtractionStatusApi(
  projectId: string
): Promise<RequirementExtractionStatusResponse> {
  return apiFetch<RequirementExtractionStatusResponse>(
    `/api/v1/rfp-projects/${projectId}/requirement-extraction`
  );
}

export async function listRequirementsApi(
  projectId: string,
  filters?: {
    page?: number;
    pageSize?: number;
    category?: RequirementCategoryEnum;
    requirement_type?: RequirementTypeEnum;
    priority?: RequirementPriorityEnum;
    status?: RequirementStatusEnum;
    review_required?: boolean;
  }
): Promise<RequirementListResponse> {
  const params = new URLSearchParams();
  params.append("page", String(filters?.page || 1));
  params.append("page_size", String(filters?.pageSize || 20));

  if (filters?.category) params.append("category", filters.category);
  if (filters?.requirement_type) params.append("requirement_type", filters.requirement_type);
  if (filters?.priority) params.append("priority", filters.priority);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.review_required !== undefined) {
    params.append("review_required", String(filters.review_required));
  }

  return apiFetch<RequirementListResponse>(
    `/api/v1/rfp-projects/${projectId}/requirements?${params.toString()}`
  );
}

export async function getRequirementDetailsApi(
  projectId: string,
  requirementId: string
): Promise<RequirementResponse> {
  return apiFetch<RequirementResponse>(
    `/api/v1/rfp-projects/${projectId}/requirements/${requirementId}`
  );
}

export async function getRequirementEvidenceApi(
  projectId: string,
  requirementId: string
): Promise<RequirementEvidenceResponse[]> {
  return apiFetch<RequirementEvidenceResponse[]>(
    `/api/v1/rfp-projects/${projectId}/requirements/${requirementId}/evidence`
  );
}

export async function updateRequirementApi(
  projectId: string,
  requirementId: string,
  data: RequirementUpdate
): Promise<RequirementResponse> {
  return apiFetch<RequirementResponse>(
    `/api/v1/rfp-projects/${projectId}/requirements/${requirementId}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    }
  );
}

/* ============================================================================
   Company Knowledge & Hybrid Vector Search APIs (Phase 7)
   ============================================================================ */

export type KnowledgeTypeEnum =
  | "COMPANY_PROFILE"
  | "PRODUCT"
  | "SERVICE"
  | "TECHNICAL_CAPABILITY"
  | "SECURITY"
  | "COMPLIANCE"
  | "CERTIFICATION"
  | "IMPLEMENTATION"
  | "SUPPORT"
  | "CASE_STUDY"
  | "POLICY"
  | "STANDARD"
  | "OTHER";

export type KnowledgeStatusEnum = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type AuthorityLevelEnum = "AUTHORITATIVE" | "APPROVED" | "INTERNAL" | "REFERENCE";

export interface KnowledgeDocumentCreate {
  title: string;
  description?: string | null;
  knowledge_type: KnowledgeTypeEnum;
  source_name?: string | null;
  source_reference?: string | null;
  authority_level?: AuthorityLevelEnum;
  raw_content?: string | null;
}

export interface KnowledgeDocumentUpdate {
  title?: string | null;
  description?: string | null;
  knowledge_type?: KnowledgeTypeEnum | null;
  source_name?: string | null;
  source_reference?: string | null;
  status?: KnowledgeStatusEnum | null;
  authority_level?: AuthorityLevelEnum | null;
}

export interface KnowledgeVersionCreate {
  raw_content: string;
  original_filename?: string | null;
}

export interface KnowledgeVersionResponse {
  id: string;
  knowledge_document_id: string;
  version_number: number;
  original_filename?: string | null;
  processing_status: ProcessingStatusEnum;
  processing_started_at?: string | null;
  processing_completed_at?: string | null;
  processing_error?: string | null;
  created_at: string;
}

export interface CompanyKnowledgeDocumentResponse {
  id: string;
  organization_id: string;
  created_by_id: string;
  title: string;
  description?: string | null;
  knowledge_type: KnowledgeTypeEnum;
  source_name?: string | null;
  source_reference?: string | null;
  status: KnowledgeStatusEnum;
  authority_level: AuthorityLevelEnum;
  effective_from?: string | null;
  effective_until?: string | null;
  created_at: string;
  updated_at: string;
  versions: KnowledgeVersionResponse[];
}

export interface KnowledgeSearchRequest {
  query: string;
  top_k?: number;
  knowledge_types?: KnowledgeTypeEnum[];
  authority_levels?: AuthorityLevelEnum[];
}

export interface HybridRetrievalResultResponse {
  chunk_id: string;
  knowledge_document_id: string;
  knowledge_version_id: string;
  title: string;
  content: string;
  final_score: number;
  semantic_score: number;
  lexical_score: number;
  authority_level: string;
  knowledge_type: string;
  source_metadata?: Record<string, any> | null;
  created_at: string;
}

export interface KnowledgeSearchResponse {
  query: string;
  total: number;
  results: HybridRetrievalResultResponse[];
}

export async function createKnowledgeDocumentApi(
  data: KnowledgeDocumentCreate
): Promise<CompanyKnowledgeDocumentResponse> {
  return apiFetch<CompanyKnowledgeDocumentResponse>("/api/v1/company-knowledge", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listKnowledgeDocumentsApi(filters?: {
  knowledge_type?: KnowledgeTypeEnum;
  status?: KnowledgeStatusEnum;
  authority_level?: AuthorityLevelEnum;
}): Promise<CompanyKnowledgeDocumentResponse[]> {
  const params = new URLSearchParams();
  if (filters?.knowledge_type) params.append("knowledge_type", filters.knowledge_type);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.authority_level) params.append("authority_level", filters.authority_level);

  let url = "/api/v1/company-knowledge";
  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  return apiFetch<CompanyKnowledgeDocumentResponse[]>(url);
}

export async function getKnowledgeDocumentApi(
  documentId: string
): Promise<CompanyKnowledgeDocumentResponse> {
  return apiFetch<CompanyKnowledgeDocumentResponse>(`/api/v1/company-knowledge/${documentId}`);
}

export async function updateKnowledgeDocumentApi(
  documentId: string,
  data: KnowledgeDocumentUpdate
): Promise<CompanyKnowledgeDocumentResponse> {
  return apiFetch<CompanyKnowledgeDocumentResponse>(`/api/v1/company-knowledge/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function addKnowledgeVersionApi(
  documentId: string,
  data: KnowledgeVersionCreate
): Promise<KnowledgeVersionResponse> {
  return apiFetch<KnowledgeVersionResponse>(
    `/api/v1/company-knowledge/${documentId}/versions`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
}

export async function searchCompanyKnowledgeApi(
  data: KnowledgeSearchRequest
): Promise<KnowledgeSearchResponse> {
  return apiFetch<KnowledgeSearchResponse>("/api/v1/knowledge/search", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function findEvidenceForRequirementApi(
  projectId: string,
  requirementId: string,
  topK: number = 5
): Promise<KnowledgeSearchResponse> {
  return apiFetch<KnowledgeSearchResponse>(
    `/api/v1/rfp-projects/${projectId}/requirements/${requirementId}/find-evidence?top_k=${topK}`,
    {
      method: "POST",
    }
  );
}

/* ============================================================================
   Previous Proposal Intelligence APIs (Phase 8)
   ============================================================================ */

export type ProposalOutcomeEnum = "WON" | "LOST" | "NO_DECISION" | "UNKNOWN";
export type PreviousProposalStatusEnum = "DRAFT" | "APPROVED" | "ARCHIVED";

export interface PreviousProposalCreate {
  title: string;
  proposal_reference: string;
  customer_name?: string | null;
  description?: string | null;
  proposal_date?: string | null;
  outcome?: ProposalOutcomeEnum;
  status?: PreviousProposalStatusEnum;
  raw_content?: string | null;
}

export interface PreviousProposalUpdate {
  title?: string | null;
  proposal_reference?: string | null;
  customer_name?: string | null;
  description?: string | null;
  proposal_date?: string | null;
  outcome?: ProposalOutcomeEnum | null;
  status?: PreviousProposalStatusEnum | null;
}

export interface PreviousProposalVersionCreate {
  raw_content: string;
  original_filename?: string | null;
}

export interface PreviousProposalVersionResponse {
  id: string;
  previous_proposal_id: string;
  version_number: number;
  original_filename?: string | null;
  processing_status: ProcessingStatusEnum;
  processing_started_at?: string | null;
  processing_completed_at?: string | null;
  processing_error?: string | null;
  created_at: string;
}

export interface PreviousProposalResponse {
  id: string;
  organization_id: string;
  created_by_id: string;
  title: string;
  proposal_reference: string;
  customer_name?: string | null;
  description?: string | null;
  proposal_date?: string | null;
  outcome: ProposalOutcomeEnum;
  status: PreviousProposalStatusEnum;
  created_at: string;
  updated_at: string;
  versions: PreviousProposalVersionResponse[];
}

export interface HistoricalProposalSearchRequest {
  query: string;
  top_k?: number;
  outcome?: ProposalOutcomeEnum;
  date_from?: string;
  date_to?: string;
}

export interface ProposalRetrievalResultResponse {
  section_id: string;
  proposal_id: string;
  proposal_version_id: string;
  proposal_title: string;
  proposal_reference: string;
  customer_name?: string | null;
  proposal_date?: string | null;
  outcome: string;
  status: string;
  section_title?: string | null;
  content: string;
  final_score: number;
  semantic_score: number;
  lexical_score: number;
  recency_score: number;
  source_metadata?: Record<string, any> | null;
  source_class: string;
}

export interface HistoricalProposalSearchResponse {
  query: string;
  total: number;
  results: ProposalRetrievalResultResponse[];
}

export async function createPreviousProposalApi(
  data: PreviousProposalCreate
): Promise<PreviousProposalResponse> {
  return apiFetch<PreviousProposalResponse>("/api/v1/previous-proposals", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listPreviousProposalsApi(filters?: {
  outcome?: ProposalOutcomeEnum;
  status?: PreviousProposalStatusEnum;
}): Promise<PreviousProposalResponse[]> {
  const params = new URLSearchParams();
  if (filters?.outcome) params.append("outcome", filters.outcome);
  if (filters?.status) params.append("status", filters.status);

  let url = "/api/v1/previous-proposals";
  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  return apiFetch<PreviousProposalResponse[]>(url);
}

export async function getPreviousProposalApi(
  proposalId: string
): Promise<PreviousProposalResponse> {
  return apiFetch<PreviousProposalResponse>(`/api/v1/previous-proposals/${proposalId}`);
}

export async function updatePreviousProposalApi(
  proposalId: string,
  data: PreviousProposalUpdate
): Promise<PreviousProposalResponse> {
  return apiFetch<PreviousProposalResponse>(`/api/v1/previous-proposals/${proposalId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function addProposalVersionApi(
  proposalId: string,
  data: PreviousProposalVersionCreate
): Promise<PreviousProposalVersionResponse> {
  return apiFetch<PreviousProposalVersionResponse>(
    `/api/v1/previous-proposals/${proposalId}/versions`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
}

export async function searchPreviousProposalsApi(
  data: HistoricalProposalSearchRequest
): Promise<HistoricalProposalSearchResponse> {
  return apiFetch<HistoricalProposalSearchResponse>("/api/v1/previous-proposals/search", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function findPreviousProposalsForRequirementApi(
  projectId: string,
  requirementId: string,
  topK: number = 5
): Promise<HistoricalProposalSearchResponse> {
  return apiFetch<HistoricalProposalSearchResponse>(
    `/api/v1/rfp-projects/${projectId}/requirements/${requirementId}/find-previous-proposals?top_k=${topK}`,
    {
      method: "POST",
    }
  );
}

export async function triggerComplianceAssessmentApi(projectId: string): Promise<any> {
  return apiFetch<any>(`/api/v1/rfp-projects/${projectId}/compliance-assessment`, {
    method: "POST",
  });
}

export async function getComplianceAssessmentStatusApi(projectId: string): Promise<any> {
  return apiFetch<any>(`/api/v1/rfp-projects/${projectId}/compliance-assessment/status`);
}

export async function listComplianceAssessmentsApi(
  projectId: string,
  statusFilter?: string,
  reviewRequired?: boolean
): Promise<any[]> {
  const params = new URLSearchParams();
  if (statusFilter && statusFilter !== "ALL") params.append("status", statusFilter);
  if (reviewRequired !== undefined) params.append("review_required", String(reviewRequired));

  let url = `/api/v1/rfp-projects/${projectId}/compliance-assessments`;
  if (params.toString()) url += `?${params.toString()}`;

  return apiFetch<any[]>(url);
}

export async function getRequirementComplianceApi(
  projectId: string,
  requirementId: string
): Promise<any> {
  return apiFetch<any>(`/api/v1/rfp-projects/${projectId}/requirements/${requirementId}/compliance`);
}

export async function updateRequirementComplianceReviewApi(
  projectId: string,
  requirementId: string,
  data: { status?: string; review_status?: string; reviewer_comments?: string }
): Promise<any> {
  return apiFetch<any>(`/api/v1/rfp-projects/${projectId}/requirements/${requirementId}/compliance`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/* ============================================================================
   PHASE 10 — PROPOSAL GENERATION API CLIENT
   ============================================================================ */

export type ProposalStatusEnum = "DRAFT" | "GENERATING" | "GENERATED" | "IN_REVIEW" | "FINALIZED";
export type GenerationStatusEnum = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type SectionReviewStatusEnum = "PENDING_REVIEW" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "NEEDS_REVISION";

export interface GeneratedContentEvidenceResponse {
  id: string;
  organization_id: string;
  proposal_section_id: string;
  source_type: string;
  source_id?: string | null;
  source_title: string;
  citation_reference: string;
  evidence_text: string;
  relevance_score: number;
  authority_level: string;
  is_conflicting: boolean;
  conflict_notes?: string | null;
  created_at: string;
}

export interface UnsupportedClaimResponse {
  id: string;
  organization_id: string;
  proposal_section_id: string;
  claim: string;
  reason: string;
  severity: string;
  review_required: boolean;
  created_at: string;
}

export interface ProposalSectionResponse {
  id: string;
  organization_id: string;
  proposal_id: string;
  proposal_version_id: string;
  section_key: string;
  section_title: string;
  section_order: number;
  content: string;
  ai_generated_content?: string | null;
  status: ProposalStatusEnum;
  generation_status: GenerationStatusEnum;
  review_status: SectionReviewStatusEnum;
  confidence_score: number;
  review_required: boolean;
  reviewer_comments?: string | null;
  reviewed_by_id?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
  evidence_list: GeneratedContentEvidenceResponse[];
  unsupported_claims: UnsupportedClaimResponse[];
  requirement_ids: string[];
}

export interface ProposalVersionResponse {
  id: string;
  organization_id: string;
  proposal_id: string;
  version_number: number;
  status: ProposalStatusEnum;
  generation_status: GenerationStatusEnum;
  generation_started_at?: string | null;
  generation_completed_at?: string | null;
  generation_error?: string | null;
  created_by_id: string;
  created_at: string;
  updated_at: string;
  sections: ProposalSectionResponse[];
}

export interface ProposalResponse {
  id: string;
  organization_id: string;
  rfp_project_id: string;
  title: string;
  description?: string | null;
  status: ProposalStatusEnum;
  current_version_id?: string | null;
  created_by_id: string;
  created_at: string;
  updated_at: string;
  current_version?: ProposalVersionResponse | null;
}

export async function createProposalApi(
  projectId: string,
  title: string,
  description?: string,
  customSections?: any[]
): Promise<ProposalResponse> {
  return apiFetch<ProposalResponse>(`/api/v1/rfp-projects/${projectId}/proposals`, {
    method: "POST",
    body: JSON.stringify({ title, description, custom_sections: customSections }),
  });
}

export async function listProposalsApi(projectId: string): Promise<ProposalResponse[]> {
  return apiFetch<ProposalResponse[]>(`/api/v1/rfp-projects/${projectId}/proposals`);
}

export async function getProposalApi(proposalId: string): Promise<ProposalResponse> {
  return apiFetch<ProposalResponse>(`/api/v1/proposals/${proposalId}`);
}

export async function createProposalVersionApi(
  proposalId: string,
  copyFromVersionId?: string
): Promise<ProposalVersionResponse> {
  return apiFetch<ProposalVersionResponse>(`/api/v1/proposals/${proposalId}/versions`, {
    method: "POST",
    body: JSON.stringify({ copy_from_version_id: copyFromVersionId }),
  });
}

export async function listProposalVersionsApi(proposalId: string): Promise<ProposalVersionResponse[]> {
  return apiFetch<ProposalVersionResponse[]>(`/api/v1/proposals/${proposalId}/versions`);
}

export async function generateProposalVersionApi(
  proposalId: string,
  versionId: string
): Promise<ProposalVersionResponse> {
  return apiFetch<ProposalVersionResponse>(`/api/v1/proposals/${proposalId}/versions/${versionId}/generate`, {
    method: "POST",
  });
}

export async function generateProposalSectionApi(
  proposalId: string,
  versionId: string,
  sectionId: string
): Promise<ProposalSectionResponse> {
  return apiFetch<ProposalSectionResponse>(
    `/api/v1/proposals/${proposalId}/versions/${versionId}/sections/${sectionId}/generate`,
    { method: "POST" }
  );
}

export async function regenerateProposalSectionApi(
  proposalId: string,
  versionId: string,
  sectionId: string
): Promise<ProposalSectionResponse> {
  return apiFetch<ProposalSectionResponse>(
    `/api/v1/proposals/${proposalId}/versions/${versionId}/sections/${sectionId}/regenerate`,
    { method: "POST" }
  );
}

export async function getProposalSectionApi(
  proposalId: string,
  versionId: string,
  sectionId: string
): Promise<ProposalSectionResponse> {
  return apiFetch<ProposalSectionResponse>(
    `/api/v1/proposals/${proposalId}/versions/${versionId}/sections/${sectionId}`
  );
}

export async function updateProposalSectionApi(
  proposalId: string,
  versionId: string,
  sectionId: string,
  data: {
    section_title?: string;
    section_order?: number;
    content?: string;
    review_status?: SectionReviewStatusEnum;
    reviewer_comments?: string;
  }
): Promise<ProposalSectionResponse> {
  return apiFetch<ProposalSectionResponse>(
    `/api/v1/proposals/${proposalId}/versions/${versionId}/sections/${sectionId}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    }
  );
}

export async function getProposalSectionEvidenceApi(
  proposalId: string,
  versionId: string,
  sectionId: string
): Promise<GeneratedContentEvidenceResponse[]> {
  return apiFetch<GeneratedContentEvidenceResponse[]>(
    `/api/v1/proposals/${proposalId}/versions/${versionId}/sections/${sectionId}/evidence`
  );
}

export async function getProposalSectionClaimsApi(
  proposalId: string,
  versionId: string,
  sectionId: string
): Promise<UnsupportedClaimResponse[]> {
  return apiFetch<UnsupportedClaimResponse[]>(
    `/api/v1/proposals/${proposalId}/versions/${versionId}/sections/${sectionId}/claims`
  );
}






