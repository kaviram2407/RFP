"use client";

import React, { useState, useEffect } from "react";
import {
  ProposalVersionResponse,
  ProposalApprovalResponse,
  ProposalApprovalStatusResponse,
  submitProposalVersionForReviewApi,
  reviewProposalVersionApi,
  getProposalApprovalStatusApi,
  getProposalApprovalHistoryApi,
  createProposalRevisionApi,
  ApiError,
} from "../lib/api-client";

interface ProposalApprovalWorkflowProps {
  proposalId: string;
  version: ProposalVersionResponse;
  userRole: string;
  onVersionUpdated: (updatedVersion: ProposalVersionResponse) => void;
}

export function ProposalApprovalWorkflow({
  proposalId,
  version,
  userRole,
  onVersionUpdated,
}: ProposalApprovalWorkflowProps) {
  const [approvalStatus, setApprovalStatus] = useState<ProposalApprovalStatusResponse | null>(null);
  const [history, setHistory] = useState<ProposalApprovalResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Reviewer form state
  const [comment, setComment] = useState<string>("");

  const loadApprovalData = async () => {
    if (!proposalId || !version?.id) return;
    setLoading(true);
    try {
      const [st, hist] = await Promise.all([
        getProposalApprovalStatusApi(proposalId, version.id),
        getProposalApprovalHistoryApi(proposalId, version.id),
      ]);
      setApprovalStatus(st);
      setHistory(hist);
    } catch (err: any) {
      console.error("Failed to load approval workflow status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApprovalData();
  }, [proposalId, version.id, userRole]);

  // Product Team submits version for review
  const handleSubmitForReview = async () => {
    setSubmitting(true);
    setError(null);
    setActionSuccess(null);
    try {
      const updated = await submitProposalVersionForReviewApi(proposalId, version.id);
      setActionSuccess("Proposal version submitted for VP review successfully.");
      onVersionUpdated(updated);
      await loadApprovalData();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.detail : "Failed to submit proposal version for review.");
    } finally {
      setSubmitting(false);
    }
  };

  // Executive Reviewer action (APPROVED, REQUEST_CHANGES, REJECTED)
  const handleReviewAction = async (decision: "APPROVED" | "REJECTED" | "REQUEST_CHANGES") => {
    setSubmitting(true);
    setError(null);
    setActionSuccess(null);
    try {
      await reviewProposalVersionApi(proposalId, version.id, decision, comment);
      setActionSuccess(`Decision '${decision}' submitted successfully.`);
      setComment("");
      
      // Reload approval status
      const st = await getProposalApprovalStatusApi(proposalId, version.id);
      setApprovalStatus(st);
      
      // Reload history & notify parent
      await loadApprovalData();
      
      // Request updated version object
      const updated = await submitProposalVersionForReviewApi(proposalId, version.id).catch(() => null);
      if (updated) {
        onVersionUpdated(updated);
      } else {
        // Trigger generic parent refresh
        onVersionUpdated({ ...version, status: st.current_status as any, current_stage: st.current_stage });
      }
    } catch (err: any) {
      setError(err instanceof ApiError ? err.detail : `Failed to submit review decision.`);
    } finally {
      setSubmitting(false);
    }
  };

  // Create Revision (Version N+1)
  const handleCreateRevision = async () => {
    setSubmitting(true);
    setError(null);
    setActionSuccess(null);
    try {
      const newVersion = await createProposalRevisionApi(proposalId, version.id);
      setActionSuccess(`Revision Version ${newVersion.version_number} created successfully.`);
      onVersionUpdated(newVersion);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.detail : "Failed to create proposal revision.");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadgeColor = (st: string) => {
    switch (st) {
      case "DRAFT":
        return "bg-slate-700 text-slate-200 border-slate-600";
      case "VP_REVIEW":
        return "bg-amber-950/70 text-amber-300 border-amber-800/80";
      case "CTO_REVIEW":
        return "bg-blue-950/70 text-blue-300 border-blue-800/80";
      case "CEO_REVIEW":
        return "bg-purple-950/70 text-purple-300 border-purple-800/80";
      case "APPROVED":
        return "bg-emerald-950/70 text-emerald-300 border-emerald-800/80";
      case "CHANGES_REQUESTED":
        return "bg-amber-950/70 text-amber-400 border-amber-700/80";
      case "REJECTED":
        return "bg-red-950/70 text-red-300 border-red-800/80";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  const getDecisionBadge = (decision: string) => {
    switch (decision) {
      case "APPROVED":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-900/60 text-emerald-300 border border-emerald-700/60">APPROVED</span>;
      case "REQUEST_CHANGES":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-900/60 text-amber-300 border border-amber-700/60">REQUESTED CHANGES</span>;
      case "REJECTED":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-900/60 text-red-300 border border-red-700/60">REJECTED</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-300">{decision}</span>;
    }
  };

  const isImmutable = version.is_immutable || approvalStatus?.is_immutable;
  const canUserApprove = approvalStatus?.can_user_approve;
  const currentStage = version.current_stage || approvalStatus?.current_stage;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 mb-6 shadow-lg backdrop-blur-sm">
      {/* Stage Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Workflow Status:</span>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusBadgeColor(version.status)}`}>
              {version.status}
            </span>
          </div>

          {currentStage && (
            <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700">
              <span className="text-slate-400">Current Stage:</span>
              <span className="font-bold text-indigo-400">{currentStage}</span>
            </div>
          )}

          {isImmutable && (
            <div className="flex items-center gap-1 text-xs bg-red-950/40 text-red-300 border border-red-800/50 px-2.5 py-1 rounded-md">
              <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="font-medium">Version Immutable (Locked)</span>
            </div>
          )}
        </div>

        <div className="text-xs text-slate-400">
          Role: <span className="font-semibold text-slate-200">{userRole}</span>
        </div>
      </div>

      {/* Status & Alerts */}
      {error && (
        <div className="mt-4 p-3 bg-red-950/60 border border-red-800 text-red-200 text-sm rounded-lg flex items-center gap-2">
          <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="mt-4 p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-sm rounded-lg flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Role-gated Actions */}
      <div className="mt-4">
        {/* Product Team Actions */}
        {userRole === "PRODUCT_TEAM" && version.status === "DRAFT" && (
          <div className="flex items-center justify-between bg-indigo-950/40 border border-indigo-900/60 p-4 rounded-xl">
            <div>
              <h4 className="text-sm font-semibold text-indigo-200">Submit Proposal for Executive Review</h4>
              <p className="text-xs text-indigo-300/70 mt-0.5">
                Submitting will lock Version {version.version_number} and initiate the VP → CTO → CEO approval workflow.
              </p>
            </div>
            <button
              onClick={handleSubmitForReview}
              disabled={submitting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition flex items-center gap-2"
            >
              {submitting ? "Submitting..." : "Submit for Review"}
            </button>
          </div>
        )}

        {userRole === "PRODUCT_TEAM" && ["CHANGES_REQUESTED", "REJECTED"].includes(version.status) && (
          <div className="flex items-center justify-between bg-amber-950/40 border border-amber-900/60 p-4 rounded-xl">
            <div>
              <h4 className="text-sm font-semibold text-amber-200">Revision Required</h4>
              <p className="text-xs text-amber-300/70 mt-0.5">
                {version.status === "CHANGES_REQUESTED"
                  ? "Changes were requested by executive review. Create a new editable revision version."
                  : "Proposal version was rejected. Create a new revision to restart the approval pipeline."}
              </p>
            </div>
            <button
              onClick={handleCreateRevision}
              disabled={submitting}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition flex items-center gap-2"
            >
              {submitting ? "Creating..." : `Create Revision (Version ${version.version_number + 1})`}
            </button>
          </div>
        )}

        {/* Executive Reviewer Controls (VP, CTO, CEO) */}
        {canUserApprove && (
          <div className="bg-slate-800/80 border border-indigo-500/40 p-4 rounded-xl">
            <h4 className="text-sm font-semibold text-indigo-300 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Executive Approval Action — {currentStage} Review Stage
            </h4>
            <div className="mb-3">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Reviewer Comments / Audit Notes:
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Enter feedback, technical risk notes, or reason for decision..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                rows={2}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => handleReviewAction("APPROVED")}
                disabled={submitting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow transition flex items-center gap-1.5"
              >
                ✓ Approve Proposal
              </button>
              <button
                onClick={() => handleReviewAction("REQUEST_CHANGES")}
                disabled={submitting}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow transition flex items-center gap-1.5"
              >
                💬 Request Changes
              </button>
              <button
                onClick={() => handleReviewAction("REJECTED")}
                disabled={submitting}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow transition flex items-center gap-1.5"
              >
                ✕ Reject Proposal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Approval Audit Timeline */}
      {history.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-800">
          <h4 className="text-xs uppercase tracking-wider font-semibold text-slate-400 mb-3">
            Approval Audit Trail ({history.length})
          </h4>
          <div className="space-y-3">
            {history.map((item) => (
              <div
                key={item.id}
                className="bg-slate-950/60 border border-slate-800 p-3 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-3">
                  {getDecisionBadge(item.decision)}
                  <div>
                    <span className="font-semibold text-slate-200">{item.reviewer_name || "Reviewer"}</span>{" "}
                    <span className="text-slate-400">({item.reviewer_role} • Stage: {item.stage})</span>
                    {item.comment && (
                      <p className="text-slate-300 mt-0.5 italic">"{item.comment}"</p>
                    )}
                  </div>
                </div>
                <div className="text-slate-500 text-[11px] whitespace-nowrap">
                  {new Date(item.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
