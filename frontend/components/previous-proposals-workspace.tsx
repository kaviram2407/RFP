"use client";

import React, { useState, useEffect } from "react";
import {
  listPreviousProposalsApi,
  getPreviousProposalApi,
  createPreviousProposalApi,
  updatePreviousProposalApi,
  addProposalVersionApi,
  searchPreviousProposalsApi,
  PreviousProposalResponse,
  HistoricalProposalSearchResponse,
  ProposalRetrievalResultResponse,
  ProposalOutcomeEnum,
  ProposalStatusEnum,
  PreviousProposalCreate,
  PreviousProposalVersionCreate,
} from "../lib/api-client";

interface PreviousProposalsWorkspaceProps {
  userRole?: string;
  initialTab?: "list" | "search";
}

export function PreviousProposalsWorkspace({
  userRole,
  initialTab = "list",
}: PreviousProposalsWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"list" | "search">(initialTab);

  // List State
  const [proposals, setProposals] = useState<PreviousProposalResponse[]>([]);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(true);
  const [listError, setListError] = useState<string | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Create Proposal State
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState<string>("");
  const [newCustomer, setNewCustomer] = useState<string>("");
  const [newPropRef, setNewPropRef] = useState<string>("");
  const [newDescription, setNewDescription] = useState<string>("");
  const [newOutcome, setNewOutcome] = useState<ProposalOutcomeEnum>("WON");
  const [newStatus, setNewStatus] = useState<ProposalStatusEnum>("APPROVED");
  const [newRawContent, setNewRawContent] = useState<string>("");

  // Detail View State
  const [selectedProposal, setSelectedProposal] = useState<PreviousProposalResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);

  // New Version State
  const [isAddVersionOpen, setIsAddVersionOpen] = useState<boolean>(false);
  const [isSubmittingVersion, setIsSubmittingVersion] = useState<boolean>(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [versionFilename, setVersionFilename] = useState<string>("");
  const [versionRawContent, setVersionRawContent] = useState<string>("");

  // Search State
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchOutcome, setSearchOutcome] = useState<string>("");
  const [searchResults, setSearchResults] = useState<HistoricalProposalSearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const canEdit = userRole === "PRODUCT_TEAM" || userRole === "ADMIN";

  // Load List
  const fetchProposals = async () => {
    setIsLoadingList(true);
    setListError(null);
    try {
      const outcome = outcomeFilter !== "ALL" ? (outcomeFilter as ProposalOutcomeEnum) : undefined;
      const status = statusFilter !== "ALL" ? (statusFilter as ProposalStatusEnum) : undefined;
      const data = await listPreviousProposalsApi({
        outcome,
        status,
      });
      setProposals(data);
    } catch (err: any) {
      setListError(err?.detail || err.message || "Failed to load previous proposals.");
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    if (activeTab === "list") {
      fetchProposals();
    }
  }, [activeTab, outcomeFilter, statusFilter]);

  // Handle Create Proposal
  const handleCreateProposal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newTitle.trim() || !newPropRef.trim()) {
      setCreateError("Proposal Title and Proposal Reference are required.");
      return;
    }

    setIsSubmittingCreate(true);
    setCreateError(null);

    const payload: PreviousProposalCreate = {
      title: newTitle.trim(),
      proposal_reference: newPropRef.trim(),
      customer_name: newCustomer.trim() || undefined,
      description: newDescription.trim() || undefined,
      outcome: newOutcome,
      status: newStatus,
      raw_content: newRawContent.trim() || undefined,
    };

    try {
      await createPreviousProposalApi(payload);
      setIsCreateOpen(false);
      setNewTitle("");
      setNewCustomer("");
      setNewPropRef("");
      setNewDescription("");
      setNewRawContent("");
      fetchProposals();
    } catch (err: any) {
      setCreateError(err?.detail || err.message || "Failed to create previous proposal.");
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // View Proposal Details
  const handleOpenDetail = async (proposalId: string) => {
    setIsLoadingDetail(true);
    setDetailError(null);
    setIsDetailOpen(true);
    try {
      const data = await getPreviousProposalApi(proposalId);
      setSelectedProposal(data);
    } catch (err: any) {
      setDetailError(err?.detail || err.message || "Failed to load proposal details.");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Handle Add Version
  const handleAddVersion = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProposal || !versionRawContent.trim()) {
      setVersionError("Raw content is required for new proposal version.");
      return;
    }

    setIsSubmittingVersion(true);
    setVersionError(null);

    const payload: PreviousProposalVersionCreate = {
      raw_content: versionRawContent.trim(),
      original_filename: versionFilename.trim() || undefined,
    };

    try {
      await addProposalVersionApi(selectedProposal.id, payload);
      setIsAddVersionOpen(false);
      const updated = await getPreviousProposalApi(selectedProposal.id);
      setSelectedProposal(updated);
      setVersionRawContent("");
      setVersionFilename("");
    } catch (err: any) {
      setVersionError(err?.detail || err.message || "Failed to add new version.");
    } finally {
      setIsSubmittingVersion(false);
    }
  };

  // Historical Search
  const handleHistoricalSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    try {
      const res = await searchPreviousProposalsApi({
        query: searchQuery.trim(),
        outcome: searchOutcome ? (searchOutcome as ProposalOutcomeEnum) : undefined,
        top_k: 10,
      });
      setSearchResults(res);
    } catch (err: any) {
      setSearchError(err?.detail || err.message || "Search failed.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleCopyContent = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Historical Disclaimer Banner */}
      <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-4 flex items-start space-x-3 text-xs">
        <span className="text-amber-400 font-bold text-base">🛡️</span>
        <div className="text-amber-300 space-y-1">
          <p className="font-bold text-amber-200">Historical Evidence & Reference Material Notice</p>
          <p>
            Previous proposal content represents past historical responses. It is provided for reference and evidence only.
            <span className="font-bold underline ml-1">It is NOT authoritative current company truth.</span> Always verify against current Company Knowledge documents.
          </p>
        </div>
      </div>

      {/* Workspace Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab("list")}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition flex items-center gap-2 ${
              activeTab === "list"
                ? "bg-indigo-600 text-white shadow-lg"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <span>📁</span> Proposal Library
          </button>
          <button
            onClick={() => setActiveTab("search")}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition flex items-center gap-2 ${
              activeTab === "search"
                ? "bg-indigo-600 text-white shadow-lg"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <span>🔍</span> Historical Search Engine
          </button>
        </div>

        {canEdit && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-lg"
          >
            <span>➕</span> Import Historical Proposal
          </button>
        )}
      </div>

      {/* VIEW 1: PROPOSAL LIBRARY LIST */}
      {activeTab === "list" && (
        <div className="space-y-4">
          {/* Filters & Refresh */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3 rounded-xl">
            <div className="flex items-center space-x-3 text-xs">
              <span className="text-slate-400 font-semibold">Outcome:</span>
              <select
                value={outcomeFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setOutcomeFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">All Outcomes</option>
                <option value="WON">WON</option>
                <option value="LOST">LOST</option>
                <option value="NO_DECISION">NO_DECISION</option>
                <option value="UNKNOWN">UNKNOWN</option>
              </select>

              <span className="text-slate-400 font-semibold ml-2">Status:</span>
              <select
                value={statusFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="APPROVED">APPROVED Only</option>
                <option value="DRAFT">DRAFT</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </div>

            <button
              onClick={fetchProposals}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition flex items-center gap-1"
            >
              <span>🔄</span> Refresh List
            </button>
          </div>

          {/* List Content */}
          {isLoadingList ? (
            <div className="p-12 text-center text-slate-400 text-xs font-mono space-y-2">
              <div className="animate-spin text-indigo-400 text-lg">⏳</div>
              <p>Loading historical proposals from PostgreSQL...</p>
            </div>
          ) : listError ? (
            <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs flex items-center justify-between">
              <span>{listError}</span>
              <button onClick={fetchProposals} className="px-3 py-1 bg-red-900 hover:bg-red-800 text-white rounded text-xs">
                Retry
              </button>
            </div>
          ) : proposals.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl space-y-3">
              <div className="text-3xl text-slate-600">📜</div>
              <div className="text-slate-300 text-sm font-semibold">No Historical Proposals Found</div>
              <p className="text-slate-500 text-xs max-w-md mx-auto">
                No past proposals match your filters. Import historical proposals to populate the vector search repository.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {proposals.map((prop) => (
                <div
                  key={prop.id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-xl"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-2.5 py-0.5 text-[10px] font-mono font-bold rounded-md border ${
                          prop.outcome === "WON"
                            ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                            : prop.outcome === "LOST"
                            ? "bg-red-950 text-red-300 border-red-800"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}
                      >
                        🏆 {prop.outcome}
                      </span>

                      <span
                        className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-md border ${
                          prop.status === "APPROVED"
                            ? "bg-indigo-950 text-indigo-300 border-indigo-800"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}
                      >
                        {prop.status}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-white line-clamp-1">{prop.title}</h3>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        Ref: <span className="text-slate-200">{prop.proposal_reference}</span>
                        {prop.customer_name && <span> • {prop.customer_name}</span>}
                      </p>
                    </div>

                    {prop.description && (
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                        {prop.description}
                      </p>
                    )}
                  </div>

                  <div className="border-t border-slate-800/80 pt-3 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono text-[11px]">
                      Versions: {prop.versions?.length || 0}
                    </span>
                    <button
                      onClick={() => handleOpenDetail(prop.id)}
                      className="px-3 py-1.5 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800 text-indigo-200 text-xs font-semibold rounded-lg transition"
                    >
                      View Details →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: HISTORICAL SEARCH ENGINE */}
      {activeTab === "search" && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>🔍</span> Historical Proposal Vector & Lexical Search Engine
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Search index of past proposal responses, indexed via 2048-dim Nemotron embeddings.
              </p>
            </div>

            <form onSubmit={handleHistoricalSearch} className="space-y-4">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                  placeholder="e.g., High availability cloud deployment SLA disaster recovery 24x7 support"
                  className="flex-1 bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500"
                  required
                />
                <button
                  type="submit"
                  disabled={isSearching}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50"
                >
                  {isSearching ? "Searching..." : "Search Historical Evidence"}
                </button>
              </div>

              <div className="flex items-center space-x-4 text-xs">
                <span className="text-slate-400 font-semibold">Outcome Signal Filter:</span>
                <select
                  value={searchOutcome}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSearchOutcome(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Any Outcome</option>
                  <option value="WON">WON Only</option>
                  <option value="LOST">LOST</option>
                  <option value="NO_DECISION">NO_DECISION</option>
                </select>
              </div>
            </form>

            {searchError && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl">
                ⚠️ {searchError}
              </div>
            )}
          </div>

          {/* Search Results Display */}
          {searchResults && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  Found <strong>{searchResults.total}</strong> historical section matches for &quot;{searchResults.query}&quot;
                </span>
                <span className="text-slate-500 font-mono">Ranked by hybrid relevance + recency + outcome</span>
              </div>

              {searchResults.results.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
                  No matching proposal sections found in the vector database.
                </div>
              ) : (
                <div className="space-y-4">
                  {searchResults.results.map((res: ProposalRetrievalResultResponse, index: number) => (
                    <div key={res.section_id || index} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
                      <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-800/80 pb-3 gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-800 text-[9px] font-mono font-bold rounded">
                              Historical Evidence
                            </span>
                            {res.outcome && (
                              <span
                                className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded border ${
                                  res.outcome === "WON"
                                    ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                                    : "bg-red-950 text-red-300 border-red-800"
                                }`}
                              >
                                {res.outcome}
                              </span>
                            )}
                            <h4 className="text-sm font-bold text-white">
                              {res.proposal_title || "Historical Proposal"}
                            </h4>
                          </div>
                          <p className="text-xs text-slate-400 font-mono">
                            Ref: <span className="text-slate-200">{res.proposal_reference}</span>
                            {res.customer_name && <span> • Client: {res.customer_name}</span>}
                            {res.section_title && <span> • Section: <span className="text-indigo-300">{res.section_title}</span></span>}
                          </p>
                        </div>

                        <div className="text-right font-mono text-[11px]">
                          <div className="text-indigo-400 font-bold">
                            Match: {(res.final_score * 100).toFixed(1)}%
                          </div>
                          {res.recency_score !== undefined && (
                            <div className="text-slate-500 text-[10px]">
                              Recency Signal: {(res.recency_score * 100).toFixed(0)}%
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {res.content}
                      </div>

                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 pt-1">
                        <div>
                          Proposal ID: <span className="text-slate-400">{res.proposal_id.slice(0, 8)}...</span>
                        </div>

                        <button
                          onClick={() => handleCopyContent(res.content, res.section_id)}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 text-[11px] font-semibold"
                        >
                          {copiedId === res.section_id ? "Copied Reference Text ✓" : "Copy Reference Text"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CREATE PROPOSAL MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>📥</span> Import Previous Proposal
              </h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-white font-bold">
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl">
                ⚠️ {createError}
              </div>
            )}

            <form onSubmit={handleCreateProposal} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold uppercase">Proposal Title *</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTitle(e.target.value)}
                    placeholder="Enterprise Cloud Proposal"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold uppercase">Proposal Reference *</label>
                  <input
                    type="text"
                    value={newPropRef}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPropRef(e.target.value)}
                    placeholder="PROP-2025-089"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold uppercase">Customer Name</label>
                  <input
                    type="text"
                    value={newCustomer}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCustomer(e.target.value)}
                    placeholder="Acme Corp"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold uppercase">Outcome</label>
                  <select
                    value={newOutcome}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewOutcome(e.target.value as ProposalOutcomeEnum)}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="WON">WON</option>
                    <option value="LOST">LOST</option>
                    <option value="NO_DECISION">NO_DECISION</option>
                    <option value="UNKNOWN">UNKNOWN</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold uppercase">Approval Status</label>
                  <select
                    value={newStatus}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewStatus(e.target.value as ProposalStatusEnum)}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="APPROVED">APPROVED (Indexable)</option>
                    <option value="DRAFT">DRAFT</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-semibold uppercase">Proposal Overview Description</label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewDescription(e.target.value)}
                  placeholder="Summary of scope..."
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1 border-t border-slate-800 pt-3">
                <label className="text-slate-300 font-semibold uppercase">Raw Proposal Content (Vector Ingestion)</label>
                <textarea
                  rows={5}
                  value={newRawContent}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewRawContent(e.target.value)}
                  placeholder="Paste historical proposal text response to generate 2048-dim Nemotron embeddings..."
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl p-3 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50"
                >
                  {isSubmittingCreate ? "Importing & Indexing..." : "Save Proposal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL DIALOG */}
      {isDetailOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-3xl w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Historical Proposal Detail</h3>
                <p className="text-xs text-slate-400">Inspect versions & metadata from PostgreSQL</p>
              </div>
              <button onClick={() => setIsDetailOpen(false)} className="text-slate-400 hover:text-white font-bold">
                ✕
              </button>
            </div>

            {isLoadingDetail ? (
              <div className="p-8 text-center text-slate-400 font-mono">Loading detail from PostgreSQL...</div>
            ) : detailError ? (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl">{detailError}</div>
            ) : selectedProposal ? (
              <div className="space-y-6">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-slate-500 block">Title</span>
                    <span className="font-bold text-white">{selectedProposal.title}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Reference</span>
                    <span className="font-mono text-slate-200">{selectedProposal.proposal_reference}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Customer</span>
                    <span className="text-slate-300">{selectedProposal.customer_name || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Status</span>
                    <span className="text-indigo-400 font-semibold">{selectedProposal.status}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Outcome</span>
                    <span className="text-emerald-400 font-semibold">{selectedProposal.outcome}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Created</span>
                    <span className="text-slate-400">{new Date(selectedProposal.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h4 className="font-bold text-white flex items-center gap-2">
                      <span>📜</span> Proposal Versions ({selectedProposal.versions?.length || 0})
                    </h4>

                    {canEdit && (
                      <button
                        onClick={() => setIsAddVersionOpen(true)}
                        className="px-3 py-1 bg-indigo-950 hover:bg-indigo-900 border border-indigo-700 text-indigo-200 text-xs font-semibold rounded-lg transition"
                      >
                        + Add Version
                      </button>
                    )}
                  </div>

                  {selectedProposal.versions && selectedProposal.versions.length > 0 ? (
                    <div className="space-y-2">
                      {selectedProposal.versions.map((ver) => (
                        <div key={ver.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-indigo-300">Version {ver.version_number}</span>
                            {ver.original_filename && (
                              <span className="text-slate-400 font-mono ml-2">({ver.original_filename})</span>
                            )}
                          </div>
                          <div className="flex items-center space-x-3 text-[11px] font-mono text-slate-400">
                            <span className="px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-slate-300">
                              {ver.processing_status}
                            </span>
                            <span>{new Date(ver.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 italic">No version history available.</p>
                  )}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsDetailOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD VERSION MODAL */}
      {isAddVersionOpen && selectedProposal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Add Proposal Version</h3>
              <button onClick={() => setIsAddVersionOpen(false)} className="text-slate-400 hover:text-white font-bold">
                ✕
              </button>
            </div>

            {versionError && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl">
                ⚠️ {versionError}
              </div>
            )}

            <form onSubmit={handleAddVersion} className="space-y-4">
              <div className="space-y-1">
                <label className="text-slate-400 font-semibold uppercase">Original Filename (Optional)</label>
                <input
                  type="text"
                  value={versionFilename}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVersionFilename(e.target.value)}
                  placeholder="Technical_Response_v2.docx"
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-semibold uppercase">Raw Proposal Text *</label>
                <textarea
                  rows={5}
                  value={versionRawContent}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setVersionRawContent(e.target.value)}
                  placeholder="Enter proposal version content text for ingestion..."
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl p-3 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddVersionOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingVersion}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50"
                >
                  {isSubmittingVersion ? "Processing & Indexing..." : "Save Version"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
