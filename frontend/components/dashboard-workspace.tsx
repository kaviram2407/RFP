"use client";

import React, { useState, useEffect } from "react";
import {
  DashboardSummaryResponse,
  getDashboardSummaryApi,
  listRFPProjectsApi,
  RFPProjectResponse,
  ApiError,
} from "../lib/api-client";

interface DashboardWorkspaceProps {
  userRole?: string;
  onNavigateToProposal?: (proposalId: string, projectId: string) => void;
}

export function DashboardWorkspace({
  userRole,
  onNavigateToProposal,
}: DashboardWorkspaceProps) {
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const [projects, setProjects] = useState<RFPProjectResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedPriority, setSelectedPriority] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");

  const fetchProjects = async () => {
    try {
      const res = await listRFPProjectsApi(1, 100);
      setProjects(res.items);
    } catch (err) {
      console.error("Failed to load RFP projects for filter:", err);
    }
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDashboardSummaryApi({
        rfp_project_id: selectedProjectId || undefined,
        priority: selectedPriority || undefined,
        category: selectedCategory || undefined,
      });
      setData(res);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.detail : "Failed to load dashboard metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [selectedProjectId, selectedPriority, selectedCategory]);

  const getDecisionBadge = (decision: string) => {
    switch (decision) {
      case "APPROVED":
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">APPROVED</span>;
      case "REQUEST_CHANGES":
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-950 text-amber-300 border border-amber-800">REQUESTED CHANGES</span>;
      case "REJECTED":
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-950 text-red-300 border border-red-800">REJECTED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-slate-300">{decision}</span>;
    }
  };

  const renderDistributionBars = (title: string, items: { label: string; count: number }[], colorTheme: string) => {
    const total = items.reduce((acc, curr) => acc + curr.count, 0);
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-md">
        <h4 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-3">{title}</h4>
        {items.length === 0 || total === 0 ? (
          <div className="text-xs text-slate-500 italic py-6 text-center">No data recorded for filter</div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-300">{item.label}</span>
                    <span className="text-slate-400">{item.count} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div
                      className={`h-full transition-all duration-500 ${colorTheme}`}
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (loading && !data) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
        <p className="text-xs text-slate-400 font-mono">Loading real operational analytics from PostgreSQL...</p>
      </div>
    );
  }

  const kpis = data?.kpis;
  const isProd = userRole === "PRODUCT_TEAM";
  const isVp = userRole === "VP";
  const isCto = userRole === "CTO";
  const isCeo = userRole === "CEO";

  return (
    <div className="space-y-6">
      {/* Header Banner & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">Executive Dashboard & Analytics</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
              Role: {userRole}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time evidence, compliance, risk, and multi-tier approval metrics.
          </p>
        </div>

        {/* Global Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">RFP Project</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">All RFP Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.reference_number})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Priority</label>
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">All Categories</option>
              <option value="SECURITY">Security</option>
              <option value="TECHNICAL">Technical</option>
              <option value="COMPLIANCE">Compliance</option>
              <option value="LEGAL">Legal</option>
              <option value="COMMERCIAL">Commercial</option>
              <option value="FUNCTIONAL">Functional</option>
            </select>
          </div>

          <div className="self-end">
            <button
              onClick={loadDashboard}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl flex items-center gap-2">
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* Role-Aware KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active RFPs</span>
            <div className="text-2xl font-bold text-white mt-1 font-mono">{kpis.active_rfps_count}</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Requirements</span>
            <div className="text-2xl font-bold text-blue-400 mt-1 font-mono">{kpis.total_requirements_count}</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Compliant Items</span>
            <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono">{kpis.compliant_items_count}</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Open Gaps</span>
            <div className="text-2xl font-bold text-amber-400 mt-1 font-mono">{kpis.open_gaps_count}</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Critical / High Risks</span>
            <div className="text-2xl font-bold text-red-400 mt-1 font-mono">{kpis.critical_high_risks_count}</div>
          </div>

          <div className="bg-slate-900/90 border border-indigo-900/60 bg-indigo-950/30 p-4 rounded-xl shadow">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
              {isProd ? "Revisions Pending" : "Awaiting My Review"}
            </span>
            <div className="text-2xl font-bold text-indigo-400 mt-1 font-mono">{kpis.proposals_awaiting_my_review_count}</div>
          </div>
        </div>
      )}

      {/* Operational Analytics & Visualizations Grid */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {renderDistributionBars("RFP Project Status Overview", data.rfp_status_distribution, "bg-blue-500")}
          {renderDistributionBars("Requirement Priority Breakdown", data.requirement_priority_distribution, "bg-purple-500")}
          {renderDistributionBars("Compliance Assessment Overview", data.compliance_status_distribution, "bg-emerald-500")}
          {renderDistributionBars("Gap Severity Distribution", data.gap_severity_distribution, "bg-amber-500")}
          {renderDistributionBars("Risk Severity Breakdown", data.risk_severity_distribution, "bg-red-500")}
          {renderDistributionBars("Proposal & Approval Pipeline", data.proposal_stage_distribution, "bg-indigo-500")}
        </div>
      )}

      {/* Role-Aware Pending Approval Queue */}
      {data && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>📋 Role-Specific Action Queue</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                  {userRole} Queue ({data.approval_queue.length})
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isProd
                  ? "Drafts requiring submission and requested revisions needing updates."
                  : `Proposals requiring your formal ${userRole} executive review.`}
              </p>
            </div>
          </div>

          {data.approval_queue.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 font-mono">
              ✓ No proposals pending action for your role. All workflows up to date.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">RFP Project</th>
                    <th className="py-2.5 px-3">Proposal Title</th>
                    <th className="py-2.5 px-3">Version</th>
                    <th className="py-2.5 px-3">Stage</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Submitted By</th>
                    <th className="py-2.5 px-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {data.approval_queue.map((item) => (
                    <tr key={item.version_id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-semibold text-slate-300">{item.rfp_project_name}</td>
                      <td className="py-3 px-3 font-bold text-white">{item.proposal_title}</td>
                      <td className="py-3 px-3 text-indigo-400">v{item.version_number}</td>
                      <td className="py-3 px-3"><span className="text-indigo-300 font-bold">{item.current_stage}</span></td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-400">{item.created_by_name || "Product Team"}</td>
                      <td className="py-3 px-3">
                        {onNavigateToProposal ? (
                          <button
                            onClick={() => onNavigateToProposal(item.proposal_id, item.rfp_project_id)}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded text-[11px] transition shadow"
                          >
                            Open Review →
                          </button>
                        ) : (
                          <span className="text-slate-500 italic">Open in Proposals</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Recent Approval Audit Trail */}
      {data && data.recent_decisions.length > 0 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-lg">
          <h3 className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-3">
            Recent Executive Decisions Audit Trail ({data.recent_decisions.length})
          </h3>
          <div className="space-y-3">
            {data.recent_decisions.map((item) => (
              <div
                key={item.id}
                className="bg-slate-950/60 border border-slate-800 p-3 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-3">
                  {getDecisionBadge(item.decision)}
                  <div>
                    <span className="font-semibold text-slate-200">{item.reviewer_name}</span>{" "}
                    <span className="text-slate-400">({item.reviewer_role} • Stage: {item.stage})</span>
                    {item.comment && <p className="text-slate-300 mt-0.5 italic">"{item.comment}"</p>}
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
