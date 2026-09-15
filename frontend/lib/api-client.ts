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


