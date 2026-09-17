"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../lib/auth-context";
import RFPDocumentsWorkspace from "./rfp-documents-workspace";
import RFPRequirementsWorkspace from "./rfp-requirements-workspace";
import { ComplianceWorkspace } from "./compliance-workspace";
import { ProposalGenerationWorkspace } from "./proposal-generation-workspace";
import {
  RFPProjectResponse,
  ProjectStatusEnum,
  RFPProjectCreate,
  RFPProjectUpdate,
  listRFPProjectsApi,
  createRFPProjectApi,
  getRFPProjectApi,
  updateRFPProjectApi,
  archiveRFPProjectApi,
  ApiError,
} from "../lib/api-client";

export function RFPProjectsWorkspace() {
  const { user } = useAuth();
  const isProductTeam = user?.role === "PRODUCT_TEAM";

  // State
  const [projects, setProjects] = useState<RFPProjectResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<ProjectStatusEnum | "ALL">("ALL");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<RFPProjectResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState<boolean>(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);

  // Create Form
  const [createName, setCreateName] = useState("");
  const [createRefNum, setCreateRefNum] = useState("");
  const [createCustName, setCreateCustName] = useState("");
  const [createCustContact, setCreateCustContact] = useState("");
  const [createDeadline, setCreateDeadline] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Form
  const [editName, setEditName] = useState("");
  const [editRefNum, setEditRefNum] = useState("");
  const [editCustName, setEditCustName] = useState("");
  const [editCustContact, setEditCustContact] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editStatus, setEditStatus] = useState<ProjectStatusEnum>("DRAFT");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Archive State
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Fetch Project List
  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const filter = statusFilter !== "ALL" ? statusFilter : undefined;
      const data = await listRFPProjectsApi(1, 100, filter);
      setProjects(data.items);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.detail : "Failed to load RFP projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [statusFilter]);

  // Fetch Single Project Details
  const fetchProjectDetails = async (id: string) => {
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const data = await getRFPProjectApi(id);
      setSelectedProject(data);
    } catch (err: any) {
      setDetailsError(err instanceof ApiError ? err.detail : "Failed to load project details");
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id);
    fetchProjectDetails(id);
  };

  // Create Action
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName || !createRefNum) {
      setCreateError("Name and Reference Number are required.");
      return;
    }

    setCreateSubmitting(true);
    setCreateError(null);

    const payload: RFPProjectCreate = {
      name: createName,
      reference_number: createRefNum,
      customer_name: createCustName || null,
      customer_contact: createCustContact || null,
      submission_deadline: createDeadline ? new Date(createDeadline).toISOString() : null,
      description: createDesc || null,
    };

    try {
      const newProj = await createRFPProjectApi(payload);
      setShowCreateModal(false);
      setCreateName("");
      setCreateRefNum("");
      setCreateCustName("");
      setCreateCustContact("");
      setCreateDeadline("");
      setCreateDesc("");

      // Refresh list & select newly created project
      await fetchProjects();
      handleSelectProject(newProj.id);
    } catch (err: any) {
      setCreateError(err instanceof ApiError ? err.detail : "Failed to create RFP project");
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Populate Edit Form
  const handleOpenEdit = () => {
    if (!selectedProject) return;
    setEditName(selectedProject.name);
    setEditRefNum(selectedProject.reference_number);
    setEditCustName(selectedProject.customer_name || "");
    setEditCustContact(selectedProject.customer_contact || "");
    setEditDeadline(
      selectedProject.submission_deadline
        ? new Date(selectedProject.submission_deadline).toISOString().slice(0, 16)
        : ""
    );
    setEditDesc(selectedProject.description || "");
    setEditStatus(selectedProject.status);
    setEditError(null);
    setShowEditModal(true);
  };

  // Edit Action
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;

    setEditSubmitting(true);
    setEditError(null);

    const updatePayload: RFPProjectUpdate = {
      name: editName,
      reference_number: editRefNum,
      customer_name: editCustName || null,
      customer_contact: editCustContact || null,
      submission_deadline: editDeadline ? new Date(editDeadline).toISOString() : null,
      description: editDesc || null,
      status: editStatus,
    };

    try {
      const updated = await updateRFPProjectApi(selectedProject.id, updatePayload);
      setSelectedProject(updated);
      setShowEditModal(false);
      await fetchProjects();
    } catch (err: any) {
      setEditError(err instanceof ApiError ? err.detail : "Failed to update RFP project");
    } finally {
      setEditSubmitting(false);
    }
  };

  // Archive Action
  const handleArchive = async () => {
    if (!selectedProject) return;
    if (!confirm(`Are you sure you want to archive "${selectedProject.name}"?`)) return;

    setArchiveSubmitting(true);
    setArchiveError(null);

    try {
      const archived = await archiveRFPProjectApi(selectedProject.id);
      setSelectedProject(archived);
      await fetchProjects();
    } catch (err: any) {
      setArchiveError(err instanceof ApiError ? err.detail : "Failed to archive project");
    } finally {
      setArchiveSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Workspace Header / Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-900 border border-slate-800 p-5 rounded-2xl gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="text-xl">📁</span>
          <div>
            <h2 className="text-lg font-bold text-white">RFP Projects Workspace</h2>
            <p className="text-xs text-slate-400">
              Manage enterprise RFP submissions & response lifecycles
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl">
            <span className="text-xs text-slate-400 font-semibold uppercase">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="AWARDED">Awarded</option>
              <option value="LOST">Lost</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>

          {/* New RFP Button (PRODUCT_TEAM only) */}
          {isProductTeam ? (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-blue-500/20 transition flex items-center gap-1.5"
            >
              <span>+ New RFP Project</span>
            </button>
          ) : (
            <span className="px-3 py-1.5 bg-slate-800 text-slate-400 border border-slate-700 text-xs font-semibold rounded-xl">
              Read-Only Access
            </span>
          )}
        </div>
      </div>

      {/* Main Content Area: List vs Detail View */}
      {selectedProjectId && selectedProject ? (
        
        /* DETAIL VIEW */
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            
            {/* Detail Top Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-5 gap-4">
              <div className="space-y-1">
                <button
                  onClick={() => setSelectedProjectId(null)}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 mb-2"
                >
                  ← Back to RFP Projects List
                </button>
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl font-bold text-white">{selectedProject.name}</h3>
                  <span className={`px-3 py-1 text-xs font-mono font-bold rounded-lg border ${
                    selectedProject.status === "ACTIVE"
                      ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                      : selectedProject.status === "DRAFT"
                      ? "bg-slate-800 text-slate-300 border-slate-700"
                      : selectedProject.status === "SUBMITTED"
                      ? "bg-blue-950 text-blue-300 border-blue-800"
                      : selectedProject.status === "AWARDED"
                      ? "bg-indigo-950 text-indigo-300 border-indigo-800"
                      : selectedProject.status === "LOST"
                      ? "bg-amber-950 text-amber-300 border-amber-800"
                      : "bg-red-950 text-red-300 border-red-800"
                  }`}>
                    {selectedProject.status}
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-400">
                  Ref: <span className="text-slate-200">{selectedProject.reference_number}</span> | Created: {new Date(selectedProject.created_at).toLocaleDateString()}
                </div>
              </div>

              {/* Action Buttons for PRODUCT_TEAM */}
              {isProductTeam && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleOpenEdit}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition"
                  >
                    Edit Details
                  </button>

                  {selectedProject.status !== "ARCHIVED" && (
                    <button
                      onClick={handleArchive}
                      disabled={archiveSubmitting}
                      className="px-4 py-2 bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-200 text-xs font-semibold rounded-xl transition disabled:opacity-50"
                    >
                      {archiveSubmitting ? "Archiving..." : "Archive Project"}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Archive Error Alert */}
            {archiveError && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl">
                ⚠️ Archive Failed: {archiveError}
              </div>
            )}

            {/* Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <div className="text-xs text-slate-400 font-semibold uppercase">Customer Name</div>
                <div className="text-sm font-medium text-white">{selectedProject.customer_name || "N/A"}</div>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <div className="text-xs text-slate-400 font-semibold uppercase">Customer Contact</div>
                <div className="text-sm font-medium text-white">{selectedProject.customer_contact || "N/A"}</div>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <div className="text-xs text-slate-400 font-semibold uppercase">Submission Deadline</div>
                <div className="text-sm font-medium text-blue-300">
                  {selectedProject.submission_deadline
                    ? new Date(selectedProject.submission_deadline).toLocaleString()
                    : "No deadline specified"}
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="p-5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <h4 className="text-xs text-slate-400 font-semibold uppercase">Project Overview & Scope</h4>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                {selectedProject.description || "No project description provided."}
              </p>
            </div>

            {/* System Provenance Info */}
            <div className="p-4 bg-slate-950/40 border border-slate-800/60 rounded-xl text-xs font-mono text-slate-500 space-y-1">
              <div>Project UUID: <span className="text-slate-400">{selectedProject.id}</span></div>
              <div>Organization UUID: <span className="text-slate-400">{selectedProject.organization_id}</span></div>
              <div>Created By UUID: <span className="text-slate-400">{selectedProject.created_by_id}</span></div>
            </div>

          </div>

          {/* Real RFP Documents Section (Phase 4 & 5) */}
          <RFPDocumentsWorkspace
            projectId={selectedProject.id}
            projectName={selectedProject.name}
            userRole={user?.role || "VP"}
          />

          {/* Real AI Requirement Intelligence Section (Phase 6) */}
          <RFPRequirementsWorkspace
            projectId={selectedProject.id}
            projectName={selectedProject.name}
            userRole={user?.role || "VP"}
          />

          {/* Real Phase 9 Compliance & Risk Matrix Workspace */}
          <ComplianceWorkspace projectId={selectedProject.id} />

          {/* Real Phase 10 AI Proposal Generation Workspace */}
          <ProposalGenerationWorkspace
            projectId={selectedProject.id}
            projectName={selectedProject.name}
            userRole={user?.role || "VP"}
          />
        </div>

      ) : (

        /* LIST VIEW */
        <div className="space-y-6">
          
          {/* Error Banner */}
          {error && (
            <div className="p-4 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl flex justify-between items-center">
              <div>⚠️ {error}</div>
              <button onClick={fetchProjects} className="px-3 py-1 bg-red-900 hover:bg-red-800 text-white rounded-lg text-xs">
                Retry
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3 shadow-xl">
              <svg className="animate-spin h-8 w-8 text-blue-500 mx-auto" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-sm font-mono text-slate-400">Loading RFP Projects from FastAPI backend...</p>
            </div>
          ) : projects.length === 0 ? (
            
            /* Empty State */
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center space-y-4 shadow-xl">
              <div className="text-4xl">📂</div>
              <h3 className="text-lg font-bold text-white">No RFP projects yet.</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Create a new RFP project to begin managing document uploads, requirement extraction, and intelligent response generation.
              </p>
              {isProductTeam && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-500/20 transition inline-flex items-center gap-2"
                >
                  <span>+ Create First RFP Project</span>
                </button>
              )}
            </div>

          ) : (

            /* Projects Table / Cards */
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                <span className="text-xs font-mono text-slate-400">Showing {projects.length} Projects</span>
              </div>
              <div className="divide-y divide-slate-800">
                {projects.map((proj) => (
                  <div
                    key={proj.id}
                    onClick={() => handleSelectProject(proj.id)}
                    className="p-6 hover:bg-slate-800/40 transition cursor-pointer flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-bold text-white text-base group-hover:text-blue-400 transition">
                          {proj.name}
                        </h3>
                        <span className={`px-2.5 py-0.5 text-xs font-mono font-semibold rounded-md border ${
                          proj.status === "ACTIVE"
                            ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                            : proj.status === "DRAFT"
                            ? "bg-slate-800 text-slate-300 border-slate-700"
                            : proj.status === "SUBMITTED"
                            ? "bg-blue-950 text-blue-300 border-blue-800"
                            : proj.status === "AWARDED"
                            ? "bg-indigo-950 text-indigo-300 border-indigo-800"
                            : proj.status === "LOST"
                            ? "bg-amber-950 text-amber-300 border-amber-800"
                            : "bg-red-950 text-red-300 border-red-800"
                        }`}>
                          {proj.status}
                        </span>
                      </div>
                      {proj.description && (
                        <p className="text-xs text-slate-400 line-clamp-1 max-w-2xl">
                          {proj.description}
                        </p>
                      )}
                      <div className="text-xs font-mono text-slate-500 flex flex-wrap gap-x-4">
                        <span>Ref: <strong className="text-slate-400">{proj.reference_number}</strong></span>
                        {proj.customer_name && <span>Customer: <strong className="text-slate-400">{proj.customer_name}</strong></span>}
                        {proj.submission_deadline && (
                          <span className="text-blue-400 font-semibold">
                            Deadline: {new Date(proj.submission_deadline).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <button className="px-4 py-2 bg-slate-800 group-hover:bg-blue-600 group-hover:text-white text-slate-300 text-xs font-semibold rounded-xl transition whitespace-nowrap">
                      Open Project →
                    </button>
                  </div>
                ))}
              </div>
            </div>

          )}

        </div>
      )}

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">Create New RFP Project</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {createError && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl">
                ⚠️ {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 uppercase">Project Name *</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Global Financial Cloud RFP 2026"
                  required
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 text-sm mt-1 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase">Reference Number *</label>
                  <input
                    type="text"
                    value={createRefNum}
                    onChange={(e) => setCreateRefNum(e.target.value)}
                    placeholder="RFP-2026-001"
                    required
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase">Submission Deadline</label>
                  <input
                    type="datetime-local"
                    value={createDeadline}
                    onChange={(e) => setCreateDeadline(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase">Customer Name</label>
                  <input
                    type="text"
                    value={createCustName}
                    onChange={(e) => setCreateCustName(e.target.value)}
                    placeholder="e.g. Apex Global Financial"
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase">Customer Contact</label>
                  <input
                    type="text"
                    value={createCustContact}
                    onChange={(e) => setCreateCustContact(e.target.value)}
                    placeholder="e.g. procurement@apex.com"
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 uppercase">Description / Scope</label>
                <textarea
                  rows={3}
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder="Enter project summary or RFP objectives..."
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl p-3 text-sm mt-1 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-500/20 disabled:opacity-50"
                >
                  {createSubmitting ? "Creating in DB..." : "Create RFP Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && selectedProject && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">Edit RFP Project</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {editError && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl">
                ⚠️ {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 uppercase">Project Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2 text-sm mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase">Reference Number</label>
                  <input
                    type="text"
                    value={editRefNum}
                    onChange={(e) => setEditRefNum(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as ProjectStatusEnum)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 text-sm mt-1"
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="SUBMITTED">SUBMITTED</option>
                    <option value="AWARDED">AWARDED</option>
                    <option value="LOST">LOST</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase">Customer Name</label>
                  <input
                    type="text"
                    value={editCustName}
                    onChange={(e) => setEditCustName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase">Submission Deadline</label>
                  <input
                    type="datetime-local"
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 text-sm mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 uppercase">Description</label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl p-3 text-sm mt-1"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-500/20 disabled:opacity-50"
                >
                  {editSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
