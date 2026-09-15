"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  CompanyKnowledgeDocumentResponse,
  KnowledgeSearchResponse,
  HybridRetrievalResultResponse,
  KnowledgeTypeEnum,
  KnowledgeStatusEnum,
  AuthorityLevelEnum,
  RoleEnum,
  listKnowledgeDocumentsApi,
  createKnowledgeDocumentApi,
  addKnowledgeVersionApi,
  updateKnowledgeDocumentApi,
  searchCompanyKnowledgeApi,
  KnowledgeDocumentCreate,
} from "@/lib/api-client";

interface CompanyKnowledgeWorkspaceProps {
  userRole: RoleEnum;
}

const KNOWLEDGE_TYPES: KnowledgeTypeEnum[] = [
  "COMPANY_PROFILE",
  "PRODUCT",
  "SERVICE",
  "TECHNICAL_CAPABILITY",
  "SECURITY",
  "COMPLIANCE",
  "CERTIFICATION",
  "IMPLEMENTATION",
  "SUPPORT",
  "CASE_STUDY",
  "POLICY",
  "STANDARD",
  "OTHER",
];

const AUTHORITY_LEVELS: AuthorityLevelEnum[] = [
  "AUTHORITATIVE",
  "APPROVED",
  "INTERNAL",
  "REFERENCE",
];

export default function CompanyKnowledgeWorkspace({ userRole }: CompanyKnowledgeWorkspaceProps) {
  const isProductTeam = userRole === "PRODUCT_TEAM";

  const [documents, setDocuments] = useState<CompanyKnowledgeDocumentResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search / RAG State
  const [searchQuery, setSearchQuery] = useState<string>("SOC2 Type II compliance and AES-256 data encryption");
  const [searchTopK, setSearchTopK] = useState<number>(5);
  const [searchFilterType, setSearchFilterType] = useState<KnowledgeTypeEnum | "">("");
  const [searchFilterAuth, setSearchFilterAuth] = useState<AuthorityLevelEnum | "">("");
  const [searchResults, setSearchResults] = useState<HybridRetrievalResultResponse[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState<KnowledgeDocumentCreate>({
    title: "",
    description: "",
    knowledge_type: "SECURITY",
    authority_level: "AUTHORITATIVE",
    source_name: "Internal Policy",
    source_reference: "SEC-2026-v1",
    raw_content: "",
  });
  const [createSubmitting, setCreateSubmitting] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Version Upload Modal State
  const [showVersionModal, setShowVersionModal] = useState<boolean>(false);
  const [selectedDocForVersion, setSelectedDocForVersion] = useState<CompanyKnowledgeDocumentResponse | null>(null);
  const [versionRawContent, setVersionRawContent] = useState<string>("");
  const [versionSubmitting, setVersionSubmitting] = useState<boolean>(false);
  const [versionError, setVersionError] = useState<string | null>(null);

  // 1. Fetch Knowledge Documents
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const docs = await listKnowledgeDocumentsApi();
      setDocuments(docs);
    } catch (err: any) {
      setError(err?.detail || "Failed to load company knowledge documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // 2. Create Knowledge Document Handler
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title || !createForm.raw_content) {
      setCreateError("Title and Raw Document Content are required.");
      return;
    }

    setCreateSubmitting(true);
    setCreateError(null);

    try {
      await createKnowledgeDocumentApi(createForm);
      setShowCreateModal(false);
      setCreateForm({
        title: "",
        description: "",
        knowledge_type: "SECURITY",
        authority_level: "AUTHORITATIVE",
        source_name: "Internal Policy",
        source_reference: "SEC-2026-v1",
        raw_content: "",
      });
      await fetchDocuments();
    } catch (err: any) {
      setCreateError(err?.detail || "Failed to create knowledge document.");
    } finally {
      setCreateSubmitting(false);
    }
  };

  // 3. Add Version Handler
  const handleVersionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocForVersion || !versionRawContent) return;

    setVersionSubmitting(true);
    setVersionError(null);

    try {
      await addKnowledgeVersionApi(selectedDocForVersion.id, {
        raw_content: versionRawContent,
        original_filename: `${selectedDocForVersion.title}_v${selectedDocForVersion.versions.length + 1}.txt`,
      });
      setShowVersionModal(false);
      setVersionRawContent("");
      setSelectedDocForVersion(null);
      await fetchDocuments();
    } catch (err: any) {
      setVersionError(err?.detail || "Failed to add knowledge version.");
    } finally {
      setVersionSubmitting(false);
    }
  };

  // 4. Archive Document Handler
  const handleArchiveDoc = async (docId: string) => {
    if (!confirm("Are you sure you want to archive this knowledge document?")) return;
    try {
      await updateKnowledgeDocumentApi(docId, { status: "ARCHIVED" });
      await fetchDocuments();
    } catch (err: any) {
      alert(`Archive failed: ${err?.detail || "Could not archive document"}`);
    }
  };

  // 5. Execute Real Hybrid Vector Search
  const handlePerformSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const res: KnowledgeSearchResponse = await searchCompanyKnowledgeApi({
        query: searchQuery,
        top_k: searchTopK,
        knowledge_types: searchFilterType ? [searchFilterType] : undefined,
        authority_levels: searchFilterAuth ? [searchFilterAuth] : undefined,
      });
      setSearchResults(res.results);
    } catch (err: any) {
      setSearchError(err?.detail || "Knowledge vector search failed.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-8">
      
      {/* ========================================================================
          HYBRID VECTOR & RAG SEARCH ENGINE
         ======================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <span>🔍</span> Hybrid Vector RAG Search Engine
            </h3>
            <p className="text-xs text-slate-400">
              Powered by NVIDIA <span className="text-blue-300 font-mono font-semibold">nvidia/nemotron-3-embed-1b</span> (2048-dim) + pgvector
            </p>
          </div>
          <span className="px-3 py-1.5 bg-blue-950 text-blue-300 border border-blue-800 text-xs font-mono font-semibold rounded-xl">
            Semantic + Lexical Hybrid
          </span>
        </div>

        {/* Search Bar & Options Form */}
        <form onSubmit={handlePerformSearch} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter query to retrieve authoritative company truth (e.g., SOC2, encryption, SLA)..."
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 shadow-inner"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={searching || !searchQuery.trim()}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-500/20 transition disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {searching ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Searching pgvector...</span>
                </>
              ) : (
                <span>⚡ Search Company Truth</span>
              )}
            </button>
          </div>

          {/* Search Controls (Top K & Filters) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
              <span className="text-slate-400 font-mono">Top Results:</span>
              <select
                value={searchTopK}
                onChange={(e) => setSearchTopK(Number(e.target.value))}
                className="bg-slate-900 border border-slate-800 text-white rounded px-2 py-0.5 focus:outline-none"
              >
                <option value={3}>Top 3 Chunks</option>
                <option value={5}>Top 5 Chunks</option>
                <option value={10}>Top 10 Chunks</option>
                <option value={20}>Top 20 Chunks</option>
              </select>
            </div>

            <select
              value={searchFilterType}
              onChange={(e) => setSearchFilterType(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-3 py-1.5 focus:outline-none"
            >
              <option value="">All Knowledge Types</option>
              {KNOWLEDGE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <select
              value={searchFilterAuth}
              onChange={(e) => setSearchFilterAuth(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-3 py-1.5 focus:outline-none"
            >
              <option value="">All Authority Levels</option>
              {AUTHORITY_LEVELS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

          </div>
        </form>

        {/* Search Error Alert */}
        {searchError && (
          <div className="p-4 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl">
            ⚠️ Search Error: {searchError}
          </div>
        )}

        {/* Search Results Display */}
        {hasSearched && (
          <div className="space-y-4 pt-2">
            <div className="flex justify-between items-center text-xs font-mono text-slate-400 border-b border-slate-800 pb-2">
              <span>Retrieved {searchResults.length} Relevant Evidence Chunks</span>
              <span>pgvector Cosine Similarity + TSVECTOR Lexical</span>
            </div>

            {searchResults.length === 0 ? (
              <div className="p-8 border border-dashed border-slate-800 rounded-xl text-center text-xs text-slate-400">
                No relevant knowledge evidence found matching query &quot;{searchQuery}&quot;. Try adjusting terms or uploading knowledge documents.
              </div>
            ) : (
              <div className="space-y-3">
                {searchResults.map((res) => (
                  <div key={res.chunk_id} className="p-5 bg-slate-950 border border-slate-800 rounded-xl space-y-3 hover:border-slate-700 transition">
                    
                    {/* Result Header Bar */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🛡️</span>
                        <h4 className="font-bold text-white text-sm">{res.title}</h4>
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded border bg-blue-950 text-blue-300 border-blue-800">
                          {res.knowledge_type}
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded border bg-emerald-950 text-emerald-300 border-emerald-800">
                          {res.authority_level}
                        </span>
                      </div>

                      {/* Scores Pill */}
                      <div className="flex items-center gap-3 text-[11px] font-mono">
                        <span className="text-emerald-300 font-bold bg-emerald-950/80 px-2.5 py-1 rounded-lg border border-emerald-800">
                          Match: {Math.round(res.final_score * 100)}%
                        </span>
                        <span className="text-slate-400">
                          (Semantic: {Math.round(res.semantic_score * 100)}% | Lexical: {Math.round(res.lexical_score * 100)}%)
                        </span>
                      </div>
                    </div>

                    {/* Content Snippet */}
                    <p className="text-xs text-slate-200 font-serif italic leading-relaxed border-l-2 border-blue-500 pl-3 py-1">
                      &quot;{res.content}&quot;
                    </p>

                    {/* Metadata Provenance */}
                    <div className="flex flex-wrap items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
                      <div>Chunk UUID: <span className="text-slate-400">{res.chunk_id}</span></div>
                      <div>Document UUID: <span className="text-slate-400">{res.knowledge_document_id}</span></div>
                      <div>Indexed: <span className="text-slate-400">{new Date(res.created_at).toLocaleDateString()}</span></div>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ========================================================================
          COMPANY KNOWLEDGE DOCUMENT MANAGEMENT SECTION
         ======================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        
        {/* Section Header Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-slate-800 gap-4">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <span>📚</span> Organization Knowledge Repository
            </h3>
            <p className="text-xs text-slate-400">
              Authoritative company profiles, security whitepapers, SLAs, and technical specifications
            </p>
          </div>

          {/* Action Buttons */}
          {isProductTeam ? (
            <button
              onClick={() => {
                setShowCreateModal(true);
                setCreateError(null);
              }}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-blue-500/20 transition flex items-center gap-1.5"
            >
              <span>+ Add Knowledge Document</span>
            </button>
          ) : (
            <span className="px-3 py-1.5 bg-slate-800 text-slate-400 border border-slate-700 text-xs font-semibold rounded-xl">
              Read-Only Knowledge Access
            </span>
          )}
        </div>

        {/* Main Error Banner */}
        {error && (
          <div className="p-4 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl flex justify-between items-center">
            <div>⚠️ {error}</div>
            <button onClick={fetchDocuments} className="px-3 py-1 bg-red-900 hover:bg-red-800 text-white rounded-lg text-xs">
              Retry
            </button>
          </div>
        )}

        {/* Documents Table / Grid */}
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <svg className="animate-spin h-8 w-8 text-blue-500 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-xs font-mono text-slate-400">Loading knowledge repository from PostgreSQL backend...</p>
          </div>
        ) : documents.length === 0 ? (
          
          /* Empty State */
          <div className="p-12 border border-dashed border-slate-800 rounded-xl text-center space-y-3 bg-slate-950/50">
            <div className="text-3xl">📖</div>
            <h4 className="text-sm font-bold text-white">No Company Knowledge Documents yet.</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Add authoritative company documents to index them into pgvector using NVIDIA Nemotron 3 embeddings for RAG retrieval.
            </p>
            {isProductTeam && (
              <button
                onClick={() => {
                  setShowCreateModal(true);
                  setCreateError(null);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition"
              >
                Add First Knowledge Document
              </button>
            )}
          </div>

        ) : (

          /* Knowledge Table */
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/60">
                    <th className="py-3 px-4">Knowledge Document</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Authority Level</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Versions</th>
                    <th className="py-3 px-4">Created Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-xs">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-900/50 transition">
                      
                      {/* Document Name & Description */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5 max-w-sm">
                          <div className="font-semibold text-white">{doc.title}</div>
                          {doc.description && (
                            <p className="text-[11px] text-slate-400 line-clamp-1">{doc.description}</p>
                          )}
                          {doc.source_name && (
                            <div className="text-[10px] font-mono text-slate-500">
                              Ref: {doc.source_name} ({doc.source_reference || "N/A"})
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Type */}
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 font-mono text-[10px] font-bold rounded border bg-slate-800 text-slate-300 border-slate-700">
                          {doc.knowledge_type}
                        </span>
                      </td>

                      {/* Authority */}
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 font-mono text-[10px] font-bold rounded border ${
                          doc.authority_level === "AUTHORITATIVE"
                            ? "bg-purple-950 text-purple-300 border-purple-800"
                            : doc.authority_level === "APPROVED"
                            ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                            : doc.authority_level === "INTERNAL"
                            ? "bg-blue-950 text-blue-300 border-blue-800"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}>
                          {doc.authority_level}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 font-mono text-[10px] font-bold rounded border ${
                          doc.status === "ACTIVE"
                            ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                            : doc.status === "DRAFT"
                            ? "bg-slate-800 text-slate-300 border-slate-700"
                            : "bg-red-950 text-red-300 border-red-800"
                        }`}>
                          {doc.status}
                        </span>
                      </td>

                      {/* Versions */}
                      <td className="py-3 px-4 font-mono">
                        <span className="px-2 py-0.5 bg-blue-950 text-blue-300 border border-blue-800 text-[10px] font-bold rounded">
                          {doc.versions.length} version(s)
                        </span>
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          
                          {/* Add Version Button (Product Team) */}
                          {isProductTeam && (
                            <button
                              onClick={() => {
                                setSelectedDocForVersion(doc);
                                setShowVersionModal(true);
                                setVersionError(null);
                              }}
                              className="px-2.5 py-1 bg-blue-950/60 hover:bg-blue-900 border border-blue-800 text-blue-200 font-semibold text-[11px] rounded-lg transition"
                            >
                              + New Version
                            </button>
                          )}

                          {/* Archive Button (Product Team) */}
                          {isProductTeam && doc.status !== "ARCHIVED" && (
                            <button
                              onClick={() => handleArchiveDoc(doc.id)}
                              className="px-2 py-1 bg-red-950/50 hover:bg-red-900 border border-red-800 text-red-300 font-semibold text-[11px] rounded-lg transition"
                            >
                              Archive
                            </button>
                          )}

                        </div>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* ========================================================================
          CREATE KNOWLEDGE DOCUMENT MODAL
         ======================================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>➕</span> Ingest Company Knowledge Document
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl">
                ⚠️ {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              
              {/* Title */}
              <div className="space-y-1">
                <label className="text-slate-400 font-semibold uppercase">Document Title</label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="e.g. Enterprise Security & Compliance Whitepaper 2026"
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-slate-400 font-semibold uppercase">Overview / Description</label>
                <input
                  type="text"
                  value={createForm.description || ""}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Brief summary of authority level and scope..."
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Type & Authority Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold uppercase">Knowledge Type</label>
                  <select
                    value={createForm.knowledge_type}
                    onChange={(e) => setCreateForm({ ...createForm, knowledge_type: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
                  >
                    {KNOWLEDGE_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold uppercase">Authority Level</label>
                  <select
                    value={createForm.authority_level}
                    onChange={(e) => setCreateForm({ ...createForm, authority_level: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
                  >
                    {AUTHORITY_LEVELS.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Source Name & Reference */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold uppercase">Source Name</label>
                  <input
                    type="text"
                    value={createForm.source_name || ""}
                    onChange={(e) => setCreateForm({ ...createForm, source_name: e.target.value })}
                    placeholder="e.g. Infosec Policy"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold uppercase">Source Reference</label>
                  <input
                    type="text"
                    value={createForm.source_reference || ""}
                    onChange={(e) => setCreateForm({ ...createForm, source_reference: e.target.value })}
                    placeholder="e.g. ISO-27001-A1"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Raw Content Textarea */}
              <div className="space-y-1">
                <label className="text-slate-400 font-semibold uppercase">Raw Knowledge Text Content (Version 1)</label>
                <textarea
                  rows={6}
                  value={createForm.raw_content || ""}
                  onChange={(e) => setCreateForm({ ...createForm, raw_content: e.target.value })}
                  placeholder="Paste complete authoritative company knowledge text here for pgvector embedding ingestion..."
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 font-mono text-xs leading-relaxed"
                  required
                />
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50 flex items-center gap-2"
                >
                  {createSubmitting ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Ingesting & Embedding...</span>
                    </>
                  ) : (
                    <span>Ingest into Vector Store</span>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ========================================================================
          ADD VERSION MODAL
         ======================================================================== */}
      {showVersionModal && selectedDocForVersion && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>⚙️</span> Add New Version
                </h3>
                <p className="text-xs text-slate-400 font-mono">{selectedDocForVersion.title}</p>
              </div>
              <button
                onClick={() => setShowVersionModal(false)}
                className="text-slate-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {versionError && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl">
                ⚠️ {versionError}
              </div>
            )}

            <form onSubmit={handleVersionSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 font-semibold uppercase">Updated Version Text Content</label>
                <textarea
                  rows={6}
                  value={versionRawContent}
                  onChange={(e) => setVersionRawContent(e.target.value)}
                  placeholder="Paste updated knowledge text for version chunking & embedding..."
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 font-mono text-xs leading-relaxed"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowVersionModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={versionSubmitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50"
                >
                  {versionSubmitting ? "Processing Version..." : "Ingest New Version"}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
