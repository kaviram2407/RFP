"use client";

import { useState, useEffect } from "react";

interface DocumentVersion {
  id: string;
  version_number: number;
  original_filename: string;
  content_type: string;
  file_size_bytes: number;
  checksum_sha256: string;
  processing_status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  extraction_status?: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  processing_completed_at?: string;
  created_at: string;
}

interface RFPDocument {
  id: string;
  name: string;
  document_type: "PDF" | "DOCX" | "XLSX" | "PPTX";
  status: "ACTIVE" | "ARCHIVED";
  current_version?: DocumentVersion;
  created_at: string;
  updated_at: string;
}

interface RequirementEvidence {
  id: string;
  content_block_id: string;
  evidence_text: string;
  source_type: string;
  source_reference: string;
  relevance_score: number;
}

interface Requirement {
  id: string;
  requirement_code: string;
  title: string;
  description: string;
  category: "FUNCTIONAL" | "TECHNICAL" | "SECURITY" | "COMPLIANCE" | "LEGAL" | "COMMERCIAL" | "FINANCIAL" | "OPERATIONAL" | "SUPPORT" | "IMPLEMENTATION" | "GENERAL";
  requirement_type: "MANDATORY" | "OPTIONAL" | "INFORMATIONAL";
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  mandatory: boolean;
  confidence_score: number;
  status: "EXTRACTED" | "REVIEW_REQUIRED" | "ACCEPTED" | "REJECTED";
  review_required: boolean;
  evidence_list: RequirementEvidence[];
}

interface CompanyKnowledgeDocument {
  id: string;
  title: string;
  description?: string;
  knowledge_type: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  authority_level: "AUTHORITATIVE" | "APPROVED" | "INTERNAL" | "REFERENCE";
  version_count: number;
  created_at: string;
}

interface HybridSearchResult {
  chunk_id: string;
  knowledge_document_id: string;
  title: string;
  content: string;
  final_score: number;
  semantic_score: number;
  lexical_score: number;
  authority_level: string;
  knowledge_type: string;
  source_metadata?: any;
}


export default function RFPPlatformPage() {
  const [role, setRole] = useState<"PRODUCT_TEAM" | "VP" | "CTO" | "CEO">("PRODUCT_TEAM");
  const [activeTab, setActiveTab] = useState<"REQUIREMENTS" | "DOCUMENTS" | "KNOWLEDGE" | "SEARCH">("REQUIREMENTS");
  
  // Requirement Filters
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // RAG Search State
  const [searchQuery, setSearchQuery] = useState<string>("SOC2 Type II compliance and AES-256 data encryption");
  const [searchResults, setSearchResults] = useState<HybridSearchResult[]>([]);
  const [searching, setSearching] = useState<boolean>(false);

  // Selection state
  const [selectedRequirement, setSelectedRequirement] = useState<Requirement | null>(null);
  const [extracting, setExtracting] = useState<boolean>(false);
  const [showAddKnowledgeModal, setShowAddKnowledgeModal] = useState<boolean>(false);

  // Knowledge Form
  const [newKnowTitle, setNewKnowTitle] = useState("");
  const [newKnowType, setNewKnowType] = useState("SECURITY");
  const [newKnowAuth, setNewKnowAuth] = useState("AUTHORITATIVE");
  const [newKnowContent, setNewKnowContent] = useState("");

  // Mock State Data
  const [documents, setDocuments] = useState<RFPDocument[]>([
    {
      id: "doc-uuid-1",
      name: "Enterprise_Analytics_RFP_Specification.pdf",
      document_type: "PDF",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_version: {
        id: "ver-uuid-1",
        version_number: 1,
        original_filename: "Enterprise_Analytics_RFP_Specification.pdf",
        content_type: "application/pdf",
        file_size_bytes: 4521000,
        checksum_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        processing_status: "COMPLETED",
        extraction_status: "COMPLETED",
        processing_completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    },
  ]);

  const [knowledgeDocs, setKnowledgeDocs] = useState<CompanyKnowledgeDocument[]>([
    {
      id: "know-1",
      title: "Enterprise Security & Compliance Standard 2026",
      description: "Annual SOC2 Type II audit, ISO 27001 certifications, and AES-256 data encryption policies.",
      knowledge_type: "SECURITY",
      status: "ACTIVE",
      authority_level: "AUTHORITATIVE",
      version_count: 2,
      created_at: new Date().toISOString(),
    },
    {
      id: "know-2",
      title: "Global Technical Support & SLA Policy",
      description: "24x7 phone, email, and live chat technical support coverage with 99.9% guaranteed uptime SLA.",
      knowledge_type: "SUPPORT",
      status: "ACTIVE",
      authority_level: "APPROVED",
      version_count: 1,
      created_at: new Date().toISOString(),
    },
    {
      id: "know-3",
      title: "Draft Cloud Kubernetes Architecture",
      description: "Internal reference for containerized multi-cloud deployment topologies.",
      knowledge_type: "TECHNICAL_CAPABILITY",
      status: "DRAFT",
      authority_level: "INTERNAL",
      version_count: 1,
      created_at: new Date().toISOString(),
    },
  ]);

  const [requirements, setRequirements] = useState<Requirement[]>([
    {
      id: "req-1",
      requirement_code: "REQ-0001",
      title: "24x7 Technical Support & 99.9% Uptime SLA",
      description: "The vendor must provide round-the-clock technical support with guaranteed 99.9% uptime SLA.",
      category: "SUPPORT",
      requirement_type: "MANDATORY",
      priority: "CRITICAL",
      mandatory: true,
      confidence_score: 0.96,
      status: "EXTRACTED",
      review_required: false,
      evidence_list: [
        {
          id: "ev-1",
          content_block_id: "block-1",
          evidence_text: "The vendor must provide 24x7 technical support with 99.9% uptime SLA.",
          source_type: "CURRENT_RFP",
          source_reference: "PAGE 1",
          relevance_score: 1.0,
        },
      ],
    },
    {
      id: "req-2",
      requirement_code: "REQ-0002",
      title: "AES-256 Data Encryption & SOC2 Type II Certification",
      description: "All customer data at rest and in transit must be encrypted using AES-256 and supported by annual SOC2 Type II audits.",
      category: "SECURITY",
      requirement_type: "MANDATORY",
      priority: "CRITICAL",
      mandatory: true,
      confidence_score: 0.98,
      status: "ACCEPTED",
      review_required: false,
      evidence_list: [
        {
          id: "ev-2",
          content_block_id: "block-2",
          evidence_text: "All customer data at rest must be encrypted using AES-256 and SOC2 Type II certified.",
          source_type: "CURRENT_RFP",
          source_reference: "PAGE 2",
          relevance_score: 1.0,
        },
      ],
    },
  ]);

  const handleTriggerExtraction = () => {
    setExtracting(true);
    setTimeout(() => {
      setExtracting(false);
      alert("AI Requirement Extraction completed!");
    }, 1200);
  };

  const handlePerformRAGSearch = (queryOverride?: string) => {
    const q = queryOverride || searchQuery;
    if (!q) return;
    setSearching(true);
    setActiveTab("SEARCH");

    setTimeout(() => {
      setSearchResults([
        {
          chunk_id: "chunk-1",
          knowledge_document_id: "know-1",
          title: "Enterprise Security & Compliance Standard 2026",
          content: "Our enterprise platform maintains annual SOC2 Type II certification verified by independent auditors. All customer data at rest is encrypted using AES-256, and data in transit is secured via TLS 1.3.",
          final_score: 0.942,
          semantic_score: 0.91,
          lexical_score: 0.98,
          authority_level: "AUTHORITATIVE",
          knowledge_type: "SECURITY",
          source_metadata: { section: "Chunk 1", source_name: "Enterprise Security Standard" },
        },
        {
          chunk_id: "chunk-2",
          knowledge_document_id: "know-2",
          title: "Global Technical Support & SLA Policy",
          content: "We offer 24x7 phone, email, and live chat technical support with guaranteed 99.9% uptime SLA and 15-minute response time for critical issues.",
          final_score: 0.885,
          semantic_score: 0.86,
          lexical_score: 0.92,
          authority_level: "APPROVED",
          knowledge_type: "SUPPORT",
          source_metadata: { section: "Chunk 1", source_name: "Global Support Policy" },
        },
      ]);
      setSearching(false);
    }, 800);
  };

  const handleCreateKnowledgeDoc = () => {
    if (!newKnowTitle || !newKnowContent) return;
    const newDoc: CompanyKnowledgeDocument = {
      id: `know-${Date.now()}`,
      title: newKnowTitle,
      description: newKnowContent.substring(0, 100) + "...",
      knowledge_type: newKnowType,
      status: "ACTIVE",
      authority_level: newKnowAuth as any,
      version_count: 1,
      created_at: new Date().toISOString(),
    };
    setKnowledgeDocs((prev) => [newDoc, ...prev]);
    setShowAddKnowledgeModal(false);
    setNewKnowTitle("");
    setNewKnowContent("");
  };

  const isProductTeam = role === "PRODUCT_TEAM";

  const totalReqs = requirements.length;
  const mandatoryCount = requirements.filter((r) => r.mandatory).length;
  const activeKnowledgeCount = knowledgeDocs.filter((k) => k.status === "ACTIVE").length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <span className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg">⚡</span>
              AI-RFP Intelligence & Company RAG Engine
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Phase 7 — pgvector (<code className="text-blue-300 font-mono text-xs">nvidia/nemotron-3-embed-1b</code> 2048-dim) + Lexical Hybrid Search
            </p>
          </div>

          {/* Role Switcher */}
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 p-2 rounded-xl">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider pl-2">Role Context:</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="PRODUCT_TEAM">Product Team (Full Write)</option>
              <option value="VP">VP (Read Only)</option>
              <option value="CTO">CTO (Read Only)</option>
              <option value="CEO">CEO (Read Only)</option>
            </select>
          </div>
        </div>

        {/* Main Navigation Tabs */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-4 gap-4">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setActiveTab("REQUIREMENTS")}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition ${
                activeTab === "REQUIREMENTS"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              RFP Requirements ({totalReqs})
            </button>
            <button
              onClick={() => setActiveTab("KNOWLEDGE")}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition ${
                activeTab === "KNOWLEDGE"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              Company Knowledge Base ({activeKnowledgeCount} Active)
            </button>
            <button
              onClick={() => setActiveTab("SEARCH")}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition ${
                activeTab === "SEARCH"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              Hybrid RAG Search
            </button>
            <button
              onClick={() => setActiveTab("DOCUMENTS")}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition ${
                activeTab === "DOCUMENTS"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              RFP Source Files ({documents.length})
            </button>
          </div>

          {isProductTeam && activeTab === "KNOWLEDGE" && (
            <button
              onClick={() => setShowAddKnowledgeModal(true)}
              className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center gap-2"
            >
              + Add Company Knowledge Source
            </button>
          )}
        </div>

        {/* TAB 1: REQUIREMENTS */}
        {activeTab === "REQUIREMENTS" && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-4">Code</th>
                      <th className="px-6 py-4">Requirement Title</th>
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Priority</th>
                      <th className="px-6 py-4 text-right">RAG Company Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {requirements.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-800/40 transition">
                        <td className="px-6 py-4 font-mono text-xs font-semibold text-blue-400">{req.requirement_code}</td>
                        <td className="px-6 py-4 font-medium text-white max-w-xs">{req.title}</td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-400">{req.category}</td>
                        <td className="px-6 py-4 text-xs font-semibold text-blue-300">{req.requirement_type}</td>
                        <td className="px-6 py-4 text-xs font-semibold text-red-400">{req.priority}</td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handlePerformRAGSearch(`${req.title} ${req.description}`)}
                            className="px-3 py-1.5 bg-indigo-950 hover:bg-indigo-900 border border-indigo-700 text-indigo-200 text-xs font-medium rounded-lg transition"
                          >
                            🔍 Find Company Evidence
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: COMPANY KNOWLEDGE BASE */}
        {activeTab === "KNOWLEDGE" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Knowledge Sources</div>
                <div className="text-3xl font-extrabold text-white mt-1">{knowledgeDocs.length}</div>
              </div>
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Active (Indexed)</div>
                <div className="text-3xl font-extrabold text-emerald-400 mt-1">{activeKnowledgeCount}</div>
              </div>
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Authoritative</div>
                <div className="text-3xl font-extrabold text-purple-400 mt-1">
                  {knowledgeDocs.filter((k) => k.authority_level === "AUTHORITATIVE").length}
                </div>
              </div>
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Drafts</div>
                <div className="text-3xl font-extrabold text-amber-400 mt-1">
                  {knowledgeDocs.filter((k) => k.status === "DRAFT").length}
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-5 border-b border-slate-800 flex justify-between items-center">
                <h2 className="text-base font-semibold text-slate-200">Organization Knowledge Documents</h2>
                <span className="text-xs font-mono text-slate-400">pgvector 2048-dim Indexing</span>
              </div>
              <div className="divide-y divide-slate-800">
                {knowledgeDocs.map((k) => (
                  <div key={k.id} className="p-6 hover:bg-slate-800/40 transition flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-bold text-white text-base">{k.title}</h3>
                        <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                          k.status === "ACTIVE"
                            ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                            : "bg-amber-950 text-amber-300 border-amber-800"
                        }`}>
                          {k.status}
                        </span>
                        <span className="px-2 py-0.5 bg-purple-950 text-purple-300 text-xs font-semibold rounded border border-purple-800">
                          {k.authority_level}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{k.description}</p>
                      <div className="text-slate-500 text-xs font-mono">
                        Type: {k.knowledge_type} | Versions: {k.version_count}
                      </div>
                    </div>

                    {isProductTeam && (
                      <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition">
                        Manage Versions
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: HYBRID RAG SEARCH */}
        {activeTab === "SEARCH" && (
          <div className="space-y-6">
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-4">
              <h2 className="text-base font-semibold text-slate-200">Enterprise Hybrid RAG Evidence Retrieval</h2>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter RFP requirement or company query..."
                  className="flex-1 bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <button
                  onClick={() => handlePerformRAGSearch()}
                  disabled={searching}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl transition shadow-lg shadow-blue-500/20 whitespace-nowrap"
                >
                  {searching ? "Searching Vector Index..." : "Run Hybrid RAG Search"}
                </button>
              </div>
            </div>

            {/* Results Display */}
            {searchResults.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                  Ranked Evidence Results ({searchResults.length})
                </h3>

                <div className="space-y-4">
                  {searchResults.map((res, idx) => (
                    <div key={res.chunk_id} className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-lg">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <span className="px-2.5 py-1 bg-blue-950 text-blue-300 font-mono text-xs font-bold rounded">
                            #{idx + 1}
                          </span>
                          <h4 className="font-bold text-white text-base">{res.title}</h4>
                          <span className="px-2 py-0.5 bg-purple-950 text-purple-300 text-xs font-semibold rounded border border-purple-800">
                            {res.authority_level}
                          </span>
                        </div>
                        <div className="text-right font-mono text-xs">
                          <div className="text-emerald-400 font-bold text-sm">{(res.final_score * 100).toFixed(1)}% Match</div>
                          <div className="text-slate-500">Sem: {(res.semantic_score * 100).toFixed(0)}% | Lex: {(res.lexical_score * 100).toFixed(0)}%</div>
                        </div>
                      </div>

                      <blockquote className="text-slate-200 text-sm border-l-2 border-blue-500 pl-4 py-2 bg-slate-950/60 rounded-r-xl">
                        "{res.content}"
                      </blockquote>

                      <div className="text-xs text-slate-500 font-mono flex justify-between">
                        <span>Type: {res.knowledge_type}</span>
                        <span>Source: {res.source_metadata?.source_name || "Company Knowledge"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal: Add Company Knowledge */}
        {showAddKnowledgeModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-white">Add Company Knowledge Source</h3>
                <button onClick={() => setShowAddKnowledgeModal(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase">Title</label>
                  <input
                    type="text"
                    value={newKnowTitle}
                    onChange={(e) => setNewKnowTitle(e.target.value)}
                    placeholder="e.g. Enterprise SOC2 Security Policy"
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2 text-sm mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase">Knowledge Type</label>
                    <select
                      value={newKnowType}
                      onChange={(e) => setNewKnowType(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 text-sm mt-1"
                    >
                      <option value="SECURITY">SECURITY</option>
                      <option value="SUPPORT">SUPPORT</option>
                      <option value="TECHNICAL_CAPABILITY">TECHNICAL_CAPABILITY</option>
                      <option value="COMPLIANCE">COMPLIANCE</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase">Authority Level</label>
                    <select
                      value={newKnowAuth}
                      onChange={(e) => setNewKnowAuth(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 text-sm mt-1"
                    >
                      <option value="AUTHORITATIVE">AUTHORITATIVE</option>
                      <option value="APPROVED">APPROVED</option>
                      <option value="INTERNAL">INTERNAL</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase">Knowledge Text Content</label>
                  <textarea
                    rows={4}
                    value={newKnowContent}
                    onChange={(e) => setNewKnowContent(e.target.value)}
                    placeholder="Enter approved company policy, SLA, or technical spec..."
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl p-3 text-sm mt-1"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setShowAddKnowledgeModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateKnowledgeDoc}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-500/20"
                  >
                    Create & Index Knowledge
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
