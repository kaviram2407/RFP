"use client";

import React, { useState, useEffect } from "react";
import {
  triggerComplianceAssessmentApi,
  listComplianceAssessmentsApi,
  getRequirementComplianceApi,
  updateRequirementComplianceReviewApi,
  listRequirementsApi,
  RequirementResponse,
  RoleEnum,
} from "../lib/api-client";

interface ComplianceEvidence {
  id: string;
  source_type: string;
  authority_level: string;
  source_title: string;
  source_reference: string;
  evidence_text: string;
  relevance_score: number;
  is_conflicting: boolean;
  conflict_notes?: string;
}

interface GapAnalysis {
  id: string;
  missing_capability: string;
  gap_severity: "HIGH" | "MEDIUM" | "LOW";
  suggested_action: string;
  review_required: boolean;
}

interface RiskAnalysis {
  id: string;
  risk_category: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  likelihood: string;
  impact: string;
  rationale: string;
  mitigation_action: string;
}

interface ComplianceAssessment {
  id: string;
  organization_id: string;
  rfp_project_id: string;
  requirement_id: string;
  status: "COMPLIANT" | "PARTIALLY_COMPLIANT" | "NON_COMPLIANT" | "UNKNOWN" | "REVIEW_REQUIRED";
  confidence_score: number;
  rationale: string;
  unsupported_claims?: string;
  review_required: boolean;
  review_status: "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  reviewer_comments?: string;
  reviewed_by_id?: string;
  reviewed_at?: string;
  created_at: string;
  evidence_list: ComplianceEvidence[];
  gap_analysis?: GapAnalysis;
  risk_analysis?: RiskAnalysis;
}

export function ComplianceWorkspace({ projectId }: { projectId: string }) {
  const [assessments, setAssessments] = useState<ComplianceAssessment[]>([]);
  const [requirements, setRequirements] = useState<RequirementResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [assessing, setAssessing] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<ComplianceAssessment | null>(null);
  const [selectedReq, setSelectedReq] = useState<RequirementResponse | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [reviewFilter, setReviewFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");

  // Review Edit state
  const [editStatus, setEditStatus] = useState<string>("");
  const [editReviewStatus, setEditReviewStatus] = useState<string>("");
  const [editComments, setEditComments] = useState<string>("");
  const [savingReview, setSavingReview] = useState(false);

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assData, reqData] = await Promise.all([
        listComplianceAssessmentsApi(projectId),
        listRequirementsApi(projectId, { page: 1, pageSize: 100 }),
      ]);
      setAssessments(assData);
      setRequirements(reqData.items || []);
    } catch (err) {
      console.error("Failed to load compliance data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunAssessment = async () => {
    setAssessing(true);
    try {
      await triggerComplianceAssessmentApi(projectId);
      await loadData();
    } catch (err) {
      console.error("Failed to run compliance assessment:", err);
    } finally {
      setAssessing(false);
    }
  };

  const handleSelectRequirement = async (req: RequirementResponse) => {
    setSelectedReq(req);
    try {
      const res = await getRequirementComplianceApi(projectId, req.id);
      setSelectedAssessment(res);
      setEditStatus(res.status);
      setEditReviewStatus(res.review_status);
      setEditComments(res.reviewer_comments || "");
    } catch (err) {
      console.error("Failed to load single requirement compliance:", err);
    }
  };

  const handleSaveReview = async () => {
    if (!selectedReq || !selectedAssessment) return;
    setSavingReview(true);
    try {
      const res = await updateRequirementComplianceReviewApi(projectId, selectedReq.id, {
        status: editStatus,
        review_status: editReviewStatus,
        reviewer_comments: editComments,
      });
      setSelectedAssessment(res);
      await loadData();
    } catch (err) {
      console.error("Failed to update review:", err);
    } finally {
      setSavingReview(false);
    }
  };

  const assMap = new Map(assessments.map((a) => [a.requirement_id, a]));

  const combinedRows = requirements.map((req) => ({
    req,
    assessment: assMap.get(req.id) || null,
  }));

  const filteredRows = combinedRows.filter(({ req, assessment }) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchText = (req.requirement_code + " " + req.title + " " + req.description).toLowerCase();
      if (!matchText.includes(q)) return false;
    }
    if (statusFilter !== "ALL") {
      if (!assessment || assessment.status !== statusFilter) return false;
    }
    if (reviewFilter === "NEEDS_REVIEW") {
      if (!assessment || !assessment.review_required) return false;
    } else if (reviewFilter === "APPROVED") {
      if (!assessment || assessment.review_status !== "APPROVED") return false;
    }
    if (severityFilter !== "ALL") {
      if (!assessment?.risk_analysis || assessment.risk_analysis.severity !== severityFilter) return false;
    }
    return true;
  });

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "COMPLIANT":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            ✓ Compliant
          </span>
        );
      case "PARTIALLY_COMPLIANT":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            ⚠ Partial
          </span>
        );
      case "NON_COMPLIANT":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            ✕ Non-Compliant
          </span>
        );
      case "REVIEW_REQUIRED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            🛡 Review Needed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            ? Unknown
          </span>
        );
    }
  };

  const getSeverityBadge = (severity?: string) => {
    if (!severity) return <span className="text-slate-500 text-xs">-</span>;
    switch (severity) {
      case "CRITICAL":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white">CRITICAL</span>;
      case "HIGH":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-600 text-white">HIGH</span>;
      case "MEDIUM":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">MEDIUM</span>;
      case "LOW":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-300">LOW</span>;
      default:
        return <span className="text-slate-500 text-xs">{severity}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-5 rounded-xl backdrop-blur-md">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-indigo-400">🛡</span>
            Compliance & Risk Matrix
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Automated multi-source evidence synthesis, gap analysis, and risk evaluation against current company truth.
          </p>
        </div>
        <button
          onClick={handleRunAssessment}
          disabled={assessing || requirements.length === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-all shadow-lg shadow-indigo-600/20"
        >
          {assessing ? "Evaluating Matrix..." : "✨ Run AI Compliance Assessment"}
        </button>
      </div>

      {/* Filter Controls */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
        <div className="relative flex-1 min-w-[240px]">
          <input
            type="text"
            placeholder="Search requirement code or text..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
        >
          <option value="ALL">All Compliance Statuses</option>
          <option value="COMPLIANT">Compliant</option>
          <option value="PARTIALLY_COMPLIANT">Partially Compliant</option>
          <option value="NON_COMPLIANT">Non-Compliant</option>
          <option value="REVIEW_REQUIRED">Review Needed</option>
          <option value="UNKNOWN">Unknown</option>
        </select>

        <select
          value={reviewFilter}
          onChange={(e) => setReviewFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
        >
          <option value="ALL">All Review Statuses</option>
          <option value="NEEDS_REVIEW">Needs Review</option>
          <option value="APPROVED">Approved</option>
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
        >
          <option value="ALL">All Risk Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </div>

      {/* Main Grid: Data Table + Detail Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Table Column */}
        <div className={selectedAssessment ? "lg:col-span-7" : "lg:col-span-12"}>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Requirement</th>
                    <th className="py-3 px-4">Compliance</th>
                    <th className="py-3 px-4">Risk Severity</th>
                    <th className="py-3 px-4">Review</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Loading compliance matrix...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No requirement compliance records found matching filters.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map(({ req, assessment }) => {
                      const isSelected = selectedReq?.id === req.id;
                      return (
                        <tr
                          key={req.id}
                          onClick={() => handleSelectRequirement(req)}
                          className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
                            isSelected ? "bg-indigo-950/30 border-l-4 border-l-indigo-500" : ""
                          }`}
                        >
                          <td className="py-3.5 px-4 font-mono font-medium text-indigo-300 whitespace-nowrap">
                            {req.requirement_code}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-medium text-white line-clamp-1">{req.title}</div>
                            <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                              <span>{req.category}</span>
                              {req.mandatory && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold">
                                  MANDATORY
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {getStatusBadge(assessment?.status)}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {getSeverityBadge(assessment?.risk_analysis?.severity)}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {assessment?.review_status === "APPROVED" ? (
                              <span className="text-xs text-emerald-400 font-medium">✓ Approved</span>
                            ) : assessment?.review_required ? (
                              <span className="text-xs text-indigo-400 font-medium">🕒 Pending</span>
                            ) : (
                              <span className="text-xs text-slate-500">-</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <span className="text-slate-500">→</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Detail & Review Drawer Column */}
        {selectedReq && selectedAssessment && (
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-5 backdrop-blur-md sticky top-6">
              {/* Top Header */}
              <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                <div>
                  <span className="font-mono text-xs font-semibold text-indigo-400">{selectedReq.requirement_code}</span>
                  <h3 className="text-lg font-bold text-white mt-1">{selectedReq.title}</h3>
                  <p className="text-xs text-slate-400 mt-1">{selectedReq.description}</p>
                </div>
                {getStatusBadge(selectedAssessment.status)}
              </div>

              {/* Rationale & Unsupported Warning */}
              <div className="space-y-3">
                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
                  <div className="text-xs font-semibold text-slate-400 mb-1">
                    ✨ AI Assessment Rationale (Confidence: {Math.round(selectedAssessment.confidence_score * 100)}%)
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed">{selectedAssessment.rationale}</p>
                </div>

                {selectedAssessment.unsupported_claims && (
                  <div className="bg-rose-500/10 border border-rose-500/30 p-3.5 rounded-lg text-rose-300 text-xs">
                    <div className="font-semibold mb-1">🛑 Unsupported Claims Warning</div>
                    {selectedAssessment.unsupported_claims}
                  </div>
                )}
              </div>

              {/* Evidence Section (Multi-source Provenance) */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Multi-Source Evidence</h4>
                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {selectedAssessment.evidence_list.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No evidence chunks linked.</p>
                  ) : (
                    selectedAssessment.evidence_list.map((ev) => (
                      <div
                        key={ev.id}
                        className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                          ev.source_type === "COMPANY_KNOWLEDGE"
                            ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-200"
                            : ev.source_type === "PREVIOUS_PROPOSAL"
                            ? "bg-amber-950/20 border-amber-500/30 text-amber-200"
                            : "bg-slate-950 border-slate-800 text-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">
                            {ev.source_type === "COMPANY_KNOWLEDGE" && "📘 "}
                            {ev.source_type === "PREVIOUS_PROPOSAL" && "📜 "}
                            {ev.source_type === "CURRENT_RFP" && "📄 "}
                            {ev.source_title}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              ev.authority_level === "AUTHORITATIVE"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            }`}
                          >
                            {ev.authority_level === "AUTHORITATIVE" ? "AUTHORITATIVE" : "HISTORICAL / REFERENCE"}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-slate-300">{ev.evidence_text}</p>
                        <div className="text-[10px] text-slate-400 font-mono">Ref: {ev.source_reference}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Gap Analysis Card */}
              {selectedAssessment.gap_analysis && (
                <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
                    <span>⚠️ Gap Analysis</span>
                    {getSeverityBadge(selectedAssessment.gap_analysis.gap_severity)}
                  </div>
                  <p className="text-xs text-amber-200">{selectedAssessment.gap_analysis.missing_capability}</p>
                  <div className="text-xs text-amber-300/80 font-medium">
                    Suggested Action: {selectedAssessment.gap_analysis.suggested_action}
                  </div>
                </div>
              )}

              {/* Risk Analysis Card */}
              {selectedAssessment.risk_analysis && (
                <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                    <span>🛡 Risk Analysis ({selectedAssessment.risk_analysis.risk_category})</span>
                    {getSeverityBadge(selectedAssessment.risk_analysis.severity)}
                  </div>
                  <p className="text-xs text-slate-300">{selectedAssessment.risk_analysis.rationale}</p>
                  <div className="text-xs text-indigo-300 font-medium">
                    Mitigation: {selectedAssessment.risk_analysis.mitigation_action}
                  </div>
                </div>
              )}

              {/* Human Review Panel */}
              <div className="border-t border-slate-800 pt-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  👤 Human-in-the-Loop Review
                </h4>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Override Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                    >
                      <option value="COMPLIANT">COMPLIANT</option>
                      <option value="PARTIALLY_COMPLIANT">PARTIALLY_COMPLIANT</option>
                      <option value="NON_COMPLIANT">NON_COMPLIANT</option>
                      <option value="REVIEW_REQUIRED">REVIEW_REQUIRED</option>
                      <option value="UNKNOWN">UNKNOWN</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Review Status</label>
                    <select
                      value={editReviewStatus}
                      onChange={(e) => setEditReviewStatus(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                    >
                      <option value="PENDING">PENDING</option>
                      <option value="IN_REVIEW">IN_REVIEW</option>
                      <option value="APPROVED">APPROVED</option>
                      <option value="REJECTED">REJECTED</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 text-xs font-medium">Reviewer Comments</label>
                  <textarea
                    rows={2}
                    value={editComments}
                    onChange={(e) => setEditComments(e.target.value)}
                    placeholder="Add architectural notes or justification..."
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 placeholder-slate-600"
                  />
                </div>

                <button
                  onClick={handleSaveReview}
                  disabled={savingReview}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  {savingReview ? "Saving..." : "Save Review Decision"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
