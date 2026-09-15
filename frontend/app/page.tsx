"use client";

import { useState } from "react";
import { useAuth } from "../lib/auth-context";
import { LoginPage } from "../components/login-page";
import { RFPProjectsWorkspace } from "../components/rfp-projects-workspace";
import CompanyKnowledgeWorkspace from "../components/company-knowledge-workspace";

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
  const { user, loading, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<"PROJECTS" | "REQUIREMENTS" | "KNOWLEDGE" | "PROPOSALS" | "SEARCH" | "PROPOSAL_SEARCH">("PROJECTS");

  // RAG Search State
  const [searchQuery, setSearchQuery] = useState<string>("SOC2 Type II compliance and AES-256 data encryption");
  const [searchResults, setSearchResults] = useState<HybridSearchResult[]>([]);
  const [searching, setSearching] = useState<boolean>(false);

  // Proposal Search State
  const [propSearchQuery, setPropSearchQuery] = useState<string>("24x7 phone chat technical support with guaranteed 99.9% uptime SLA");
  const [propSearchResults, setPropSearchResults] = useState<HistoricalProposalResult[]>([]);
  const [propSearching, setPropSearching] = useState<boolean>(false);

  // Modals & Form
  const [showAddProposalModal, setShowAddProposalModal] = useState<boolean>(false);

  // Proposal Form
  const [newPropTitle, setNewPropTitle] = useState("");
  const [newPropRef, setNewPropRef] = useState("");
  const [newPropCust, setNewPropCust] = useState("");
  const [newPropOutcome, setNewPropOutcome] = useState<"WON" | "LOST" | "NO_DECISION">("WON");
  const [newPropContent, setNewPropContent] = useState("");

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
  ]);

  const [requirements] = useState<Requirement[]>([
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
  ]);

  // Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center space-y-4">
        <svg className="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-sm font-mono text-slate-400">Verifying session with FastAPI backend...</p>
      </div>
    );
  }

  // Unauthenticated -> Show Login Page
  if (!user) {
    return <LoginPage />;
  }

  // Authenticated State -> Derived from real backend user role
  const isProductTeam = user.role === "PRODUCT_TEAM";
  const approvedPropCount = proposals.filter((p) => p.status === "APPROVED").length;
  const wonPropCount = proposals.filter((p) => p.outcome === "WON").length;

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
              F2 — Real RFP Project Management & Organization Workspace
            </p>
          </div>

          {/* User & Backend RBAC Session Card */}
          <div className="flex items-center gap-4 bg-slate-900 border border-slate-800 p-3 rounded-2xl shadow-lg">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow">
                {user.full_name ? user.full_name.charAt(0).toUpperCase() : "U"}
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>{user.full_name}</span>
                  <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-md border ${
                    user.role === "PRODUCT_TEAM"
                      ? "bg-blue-950 text-blue-300 border-blue-800"
                      : user.role === "VP"
                      ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                      : user.role === "CTO"
                      ? "bg-indigo-950 text-indigo-300 border-indigo-800"
                      : "bg-purple-950 text-purple-300 border-purple-800"
                  }`}>
                    {user.role}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">{user.email}</div>
              </div>
            </div>

            <button
              onClick={logout}
              className="px-3 py-1.5 bg-slate-800 hover:bg-red-950 hover:text-red-300 border border-slate-700 hover:border-red-800 text-slate-300 text-xs font-semibold rounded-xl transition"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Main Navigation Tabs */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-4 gap-4">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setActiveTab("PROJECTS")}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition flex items-center gap-2 ${
                activeTab === "PROJECTS"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              <span>📁</span> RFP Projects (Real API)
            </button>
            <button
              onClick={() => setActiveTab("REQUIREMENTS")}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition ${
                activeTab === "REQUIREMENTS"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              RFP Requirements
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
              Previous Proposals
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
        </div>

        {/* TAB: REAL RFP PROJECTS WORKSPACE (F2) */}
        {activeTab === "PROJECTS" && <RFPProjectsWorkspace />}

        {/* TAB: REAL COMPANY KNOWLEDGE & HYBRID RAG SEARCH (F5) */}
        {activeTab === "KNOWLEDGE" && <CompanyKnowledgeWorkspace userRole={user.role} />}

        {/* TAB: REQUIREMENTS (Mock - Scheduled for F4) */}
        {activeTab === "REQUIREMENTS" && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                <span className="text-xs font-mono text-slate-400">RFP Requirements View (Mock - F4 Integration Pending)</span>
              </div>
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

        {/* TAB: PREVIOUS PROPOSALS (Mock - Scheduled for F6) */}
        {activeTab === "PROPOSALS" && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-5 border-b border-slate-800 flex justify-between items-center">
                <h2 className="text-base font-semibold text-slate-200">Historical Proposal Repository (Mock - F6 Integration Pending)</h2>
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
                      </div>
                      <p className="text-xs text-slate-400">{p.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: HISTORICAL PROPOSAL SEARCH (Mock - Scheduled for F6) */}
        {activeTab === "PROPOSAL_SEARCH" && (
          <div className="space-y-6">
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-4">
              <h2 className="text-base font-semibold text-slate-200">Historical Proposal Search Engine (Mock - F6 Pending)</h2>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={propSearchQuery}
                  onChange={(e) => setPropSearchQuery(e.target.value)}
                  placeholder="Enter RFP requirement query..."
                  className="flex-1 bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 text-sm"
                />
                <button
                  onClick={() => handlePerformProposalSearch()}
                  disabled={propSearching}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-xl"
                >
                  {propSearching ? "Searching..." : "Search Historical Evidence"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
