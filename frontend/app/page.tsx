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

export default function RFPPlatformPage() {
  const [role, setRole] = useState<"PRODUCT_TEAM" | "VP" | "CTO" | "CEO">("PRODUCT_TEAM");
  const [activeTab, setActiveTab] = useState<"DOCUMENTS" | "REQUIREMENTS">("REQUIREMENTS");
  
  // Requirement Filters
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Selection state
  const [selectedRequirement, setSelectedRequirement] = useState<Requirement | null>(null);
  const [extracting, setExtracting] = useState<boolean>(false);

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
    {
      id: "req-3",
      requirement_code: "REQ-0003",
      title: "Optional On-Premise Air-Gapped Deployment",
      description: "Supplier should ideally support air-gapped on-premise Kubernetes deployments upon enterprise customer request.",
      category: "TECHNICAL",
      requirement_type: "OPTIONAL",
      priority: "MEDIUM",
      mandatory: false,
      confidence_score: 0.65,
      status: "REVIEW_REQUIRED",
      review_required: true,
      evidence_list: [
        {
          id: "ev-3",
          content_block_id: "block-3",
          evidence_text: "Supplier should ideally support air-gapped on-premise deployment options.",
          source_type: "CURRENT_RFP",
          source_reference: "SHEET: Compliance Matrix",
          relevance_score: 0.8,
        },
      ],
    },
  ]);

  const handleTriggerExtraction = () => {
    setExtracting(true);
    setTimeout(() => {
      setExtracting(false);
      alert("AI Requirement Extraction completed! 3 requirements extracted and evidence linked.");
    }, 1500);
  };

  const handleReviewAction = (reqId: string, newStatus: "ACCEPTED" | "REJECTED") => {
    setRequirements((prev) =>
      prev.map((r) =>
        r.id === reqId
          ? { ...r, status: newStatus, review_required: false }
          : r
      )
    );
    if (selectedRequirement && selectedRequirement.id === reqId) {
      setSelectedRequirement((prev) =>
        prev ? { ...prev, status: newStatus, review_required: false } : null
      );
    }
  };

  const filteredRequirements = requirements.filter((r) => {
    if (categoryFilter !== "ALL" && r.category !== categoryFilter) return false;
    if (priorityFilter !== "ALL" && r.priority !== priorityFilter) return false;
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    return true;
  });

  const isProductTeam = role === "PRODUCT_TEAM";

  // Summary Metrics
  const totalReqs = requirements.length;
  const mandatoryCount = requirements.filter((r) => r.mandatory).length;
  const criticalCount = requirements.filter((r) => r.priority === "CRITICAL").length;
  const reviewRequiredCount = requirements.filter((r) => r.review_required).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <span className="p-2 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">🤖</span>
              AI-RFP Requirement Extraction & Evidence Traceability
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Phase 6 — NVIDIA NIM <code className="text-blue-300 font-mono text-xs">openai/gpt-oss-120b</code> Structured Extraction Engine
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

        {/* Navigation Tabs */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab("REQUIREMENTS")}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition ${
                activeTab === "REQUIREMENTS"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              Extracted Requirements ({totalReqs})
            </button>
            <button
              onClick={() => setActiveTab("DOCUMENTS")}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition ${
                activeTab === "DOCUMENTS"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              Source Documents ({documents.length})
            </button>
          </div>

          {isProductTeam && activeTab === "REQUIREMENTS" && (
            <button
              onClick={handleTriggerExtraction}
              disabled={extracting}
              className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-indigo-500/20 transition flex items-center gap-2"
            >
              {extracting ? "Extracting Requirements..." : "⚡ Run AI Requirement Extraction"}
            </button>
          )}
        </div>

        {activeTab === "REQUIREMENTS" && (
          <div className="space-y-6">
            
            {/* Metric Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Requirements</div>
                <div className="text-3xl font-extrabold text-white mt-1">{totalReqs}</div>
              </div>
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Mandatory</div>
                <div className="text-3xl font-extrabold text-blue-400 mt-1">{mandatoryCount}</div>
              </div>
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Critical Priority</div>
                <div className="text-3xl font-extrabold text-red-400 mt-1">{criticalCount}</div>
              </div>
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Review Required</div>
                <div className="text-3xl font-extrabold text-amber-400 mt-1">{reviewRequiredCount}</div>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-center gap-4 text-xs font-medium">
              <span className="text-slate-400 font-semibold uppercase tracking-wider">Filter By:</span>
              
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Category:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
                >
                  <option value="ALL">All Categories</option>
                  <option value="SUPPORT">SUPPORT</option>
                  <option value="SECURITY">SECURITY</option>
                  <option value="TECHNICAL">TECHNICAL</option>
                  <option value="COMPLIANCE">COMPLIANCE</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-400">Priority:</span>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
                >
                  <option value="ALL">All Priorities</option>
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-400">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="EXTRACTED">EXTRACTED</option>
                  <option value="REVIEW_REQUIRED">REVIEW_REQUIRED</option>
                  <option value="ACCEPTED">ACCEPTED</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </div>
            </div>

            {/* Requirements Table */}
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
                      <th className="px-6 py-4">Confidence</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredRequirements.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-800/40 transition">
                        <td className="px-6 py-4 font-mono text-xs font-semibold text-blue-400">{req.requirement_code}</td>
                        <td className="px-6 py-4 font-medium text-white max-w-xs truncate">{req.title}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs font-mono rounded border border-slate-700">
                            {req.category}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${
                            req.mandatory
                              ? "bg-blue-950 text-blue-300 border-blue-800"
                              : "bg-slate-800 text-slate-400 border-slate-700"
                          }`}>
                            {req.requirement_type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${
                            req.priority === "CRITICAL"
                              ? "bg-red-950 text-red-300 border-red-800"
                              : req.priority === "HIGH"
                              ? "bg-amber-950 text-amber-300 border-amber-800"
                              : "bg-slate-800 text-slate-400 border-slate-700"
                          }`}>
                            {req.priority}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-300">
                          {(req.confidence_score * 100).toFixed(0)}%
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border inline-flex items-center gap-1 ${
                            req.status === "ACCEPTED"
                              ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                              : req.status === "REJECTED"
                              ? "bg-red-950 text-red-300 border-red-800"
                              : req.status === "REVIEW_REQUIRED"
                              ? "bg-amber-950 text-amber-300 border-amber-800"
                              : "bg-slate-800 text-slate-300 border-slate-700"
                          }`}>
                            {req.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-3">
                          <button
                            onClick={() => setSelectedRequirement(req)}
                            className="text-xs text-blue-400 hover:text-blue-300 font-medium hover:underline"
                          >
                            View Evidence
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

        {activeTab === "DOCUMENTS" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl p-6">
            <h2 className="text-base font-semibold text-slate-200 mb-4">Source RFP Documents</h2>
            <ul className="divide-y divide-slate-800">
              {documents.map((d) => (
                <li key={d.id} className="py-4 flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-white">{d.name}</div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      Type: {d.document_type} | Version: v{d.current_version?.version_number} | Extraction Status: {d.current_version?.extraction_status || "PENDING"}
                    </div>
                  </div>
                  <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                    {d.current_version?.processing_status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Evidence Traceability & Human Review Modal/Drawer */}
        {selectedRequirement && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl">
              
              <div className="flex justify-between items-start border-b border-slate-800 pb-4">
                <div>
                  <span className="text-xs font-mono text-blue-400 font-semibold">{selectedRequirement.requirement_code}</span>
                  <h3 className="text-lg font-bold text-white mt-1">{selectedRequirement.title}</h3>
                </div>
                <button
                  onClick={() => setSelectedRequirement(null)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Description & Classification Badges */}
              <div className="space-y-3">
                <p className="text-slate-300 text-sm">{selectedRequirement.description}</p>
                <div className="flex flex-wrap gap-2 text-xs font-medium">
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700">
                    Category: {selectedRequirement.category}
                  </span>
                  <span className="px-2.5 py-1 bg-blue-950 text-blue-300 rounded border border-blue-800">
                    Type: {selectedRequirement.requirement_type}
                  </span>
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700">
                    Priority: {selectedRequirement.priority}
                  </span>
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700">
                    Confidence: {(selectedRequirement.confidence_score * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Linked Authoritative Evidence Panel */}
              <div className="space-y-3">
                <h4 className="text-xs uppercase font-bold tracking-wider text-slate-400">Authoritative RFP Source Evidence</h4>
                {selectedRequirement.evidence_list.map((ev) => (
                  <div key={ev.id} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex justify-between items-center text-xs font-mono text-slate-400">
                      <span className="text-blue-400 font-semibold">📍 Source Reference: {ev.source_reference}</span>
                      <span>Source: {ev.source_type}</span>
                    </div>
                    <blockquote className="text-xs italic text-slate-200 border-l-2 border-blue-500 pl-3 py-1 bg-slate-900/50 rounded-r-lg">
                      "{ev.evidence_text}"
                    </blockquote>
                  </div>
                ))}
              </div>

              {/* Human Review Actions */}
              {isProductTeam && (
                <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-xs text-slate-400">Human-in-the-Loop Review:</span>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleReviewAction(selectedRequirement.id, "REJECTED")}
                      className="px-4 py-2 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 font-semibold text-xs rounded-xl transition"
                    >
                      Reject Requirement
                    </button>
                    <button
                      onClick={() => handleReviewAction(selectedRequirement.id, "ACCEPTED")}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl transition shadow-lg shadow-emerald-500/20"
                    >
                      Accept Requirement
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
