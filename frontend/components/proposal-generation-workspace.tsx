"use client";

import React, { useState, useEffect } from "react";
import {
  ProposalResponse,
  ProposalVersionResponse,
  ProposalSectionResponse,
  GeneratedContentEvidenceResponse,
  UnsupportedClaimResponse,
  createProposalApi,
  listProposalsApi,
  getProposalApi,
  createProposalVersionApi,
  listProposalVersionsApi,
  generateProposalVersionApi,
  generateProposalSectionApi,
  regenerateProposalSectionApi,
  updateProposalSectionApi,
  ApiError,
} from "../lib/api-client";

interface ProposalGenerationWorkspaceProps {
  projectId: string;
  projectName: string;
  userRole: string;
}

export function ProposalGenerationWorkspace({
  projectId,
  projectName,
  userRole,
}: ProposalGenerationWorkspaceProps) {
  const isProductTeam = userRole === "PRODUCT_TEAM";

  // State
  const [proposals, setProposals] = useState<ProposalResponse[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<ProposalResponse | null>(null);
  const [versions, setVersions] = useState<ProposalVersionResponse[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<ProposalVersionResponse | null>(null);
  const [selectedSection, setSelectedSection] = useState<ProposalSectionResponse | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Proposal Creation Modal State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>("");
  const [newDesc, setNewDesc] = useState<string>("");
  const [createSubmitting, setCreateSubmitting] = useState<boolean>(false);

  // Section Editing State
  const [editedContent, setEditedContent] = useState<string>("");
  const [reviewStatus, setReviewStatus] = useState<string>("PENDING_REVIEW");
  const [reviewerComments, setReviewerComments] = useState<string>("");
  const [saveSubmitting, setSaveSubmitting] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Generation Loading States
  const [generatingVersion, setGeneratingVersion] = useState<boolean>(false);
  const [generatingSectionId, setGeneratingSectionId] = useState<string | null>(null);

  // Active Section Tab inside Details
  const [activeDetailTab, setActiveDetailTab] = useState<"CONTENT" | "EVIDENCE" | "CLAIMS" | "REVIEW">("CONTENT");

  // Load Proposals for Project
  const fetchProposals = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listProposalsApi(projectId);
      setProposals(list);

      if (list.length > 0) {
        const fullProp = await getProposalApi(list[0].id);
        setSelectedProposal(fullProp);
        if (fullProp.current_version) {
          setSelectedVersion(fullProp.current_version);
          if (fullProp.current_version.sections && fullProp.current_version.sections.length > 0) {
            const firstSec = fullProp.current_version.sections[0];
            setSelectedSection(firstSec);
            setEditedContent(firstSec.content || "");
            setReviewStatus(firstSec.review_status || "PENDING_REVIEW");
            setReviewerComments(firstSec.reviewer_comments || "");
          }
        }
        // Fetch Version List
        const verList = await listProposalVersionsApi(fullProp.id);
        setVersions(verList);
      } else {
        setSelectedProposal(null);
        setSelectedVersion(null);
        setSelectedSection(null);
      }
    } catch (err: any) {
      setError(err instanceof ApiError ? err.detail : "Failed to load proposals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, [projectId]);

  // Handle Proposal Change
  const handleSelectProposal = async (proposalId: string) => {
    setLoading(true);
    try {
      const fullProp = await getProposalApi(proposalId);
      setSelectedProposal(fullProp);
      const verList = await listProposalVersionsApi(proposalId);
      setVersions(verList);

      if (fullProp.current_version) {
        setSelectedVersion(fullProp.current_version);
        if (fullProp.current_version.sections.length > 0) {
          const sec = fullProp.current_version.sections[0];
          setSelectedSection(sec);
          setEditedContent(sec.content || "");
          setReviewStatus(sec.review_status || "PENDING_REVIEW");
          setReviewerComments(sec.reviewer_comments || "");
        }
      }
    } catch (err: any) {
      setError(err instanceof ApiError ? err.detail : "Failed to load proposal details");
    } finally {
      setLoading(false);
    }
  };

  // Handle Version Change
  const handleSelectVersion = (verId: string) => {
    const ver = versions.find((v) => v.id === verId);
    if (ver) {
      setSelectedVersion(ver);
      if (ver.sections.length > 0) {
        const sec = ver.sections[0];
        setSelectedSection(sec);
        setEditedContent(sec.content || "");
        setReviewStatus(sec.review_status || "PENDING_REVIEW");
        setReviewerComments(sec.reviewer_comments || "");
      }
    }
  };

  // Select Section
  const handleSelectSection = (sec: ProposalSectionResponse) => {
    setSelectedSection(sec);
    setEditedContent(sec.content || "");
    setReviewStatus(sec.review_status || "PENDING_REVIEW");
    setReviewerComments(sec.reviewer_comments || "");
  };

  // Create Proposal
  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreateSubmitting(true);
    try {
      await createProposalApi(projectId, newTitle.trim(), newDesc.trim() || undefined);
      setShowCreateModal(false);
      setNewTitle("");
      setNewDesc("");
      await fetchProposals();
    } catch (err: any) {
      alert(err instanceof ApiError ? err.detail : "Failed to create proposal");
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Create New Version
  const handleCreateNewVersion = async () => {
    if (!selectedProposal || !selectedVersion) return;
    setLoading(true);
    try {
      await createProposalVersionApi(selectedProposal.id, selectedVersion.id);
      await handleSelectProposal(selectedProposal.id);
      setActionMessage("✓ New proposal version created successfully.");
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err: any) {
      alert(err instanceof ApiError ? err.detail : "Failed to create new version");
    } finally {
      setLoading(false);
    }
  };

  // Bulk Generate Proposal Version
  const handleGenerateVersion = async () => {
    if (!selectedProposal || !selectedVersion) return;
    setGeneratingVersion(true);
    try {
      await generateProposalVersionApi(selectedProposal.id, selectedVersion.id);
      await handleSelectProposal(selectedProposal.id);
      setActionMessage("⚡ All proposal sections generated successfully.");
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      alert(err instanceof ApiError ? err.detail : "Failed to generate proposal version");
    } finally {
      setGeneratingVersion(false);
    }
  };

  // Generate Single Section
  const handleGenerateSection = async (secId: string) => {
    if (!selectedProposal || !selectedVersion) return;
    setGeneratingSectionId(secId);
    try {
      const updatedSec = await generateProposalSectionApi(selectedProposal.id, selectedVersion.id, secId);
      // Update local state
      if (selectedVersion) {
        const updatedSecs = selectedVersion.sections.map((s) => (s.id === secId ? updatedSec : s));
        const newVer = { ...selectedVersion, sections: updatedSecs };
        setSelectedVersion(newVer);
        setSelectedSection(updatedSec);
        setEditedContent(updatedSec.content || "");
      }
      setActionMessage(`⚡ Section '${updatedSec.section_title}' generated.`);
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err: any) {
      alert(err instanceof ApiError ? err.detail : "Failed to generate section");
    } finally {
      setGeneratingSectionId(null);
    }
  };

  // Save Edits & Human Review
  const handleSaveSectionEdits = async () => {
    if (!selectedProposal || !selectedVersion || !selectedSection) return;
    setSaveSubmitting(true);
    try {
      const updatedSec = await updateProposalSectionApi(
        selectedProposal.id,
        selectedVersion.id,
        selectedSection.id,
        {
          content: editedContent,
          review_status: reviewStatus as any,
          reviewer_comments: reviewerComments,
        }
      );
      if (selectedVersion) {
        const updatedSecs = selectedVersion.sections.map((s) => (s.id === selectedSection.id ? updatedSec : s));
        setSelectedVersion({ ...selectedVersion, sections: updatedSecs });
        setSelectedSection(updatedSec);
      }
      setActionMessage("✓ Saved edits & review status.");
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err: any) {
      alert(err instanceof ApiError ? err.detail : "Failed to save edits");
    } finally {
      setSaveSubmitting(false);
    }
  };

  if (loading && proposals.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3 shadow-xl">
        <svg className="animate-spin h-8 w-8 text-blue-500 mx-auto" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-sm font-mono text-slate-400">Loading AI Proposal Generation Workspace...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Workspace Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>📝</span> AI Proposal Generation Engine
              </h2>
              {selectedProposal && (
                <span className={`px-2.5 py-0.5 text-xs font-mono font-bold rounded-md border ${
                  selectedProposal.status === "GENERATED"
                    ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                    : selectedProposal.status === "GENERATING"
                    ? "bg-amber-950 text-amber-300 border-amber-800"
                    : "bg-slate-950 text-slate-400 border-slate-800"
                }`}>
                  {selectedProposal.status}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Section-by-section evidence-grounded proposal content generation backed by NVIDIA NIM LLM.
            </p>
          </div>

          {/* Proposal Select / Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {proposals.length > 0 && (
              <select
                value={selectedProposal?.id || ""}
                onChange={(e) => handleSelectProposal(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2 font-mono"
              >
                {proposals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            )}

            {isProductTeam && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition shadow-lg flex items-center gap-1.5"
              >
                <span>+ Create Proposal</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Message Banner */}
        {actionMessage && (
          <div className="p-3 bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-xs rounded-xl font-mono flex items-center justify-between">
            <span>{actionMessage}</span>
          </div>
        )}

        {/* Selected Proposal Toolbar */}
        {selectedProposal && selectedVersion && (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-xs text-slate-400 font-mono">Current Version:</span>
                <select
                  value={selectedVersion.id}
                  onChange={(e) => handleSelectVersion(e.target.value)}
                  className="ml-2 bg-slate-900 border border-slate-700 text-white text-xs font-mono font-bold rounded-lg px-2.5 py-1"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      Version {v.version_number} ({v.status})
                    </option>
                  ))}
                </select>
              </div>

              {isProductTeam && (
                <button
                  onClick={handleCreateNewVersion}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg font-semibold border border-slate-700 transition"
                >
                  + New Version
                </button>
              )}
            </div>

            {isProductTeam && (
              <button
                onClick={handleGenerateVersion}
                disabled={generatingVersion}
                className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg transition flex items-center gap-2 disabled:opacity-50"
              >
                {generatingVersion ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating All Sections...
                  </>
                ) : (
                  <>
                    <span>⚡ Generate All Proposal Sections</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Workspace Body */}
      {!selectedProposal ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center space-y-4 shadow-xl">
          <div className="text-4xl">📄</div>
          <h3 className="text-lg font-bold text-white">No Proposal Created Yet</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Create a proposal for <strong>{projectName}</strong> to start generating section-by-section responses.
          </p>
          {isProductTeam && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg transition"
            >
              + Create Proposal
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT SIDEBAR: Section List */}
          <div className="lg:col-span-4 space-y-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center justify-between">
                <span>Proposal Sections ({selectedVersion?.sections.length || 0})</span>
              </h3>

              <div className="space-y-2 max-h-[700px] overflow-y-auto pr-1">
                {selectedVersion?.sections.map((sec) => {
                  const isSelected = selectedSection?.id === sec.id;
                  const isGenerating = generatingSectionId === sec.id;

                  return (
                    <div
                      key={sec.id}
                      onClick={() => handleSelectSection(sec)}
                      className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col gap-2 ${
                        isSelected
                          ? "bg-blue-950/60 border-blue-600 shadow-md"
                          : "bg-slate-950 border-slate-800 hover:bg-slate-800/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-white line-clamp-1">{sec.section_title}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded ${
                          sec.generation_status === "COMPLETED"
                            ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                            : sec.generation_status === "PROCESSING"
                            ? "bg-amber-950 text-amber-300 border border-amber-800 animate-pulse"
                            : "bg-slate-900 text-slate-500 border border-slate-800"
                        }`}>
                          {sec.generation_status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                        <div className="flex items-center gap-2">
                          <span>Evidence: <strong className="text-slate-200">{sec.evidence_list.length}</strong></span>
                          {sec.unsupported_claims.length > 0 && (
                            <span className="text-amber-400 font-bold">
                              ⚠️ {sec.unsupported_claims.length} Unsupported
                            </span>
                          )}
                        </div>

                        <span className={`px-1.5 py-0.5 text-[9px] rounded border font-mono ${
                          sec.review_status === "APPROVED"
                            ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                            : sec.review_status === "REJECTED"
                            ? "bg-red-950 text-red-300 border-red-800"
                            : "bg-slate-900 text-slate-400 border-slate-800"
                        }`}>
                          {sec.review_status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT MAIN AREA: Selected Section Editor & Details */}
          <div className="lg:col-span-8 space-y-4">
            {selectedSection ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                
                {/* Section Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{selectedSection.section_title}</h3>
                    <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mt-1">
                      <span>Key: <code className="text-blue-400">{selectedSection.section_key}</code></span>
                      <span>Order: {selectedSection.section_order}</span>
                      <span>Confidence: {(selectedSection.confidence_score * 100).toFixed(0)}%</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isProductTeam && (
                      <button
                        onClick={() => handleGenerateSection(selectedSection.id)}
                        disabled={generatingSectionId === selectedSection.id}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {generatingSectionId === selectedSection.id ? (
                          <span>Generating...</span>
                        ) : (
                          <span>⚡ {selectedSection.content ? "Regenerate" : "Generate"}</span>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub-tabs inside Section View */}
                <div className="flex border-b border-slate-800 text-xs font-semibold gap-6">
                  <button
                    onClick={() => setActiveDetailTab("CONTENT")}
                    className={`pb-2 transition border-b-2 ${
                      activeDetailTab === "CONTENT"
                        ? "border-blue-500 text-blue-400 font-bold"
                        : "border-transparent text-slate-400 hover:text-white"
                    }`}
                  >
                    Section Content & Editor
                  </button>

                  <button
                    onClick={() => setActiveDetailTab("EVIDENCE")}
                    className={`pb-2 transition border-b-2 flex items-center gap-1.5 ${
                      activeDetailTab === "EVIDENCE"
                        ? "border-blue-500 text-blue-400 font-bold"
                        : "border-transparent text-slate-400 hover:text-white"
                    }`}
                  >
                    <span>Evidence & Provenance</span>
                    <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-800 text-slate-300">
                      {selectedSection.evidence_list.length}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveDetailTab("CLAIMS")}
                    className={`pb-2 transition border-b-2 flex items-center gap-1.5 ${
                      activeDetailTab === "CLAIMS"
                        ? "border-amber-500 text-amber-400 font-bold"
                        : "border-transparent text-slate-400 hover:text-white"
                    }`}
                  >
                    <span>Unsupported Claims</span>
                    {selectedSection.unsupported_claims.length > 0 && (
                      <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                        {selectedSection.unsupported_claims.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveDetailTab("REVIEW")}
                    className={`pb-2 transition border-b-2 ${
                      activeDetailTab === "REVIEW"
                        ? "border-emerald-500 text-emerald-400 font-bold"
                        : "border-transparent text-slate-400 hover:text-white"
                    }`}
                  >
                    Human Review ({selectedSection.review_status})
                  </button>
                </div>

                {/* TAB 1: SECTION CONTENT & EDITOR */}
                {activeDetailTab === "CONTENT" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">
                        Generated / Editable Section Markdown:
                      </label>
                      <textarea
                        rows={14}
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        placeholder="Click Generate to produce evidence-backed section response using NVIDIA NIM..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 leading-relaxed"
                      />
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <span className="text-[11px] text-slate-500 font-mono">
                        {selectedSection.ai_generated_content
                          ? "✓ Original AI generated content preserved in version history"
                          : "Section pending generation"}
                      </span>

                      {isProductTeam && (
                        <button
                          onClick={handleSaveSectionEdits}
                          disabled={saveSubmitting}
                          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow transition"
                        >
                          {saveSubmitting ? "Saving..." : "💾 Save Content & Review Status"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 2: EVIDENCE & PROVENANCE */}
                {activeDetailTab === "EVIDENCE" && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                      Grounding Evidence Citations ({selectedSection.evidence_list.length})
                    </h4>

                    {selectedSection.evidence_list.length === 0 ? (
                      <p className="text-xs text-slate-500 italic p-4 bg-slate-950 rounded-xl border border-slate-800">
                        No explicit evidence citations recorded for this section yet. Generate section to pull live RAG citations.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {selectedSection.evidence_list.map((ev) => (
                          <div key={ev.id} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                            <div className="flex justify-between items-start gap-2">
                              <span className="font-bold text-xs text-white">{ev.source_title}</span>
                              <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${
                                ev.authority_level === "AUTHORITATIVE"
                                  ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                                  : "bg-blue-950 text-blue-300 border-blue-800"
                              }`}>
                                {ev.authority_level}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 font-mono bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                              "{ev.evidence_text}"
                            </p>
                            <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                              <span>Reference: {ev.citation_reference}</span>
                              <span>Relevance: {(ev.relevance_score * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: UNSUPPORTED CLAIMS */}
                {activeDetailTab === "CLAIMS" && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                      Unsupported Claim Warnings ({selectedSection.unsupported_claims.length})
                    </h4>

                    {selectedSection.unsupported_claims.length === 0 ? (
                      <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs font-mono">
                        ✓ Zero unsupported claims detected. All key assertions are backed by authoritative company evidence.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedSection.unsupported_claims.map((uc) => (
                          <div key={uc.id} className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-xl space-y-2 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-amber-300">⚠️ Claim: {uc.claim}</span>
                              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-amber-900 text-amber-200">
                                {uc.severity} SEVERITY
                              </span>
                            </div>
                            <p className="text-slate-300 text-xs leading-relaxed font-mono">
                              Reason: {uc.reason}
                            </p>
                            <div className="text-[10px] text-amber-400 font-bold uppercase font-mono">
                              * Requires Human Verification *
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: HUMAN REVIEW */}
                {activeDetailTab === "REVIEW" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">Review Status:</label>
                      <select
                        value={reviewStatus}
                        onChange={(e) => setReviewStatus(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-white"
                      >
                        <option value="PENDING_REVIEW">PENDING_REVIEW</option>
                        <option value="IN_REVIEW">IN_REVIEW</option>
                        <option value="APPROVED">APPROVED</option>
                        <option value="NEEDS_REVISION">NEEDS_REVISION</option>
                        <option value="REJECTED">REJECTED</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">Reviewer Comments / Audit Notes:</label>
                      <textarea
                        rows={5}
                        value={reviewerComments}
                        onChange={(e) => setReviewerComments(e.target.value)}
                        placeholder="Add review feedback, compliance verification notes, or revision directives..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={handleSaveSectionEdits}
                        disabled={saveSubmitting}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow transition"
                      >
                        {saveSubmitting ? "Saving..." : "💾 Save Review Decision"}
                      </button>
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-xs">
                Select a section from the left sidebar to view or edit details.
              </div>
            )}
          </div>

        </div>
      )}

      {/* CREATE PROPOSAL MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>+ Create Proposal</span>
            </h3>

            <form onSubmit={handleCreateProposal} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300">Proposal Title *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Enterprise Cloud Platform RFP Proposal"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300">Description (Optional)</label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Brief proposal scope description..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow"
                >
                  {createSubmitting ? "Creating..." : "Create Proposal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
