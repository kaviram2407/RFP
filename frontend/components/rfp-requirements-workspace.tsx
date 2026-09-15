"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  RequirementResponse,
  RequirementEvidenceResponse,
  RequirementCategoryEnum,
  RequirementTypeEnum,
  RequirementPriorityEnum,
  RequirementStatusEnum,
  ExtractionStatusEnum,
  RoleEnum,
  listRequirementsApi,
  triggerRequirementExtractionApi,
  getRequirementExtractionStatusApi,
  getRequirementEvidenceApi,
  updateRequirementApi,
  RequirementUpdate,
} from "@/lib/api-client";

interface RFPRequirementsWorkspaceProps {
  projectId: string;
  projectName: string;
  userRole: RoleEnum;
}

const CATEGORY_OPTIONS: RequirementCategoryEnum[] = [
  "FUNCTIONAL",
  "TECHNICAL",
  "SECURITY",
  "COMPLIANCE",
  "LEGAL",
  "COMMERCIAL",
  "FINANCIAL",
  "OPERATIONAL",
  "SUPPORT",
  "IMPLEMENTATION",
  "GENERAL",
];

const TYPE_OPTIONS: RequirementTypeEnum[] = ["MANDATORY", "OPTIONAL", "INFORMATIONAL"];
const PRIORITY_OPTIONS: RequirementPriorityEnum[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const STATUS_OPTIONS: RequirementStatusEnum[] = [
  "EXTRACTED",
  "REVIEW_REQUIRED",
  "ACCEPTED",
  "REJECTED",
];

export default function RFPRequirementsWorkspace({
  projectId,
  projectName,
  userRole,
}: RFPRequirementsWorkspaceProps) {
  const isProductTeam = userRole === "PRODUCT_TEAM";

  const [requirements, setRequirements] = useState<RequirementResponse[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Extraction State
  const [extractionStatus, setExtractionStatus] = useState<ExtractionStatusEnum>("PENDING");
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState<boolean>(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Filter States
  const [filterCategory, setFilterCategory] = useState<RequirementCategoryEnum | "">("");
  const [filterType, setFilterType] = useState<RequirementTypeEnum | "">("");
  const [filterPriority, setFilterPriority] = useState<RequirementPriorityEnum | "">("");
  const [filterStatus, setFilterStatus] = useState<RequirementStatusEnum | "">("");
  const [filterReviewRequired, setFilterReviewRequired] = useState<boolean | undefined>(undefined);

  // Detail & Evidence Modal State
  const [selectedReq, setSelectedReq] = useState<RequirementResponse | null>(null);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [evidenceList, setEvidenceList] = useState<RequirementEvidenceResponse[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState<boolean>(false);

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editReq, setEditReq] = useState<RequirementResponse | null>(null);
  const [editForm, setEditForm] = useState<RequirementUpdate>({});
  const [editSubmitting, setEditSubmitting] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // 1. Fetch Requirements List
  const fetchRequirements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listRequirementsApi(projectId, {
        page: 1,
        pageSize: 100,
        category: filterCategory || undefined,
        requirement_type: filterType || undefined,
        priority: filterPriority || undefined,
        status: filterStatus || undefined,
        review_required: filterReviewRequired,
      });
      setRequirements(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.detail || "Failed to load RFP requirements.");
    } finally {
      setLoading(false);
    }
  }, [projectId, filterCategory, filterType, filterPriority, filterStatus, filterReviewRequired]);

  // 2. Fetch Extraction Status
  const fetchExtractionStatus = useCallback(async () => {
    try {
      const res = await getRequirementExtractionStatusApi(projectId);
      setExtractionStatus(res.status);
      if (res.error) setExtractionError(res.error);
    } catch {
      // silent
    }
  }, [projectId]);

  useEffect(() => {
    fetchRequirements();
    fetchExtractionStatus();
  }, [fetchRequirements, fetchExtractionStatus]);

  // 3. Polling for Extraction Status when PENDING or PROCESSING
  useEffect(() => {
    if (extractionStatus === "PROCESSING" || extractionStatus === "PENDING") {
      if (!pollTimerRef.current) {
        pollTimerRef.current = setInterval(async () => {
          try {
            const statusRes = await getRequirementExtractionStatusApi(projectId);
            setExtractionStatus(statusRes.status);
            if (statusRes.error) setExtractionError(statusRes.error);

            if (statusRes.status === "COMPLETED") {
              await fetchRequirements();
              if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
              }
            } else if (statusRes.status === "FAILED") {
              if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
              }
            }
          } catch {
            // silent catch during polling
          }
        }, 3000);
      }
    } else if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [extractionStatus, projectId, fetchRequirements]);

  // 4. Trigger AI Requirement Extraction
  const handleTriggerExtraction = async () => {
    setExtracting(true);
    setExtractionError(null);
    try {
      const res = await triggerRequirementExtractionApi(projectId);
      setExtractionStatus(res.status);
      if (res.status === "COMPLETED") {
        await fetchRequirements();
      }
    } catch (err: any) {
      setExtractionError(err?.detail || "Requirement extraction trigger failed. Ensure document is processed first.");
    } finally {
      setExtracting(false);
    }
  };

  // 5. Open Requirement Detail & Fetch Evidence
  const handleOpenDetail = async (req: RequirementResponse) => {
    setSelectedReq(req);
    setShowDetailModal(true);
    setEvidenceLoading(true);
    try {
      const ev = await getRequirementEvidenceApi(projectId, req.id);
      setEvidenceList(ev);
    } catch {
      setEvidenceList(req.evidence_list || []);
    } finally {
      setEvidenceLoading(false);
    }
  };

  // 6. Open Edit Requirement Modal
  const handleOpenEdit = (req: RequirementResponse) => {
    setEditReq(req);
    setEditForm({
      title: req.title,
      description: req.description,
      category: req.category,
      requirement_type: req.requirement_type,
      priority: req.priority,
      mandatory: req.mandatory,
      status: req.status,
      review_required: req.review_required,
    });
    setEditError(null);
    setShowEditModal(true);
  };

  // 7. Save Requirement Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editReq) return;

    setEditSubmitting(true);
    setEditError(null);
    try {
      await updateRequirementApi(projectId, editReq.id, editForm);
      setShowEditModal(false);
      setEditReq(null);
      await fetchRequirements();
    } catch (err: any) {
      setEditError(err?.detail || "Failed to update requirement.");
    } finally {
      setEditSubmitting(false);
    }
  };

  // Helper for status update shortcut (Accept/Reject)
  const handleQuickStatusUpdate = async (req: RequirementResponse, newStatus: RequirementStatusEnum) => {
    try {
      await updateRequirementApi(projectId, req.id, {
        status: newStatus,
        review_required: newStatus === "REVIEW_REQUIRED",
      });
      await fetchRequirements();
    } catch (err: any) {
      alert(`Status update failed: ${err?.detail || "Error updating requirement"}`);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      
      {/* Workspace Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-slate-800 gap-4">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <span>🧠</span> AI Requirement Intelligence
          </h3>
          <p className="text-xs text-slate-400">
            Powered by backend <span className="text-blue-300 font-semibold font-mono">nvidia/nemotron-3-super-120b-a12b</span> for <span className="text-slate-200 font-semibold">{projectName}</span>
          </p>
        </div>

        {/* Action Button & Status Pill */}
        <div className="flex items-center gap-3">
          
          {/* Status Badge */}
          <span className={`px-3 py-1.5 font-mono text-xs font-bold rounded-xl border flex items-center gap-1.5 ${
            extractionStatus === "COMPLETED"
              ? "bg-emerald-950 text-emerald-300 border-emerald-800"
              : extractionStatus === "PROCESSING"
              ? "bg-blue-950 text-blue-300 border-blue-800 animate-pulse"
              : extractionStatus === "FAILED"
              ? "bg-red-950 text-red-300 border-red-800"
              : "bg-slate-800 text-slate-300 border-slate-700"
          }`}>
            {extractionStatus === "PROCESSING" && (
              <svg className="animate-spin h-3.5 w-3.5 text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            <span>AI Status: {extractionStatus}</span>
          </span>

          {/* Extract Requirements Button (Product Team) */}
          {isProductTeam ? (
            <button
              onClick={handleTriggerExtraction}
              disabled={extracting || extractionStatus === "PROCESSING"}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-blue-500/20 transition flex items-center gap-2 disabled:opacity-50"
            >
              {extracting || extractionStatus === "PROCESSING" ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Extracting with NVIDIA...</span>
                </>
              ) : (
                <>
                  <span>✨ Extract Requirements</span>
                </>
              )}
            </button>
          ) : (
            <span className="px-3 py-1.5 bg-slate-800 text-slate-400 border border-slate-700 text-xs font-semibold rounded-xl">
              Read-Only Access
            </span>
          )}

        </div>
      </div>

      {/* Extraction Error Alert */}
      {extractionError && (
        <div className="p-4 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl flex justify-between items-center">
          <div>⚠️ Extraction Alert: {extractionError}</div>
          <button onClick={() => setExtractionError(null)} className="text-red-300 hover:text-white font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
        <div className="text-xs font-mono uppercase text-slate-400 font-semibold flex items-center gap-2">
          <span>🔍</span> Filter Structured Requirements ({total})
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs">
          
          {/* Category Filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Categories</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Types</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Priorities</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Review Required Toggle */}
          <label className="flex items-center gap-2 bg-slate-900 border border-slate-800 text-slate-300 rounded-lg px-3 py-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterReviewRequired === true}
              onChange={(e) => setFilterReviewRequired(e.target.checked ? true : undefined)}
              className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0"
            />
            <span className="truncate">Review Needed Only</span>
          </label>

        </div>
      </div>

      {/* Main Requirements Display */}
      {loading ? (
        <div className="p-12 text-center space-y-3">
          <svg className="animate-spin h-8 w-8 text-blue-500 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-xs font-mono text-slate-400">Loading requirements from PostgreSQL database...</p>
        </div>
      ) : requirements.length === 0 ? (

        /* Empty State */
        <div className="p-12 border border-dashed border-slate-800 rounded-xl text-center space-y-3 bg-slate-950/50">
          <div className="text-3xl">📝</div>
          <h4 className="text-sm font-bold text-white">No requirements extracted yet.</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Click &quot;Extract Requirements&quot; above to process your uploaded RFP document using NVIDIA Nemotron 3 Super 120B.
          </p>
          {isProductTeam && (
            <button
              onClick={handleTriggerExtraction}
              disabled={extracting || extractionStatus === "PROCESSING"}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50"
            >
              Extract Requirements Now
            </button>
          )}
        </div>

      ) : (

        /* Requirements Table */
        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/60">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Requirement Title</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Confidence</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-xs">
                {requirements.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-900/50 transition">
                    
                    {/* Code */}
                    <td className="py-3 px-4 font-mono font-bold text-blue-300">
                      {req.requirement_code}
                    </td>

                    {/* Title & Description */}
                    <td className="py-3 px-4">
                      <div className="space-y-1 max-w-md">
                        <div className="font-semibold text-slate-100 flex items-center gap-2">
                          <span>{req.title}</span>
                          {req.review_required && (
                            <span className="px-1.5 py-0.5 bg-amber-950 text-amber-300 border border-amber-800 text-[9px] font-mono font-bold rounded">
                              Review Needed
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2">
                          {req.description}
                        </p>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 font-mono text-[10px] font-bold rounded border bg-slate-800 text-slate-300 border-slate-700">
                        {req.category}
                      </span>
                    </td>

                    {/* Type Badge */}
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 font-mono text-[10px] font-bold rounded border ${
                        req.requirement_type === "MANDATORY"
                          ? "bg-red-950 text-red-300 border-red-800"
                          : req.requirement_type === "OPTIONAL"
                          ? "bg-blue-950 text-blue-300 border-blue-800"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}>
                        {req.requirement_type}
                      </span>
                    </td>

                    {/* Priority */}
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 font-mono text-[10px] font-bold rounded border ${
                        req.priority === "CRITICAL"
                          ? "bg-red-950 text-red-300 border-red-800"
                          : req.priority === "HIGH"
                          ? "bg-amber-950 text-amber-300 border-amber-800"
                          : req.priority === "MEDIUM"
                          ? "bg-blue-950 text-blue-300 border-blue-800"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}>
                        {req.priority}
                      </span>
                    </td>

                    {/* Confidence */}
                    <td className="py-3 px-4 font-mono">
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full ${
                              req.confidence_score >= 0.85
                                ? "bg-emerald-400"
                                : req.confidence_score >= 0.65
                                ? "bg-amber-400"
                                : "bg-red-400"
                            }`}
                            style={{ width: `${Math.round(req.confidence_score * 100)}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-slate-300">
                          {Math.round(req.confidence_score * 100)}%
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 font-mono text-[10px] font-bold rounded border ${
                        req.status === "ACCEPTED"
                          ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                          : req.status === "REJECTED"
                          ? "bg-red-950 text-red-300 border-red-800"
                          : req.status === "REVIEW_REQUIRED"
                          ? "bg-amber-950 text-amber-300 border-amber-800"
                          : "bg-blue-950 text-blue-300 border-blue-800"
                      }`}>
                        {req.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        
                        {/* Detail / Evidence Button */}
                        <button
                          onClick={() => handleOpenDetail(req)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px] rounded-lg border border-slate-700 transition"
                          title="View Authoritative Evidence"
                        >
                          Evidence
                        </button>

                        {/* Quick Accept (Product Team) */}
                        {isProductTeam && req.status !== "ACCEPTED" && (
                          <button
                            onClick={() => handleQuickStatusUpdate(req, "ACCEPTED")}
                            className="px-2 py-1 bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 font-semibold text-[11px] rounded-lg transition"
                            title="Accept Requirement"
                          >
                            Accept
                          </button>
                        )}

                        {/* Edit Button (Product Team) */}
                        {isProductTeam && (
                          <button
                            onClick={() => handleOpenEdit(req)}
                            className="px-2.5 py-1 bg-blue-950/60 hover:bg-blue-900 border border-blue-800 text-blue-200 font-semibold text-[11px] rounded-lg transition"
                          >
                            Edit
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

      {/* ========================================================================
          REQUIREMENT DETAIL & AUTHORITATIVE EVIDENCE MODAL
         ======================================================================== */}
      {showDetailModal && selectedReq && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-3xl w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-mono font-bold text-blue-400">{selectedReq.requirement_code}</span>
                  <h3 className="text-lg font-bold text-white">{selectedReq.title}</h3>
                </div>
                <p className="text-xs text-slate-400">Extracted from Authoritative RFP Document</p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Classification Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <div className="text-[10px] text-slate-500 uppercase">Category</div>
                <div className="font-bold text-slate-200">{selectedReq.category}</div>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <div className="text-[10px] text-slate-500 uppercase">Requirement Type</div>
                <div className="font-bold text-blue-300">{selectedReq.requirement_type}</div>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <div className="text-[10px] text-slate-500 uppercase">Priority</div>
                <div className="font-bold text-amber-300">{selectedReq.priority}</div>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <div className="text-[10px] text-slate-500 uppercase">Confidence</div>
                <div className="font-bold text-emerald-300">{Math.round(selectedReq.confidence_score * 100)}%</div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase">Full Requirement Text</h4>
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                {selectedReq.description}
              </div>
            </div>

            {/* Authoritative Evidence Section */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                <span>📌</span> Authoritative RFP Source Evidence ({evidenceList.length})
              </h4>

              {evidenceLoading ? (
                <div className="p-6 text-center text-xs font-mono text-slate-400">Fetching document evidence...</div>
              ) : evidenceList.length === 0 ? (
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-400 text-center">
                  No source evidence linked for this requirement.
                </div>
              ) : (
                <div className="space-y-3">
                  {evidenceList.map((ev) => (
                    <div key={ev.id} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 border-b border-slate-800/80 pb-1.5">
                        <span className="text-blue-300 font-bold">Source: {ev.source_type} ({ev.source_reference})</span>
                        <span>Relevance: {Math.round(ev.relevance_score * 100)}%</span>
                      </div>
                      <div className="text-xs text-slate-200 font-serif italic border-l-2 border-blue-500 pl-3 py-1">
                        &quot;{ev.evidence_text}&quot;
                      </div>
                      <div className="text-[9px] font-mono text-slate-600">
                        Content Block UUID: {ev.content_block_id}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================
          REQUIREMENT EDIT MODAL
         ======================================================================== */}
      {showEditModal && editReq && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>✏️</span> Edit Requirement {editReq.requirement_code}
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl">
                ⚠️ {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              
              {/* Title */}
              <div className="space-y-1">
                <label className="text-slate-400 font-semibold uppercase">Title</label>
                <input
                  type="text"
                  value={editForm.title || ""}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-slate-400 font-semibold uppercase">Description</label>
                <textarea
                  rows={3}
                  value={editForm.description || ""}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              {/* Category & Type */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold uppercase">Category</label>
                  <select
                    value={editForm.category || ""}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold uppercase">Type</label>
                  <select
                    value={editForm.requirement_type || ""}
                    onChange={(e) => setEditForm({ ...editForm, requirement_type: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
                  >
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Priority & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold uppercase">Priority</label>
                  <select
                    value={editForm.priority || ""}
                    onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold uppercase">Status</label>
                  <select
                    value={editForm.status || ""}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Review Required Checkbox */}
              <label className="flex items-center gap-2 pt-1 cursor-pointer select-none text-slate-300">
                <input
                  type="checkbox"
                  checked={editForm.review_required || false}
                  onChange={(e) => setEditForm({ ...editForm, review_required: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0"
                />
                <span>Requires Human Review</span>
              </label>

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50"
                >
                  {editSubmitting ? "Saving to PostgreSQL..." : "Save Changes"}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
