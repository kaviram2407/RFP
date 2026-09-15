"use client";

import { useState } from "react";
import { useAuth } from "../lib/auth-context";
import { LoginPage } from "../components/login-page";
import { RFPProjectsWorkspace } from "../components/rfp-projects-workspace";
import CompanyKnowledgeWorkspace from "../components/company-knowledge-workspace";
import { PreviousProposalsWorkspace } from "../components/previous-proposals-workspace";

export default function RFPPlatformPage() {
  const { user, loading, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<"PROJECTS" | "KNOWLEDGE" | "PROPOSALS" | "PROPOSAL_SEARCH">("PROJECTS");

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
              Real Multi-Tenant RFP Workspace & Intelligence System
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
              <span>📁</span> RFP Projects
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
              Previous Proposals Library
            </button>

            <button
              onClick={() => setActiveTab("PROPOSAL_SEARCH")}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition ${
                activeTab === "PROPOSAL_SEARCH"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              Historical Proposal Search Engine
            </button>
          </div>
        </div>

        {/* TAB 1: REAL RFP PROJECTS WORKSPACE (F2, F3, F4) */}
        {activeTab === "PROJECTS" && <RFPProjectsWorkspace />}

        {/* TAB 2: REAL COMPANY KNOWLEDGE & HYBRID RAG SEARCH (F5) */}
        {activeTab === "KNOWLEDGE" && <CompanyKnowledgeWorkspace userRole={user.role} />}

        {/* TAB 3: REAL PREVIOUS PROPOSALS LIBRARY (F6) */}
        {activeTab === "PROPOSALS" && <PreviousProposalsWorkspace userRole={user.role} initialTab="list" />}

        {/* TAB 4: REAL HISTORICAL PROPOSAL SEARCH ENGINE (F6) */}
        {activeTab === "PROPOSAL_SEARCH" && <PreviousProposalsWorkspace userRole={user.role} initialTab="search" />}

      </div>
    </div>
  );
}
