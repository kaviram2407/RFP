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

interface PreviousProposal {
  id: string;
  title: string;
  proposal_reference: string;
  customer_name?: string;
  description?: string;
  proposal_date?: string;
  outcome: "WON" | "LOST" | "NO_DECISION" | "UNKNOWN";
  status: "DRAFT" | "APPROVED" | "ARCHIVED";
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

interface HistoricalProposalResult {
  section_id: string;
  proposal_id: string;
  proposal_title: string;
  proposal_reference: string;
  customer_name?: string;
  proposal_date?: string;
  outcome: string;
  status: string;
  section_title?: string;
  content: string;
  final_score: number;
  semantic_score: number;
  lexical_score: number;
  recency_score: number;
  source_metadata?: any;
  source_class: string;
}

export default function RFPPlatformPage() {
  const [role, setRole] = useState<"PRODUCT_TEAM" | "VP" | "CTO" | "CEO">("PRODUCT_TEAM");
  const [activeTab, setActiveTab] = useState<"REQUIREMENTS" | "KNOWLEDGE" | "PROPOSALS" | "SEARCH" | "PROPOSAL_SEARCH">("REQUIREMENTS");
  
  // Requirement Filters
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  // RAG Search State
  const [searchQuery, setSearchQuery] = useState<string>("SOC2 Type II compliance and AES-256 data encryption");
  const [searchResults, setSearchResults] = useState<HybridSearchResult[]>([]);
  const [searching, setSearching] = useState<boolean>(false);

  // Proposal Search State
  const [propSearchQuery, setPropSearchQuery] = useState<string>("24x7 phone chat technical support with guaranteed 99.9% uptime SLA");
  const [propSearchResults, setPropSearchResults] = useState<HistoricalProposalResult[]>([]);
  const [propSearching, setPropSearching] = useState<boolean>(false);

  // Modals & Form
  const [showAddKnowledgeModal, setShowAddKnowledgeModal] = useState<boolean>(false);
  const [showAddProposalModal, setShowAddProposalModal] = useState<boolean>(false);

  // Proposal Form
  const [newPropTitle, setNewPropTitle] = useState("");
  const [newPropRef, setNewPropRef] = useState("");
  const [newPropCust, setNewPropCust] = useState("");
  const [newPropOutcome, setNewPropOutcome] = useState<"WON" | "LOST" | "NO_DECISION">("WON");
  const [newPropContent, setNewPropContent] = useState("");

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
  ]);

  const [proposals, setProposals] = useState<PreviousProposal[]>([
    {
      id: "prop-1",
      title: "Global Bank Corp Enterprise RFP 2025",
      proposal_reference: "PROP-2025-088",
      customer_name: "Global Bank Corp",
      description: "Winning proposal for 24x7 technical support and AES-256 encryption.",
      proposal_date: "2025-11-15",
      outcome: "WON",
      status: "APPROVED",
      version_count: 2,
      created_at: new Date().toISOString(),
    },
    {
      id: "prop-2",
      title: "Apex Logistics Cloud RFP 2024",
      proposal_reference: "PROP-2024-042",
      customer_name: "Apex Logistics",
      description: "Historical submission for custom logistics analytics pipeline.",
      proposal_date: "2024-06-20",
      outcome: "LOST",
      status: "APPROVED",
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
      evidence_list: [],
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
      evidence_list: [],
    },
  ]);

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
      ]);
      setSearching(false);
    }, 600);
  };

  const handlePerformProposalSearch = (queryOverride?: string) => {
    const q = queryOverride || propSearchQuery;
    if (!q) return;
    setPropSearching(true);
    setActiveTab("PROPOSAL_SEARCH");

    setTimeout(() => {
      setPropSearchResults([
        {
          section_id: "sec-1",
          proposal_id: "prop-1",
          proposal_title: "Global Bank Corp Enterprise RFP 2025",
          proposal_reference: "PROP-2025-088",
          customer_name: "Global Bank Corp",
          proposal_date: "2025-11-15",
          outcome: "WON",
          status: "APPROVED",
          section_title: "Section 2: Support Services",
          content: "We provide 24x7 live phone and chat technical support coverage with 15-minute response SLA for critical incidents and guaranteed 99.9% uptime availability.",
          final_score: 0.925,
          semantic_score: 0.89,
          lexical_score: 0.95,
          recency_score: 0.85,
          source_metadata: { page: 12, section: "Implementation Approach" },
          source_class: "HISTORICAL PROPOSAL",
        },
      ]);
      setPropSearching(false);
    }, 600);
  };

  const handleCreateProposal = () => {
    if (!newPropTitle || !newPropRef || !newPropContent) return;
    const newP: PreviousProposal = {
      id: `prop-${Date.now()}`,
      title: newPropTitle,
      proposal_reference: newPropRef,
      customer_name: newPropCust || "Enterprise Customer",
      description: newPropContent.substring(0, 100) + "...",
      proposal_date: new Date().toISOString().split("T")[0],
      outcome: newPropOutcome,
      status: "APPROVED",
      version_count: 1,
      created_at: new Date().toISOString(),
    };
    setProposals((prev) => [newP, ...prev]);
    setShowAddProposalModal(false);
    setNewPropTitle("");
    setNewPropRef("");
    setNewPropCust("");
    setNewPropContent("");
  };

  const isProductTeam = role === "PRODUCT_TEAM";
  const approvedPropCount = proposals.filter((p) => p.status === "APPROVED").length;
  const wonPropCount = proposals.filter((p) => p.outcome === "WON").length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <span className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg">⚡</span>
              AI-RFP Intelligence Platform
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Phase 8 — Previous Proposal Intelligence & Historical Evidence Engine
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
              RFP Requirements ({requirements.length})
            </button>
            <button
              onClick={() => setActiveTab("KNOWLEDGE")}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition ${
                activeTab === "KNOWLEDGE"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              Company Knowledge Base
            </button>
            <button
              onClick={() => setActiveTab("PROPOSALS")}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition ${
                activeTab === "PROPOSALS"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              Previous Proposals ({approvedPropCount} Approved)
            </button>
            <button
              onClick={() => setActiveTab("PROPOSAL_SEARCH")}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition ${
                activeTab === "PROPOSAL_SEARCH"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              Historical Proposal Search
            </button>
          </div>

          {isProductTeam && activeTab === "PROPOSALS" && (
            <button
              onClick={() => setShowAddProposalModal(true)}
              className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-indigo-500/20 transition"
            >
              + Add Previous Proposal
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
                      <th className="px-6 py-4 text-right">Evidence Retrieval</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {requirements.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-800/40 transition">
                        <td className="px-6 py-4 font-mono text-xs font-semibold text-blue-400">{req.requirement_code}</td>
                        <td className="px-6 py-4 font-medium text-white max-w-xs">{req.title}</td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-400">{req.category}</td>
                        <td className="px-6 py-4 text-xs font-semibold text-blue-300">{req.requirement_type}</td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            onClick={() => handlePerformRAGSearch(`${req.title} ${req.description}`)}
                            className="px-3 py-1.5 bg-blue-950 hover:bg-blue-900 border border-blue-700 text-blue-200 text-xs font-medium rounded-lg transition"
                          >
                            🛡️ Company Truth
                          </button>
                          <button
                            onClick={() => handlePerformProposalSearch(`${req.title} ${req.description}`)}
                            className="px-3 py-1.5 bg-indigo-950 hover:bg-indigo-900 border border-indigo-700 text-indigo-200 text-xs font-medium rounded-lg transition"
                          >
                            📜 Historical Evidence
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

        {/* TAB: PREVIOUS PROPOSALS */}
        {activeTab === "PROPOSALS" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Proposals</div>
                <div className="text-3xl font-extrabold text-white mt-1">{proposals.length}</div>
              </div>
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Approved (Searchable)</div>
                <div className="text-3xl font-extrabold text-emerald-400 mt-1">{approvedPropCount}</div>
              </div>
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Won Proposals</div>
                <div className="text-3xl font-extrabold text-indigo-400 mt-1">{wonPropCount}</div>
              </div>
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Lost Proposals</div>
                <div className="text-3xl font-extrabold text-amber-400 mt-1">
                  {proposals.filter((p) => p.outcome === "LOST").length}
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-5 border-b border-slate-800 flex justify-between items-center">
                <h2 className="text-base font-semibold text-slate-200">Historical Proposal Repository</h2>
                <span className="text-xs font-mono text-slate-400">pgvector 2048-dim Indexing</span>
              </div>
              <div className="divide-y divide-slate-800">
                {proposals.map((p) => (
                  <div key={p.id} className="p-6 hover:bg-slate-800/40 transition flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-bold text-white text-base">{p.title}</h3>
                        <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                          p.outcome === "WON"
                            ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                            : "bg-amber-950 text-amber-300 border-amber-800"
                        }`}>
                          {p.outcome}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-950 text-blue-300 text-xs font-semibold rounded border border-blue-800">
                          {p.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{p.description}</p>
                      <div className="text-slate-500 text-xs font-mono">
                        Ref: {p.proposal_reference} | Customer: {p.customer_name} | Date: {p.proposal_date}
                      </div>
                    </div>

                    {isProductTeam && (
                      <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition">
                        Manage Versions ({p.version_count})
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: HISTORICAL PROPOSAL SEARCH */}
        {activeTab === "PROPOSAL_SEARCH" && (
          <div className="space-y-6">
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-4">
              <h2 className="text-base font-semibold text-slate-200">Historical Proposal Search Engine</h2>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={propSearchQuery}
                  onChange={(e) => setPropSearchQuery(e.target.value)}
                  placeholder="Enter RFP requirement or historical response query..."
                  className="flex-1 bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <button
                  onClick={() => handlePerformProposalSearch()}
                  disabled={propSearching}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-xl transition shadow-lg shadow-indigo-500/20 whitespace-nowrap"
                >
                  {propSearching ? "Searching Proposals..." : "Search Historical Evidence"}
                </button>
              </div>
            </div>

            {/* Results Display */}
            {propSearchResults.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                  Ranked Historical Proposal Evidence ({propSearchResults.length})
                </h3>

                <div className="space-y-4">
                  {propSearchResults.map((res, idx) => (
                    <div key={res.section_id} className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-lg border-l-4 border-l-indigo-500">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <span className="px-2.5 py-1 bg-indigo-950 text-indigo-300 font-mono text-xs font-bold rounded">
                            HISTORICAL PROPOSAL
                          </span>
                          <h4 className="font-bold text-white text-base">{res.proposal_title}</h4>
                          <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 text-xs font-semibold rounded border border-emerald-800">
                            {res.outcome}
                          </span>
                        </div>
                        <div className="text-right font-mono text-xs">
                          <div className="text-indigo-400 font-bold text-sm">{(res.final_score * 100).toFixed(1)}% Match</div>
                          <div className="text-slate-500">Recency Signal: {(res.recency_score * 100).toFixed(0)}%</div>
                        </div>
                      </div>

                      <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-200 text-xs font-semibold">
                        ⚠️ HISTORICAL EVIDENCE — NOT CURRENT COMPANY TRUTH. Verify current capabilities before reusing.
                      </div>

                      <blockquote className="text-slate-200 text-sm border-l-2 border-indigo-400 pl-4 py-2 bg-slate-950/60 rounded-r-xl">
                        "{res.content}"
                      </blockquote>

                      <div className="text-xs text-slate-500 font-mono flex justify-between">
                        <span>Ref: {res.proposal_reference} | Customer: {res.customer_name}</span>
                        <span>Source Location: {res.source_metadata?.section || "Implementation Section"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal: Add Previous Proposal */}
        {showAddProposalModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-white">Add Previous Proposal</h3>
                <button onClick={() => setShowAddProposalModal(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase">Proposal Title</label>
                  <input
                    type="text"
                    value={newPropTitle}
                    onChange={(e) => setNewPropTitle(e.target.value)}
                    placeholder="e.g. Global Bank Analytics RFP Proposal"
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2 text-sm mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase">Proposal Reference</label>
                    <input
                      type="text"
                      value={newPropRef}
                      onChange={(e) => setNewPropRef(e.target.value)}
                      placeholder="PROP-2025-099"
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase">Outcome</label>
                    <select
                      value={newPropOutcome}
                      onChange={(e) => setNewPropOutcome(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 text-sm mt-1"
                    >
                      <option value="WON">WON</option>
                      <option value="LOST">LOST</option>
                      <option value="NO_DECISION">NO_DECISION</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase">Customer Name</label>
                  <input
                    type="text"
                    value={newPropCust}
                    onChange={(e) => setNewPropCust(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2 text-sm mt-1"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase">Proposal Response Text</label>
                  <textarea
                    rows={4}
                    value={newPropContent}
                    onChange={(e) => setNewPropContent(e.target.value)}
                    placeholder="Enter historical proposal submission text..."
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl p-3 text-sm mt-1"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setShowAddProposalModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateProposal}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-500/20"
                  >
                    Add Proposal & Index Sections
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
