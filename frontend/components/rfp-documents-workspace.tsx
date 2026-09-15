"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  RFPDocumentResponse,
  DocumentVersionResponse,
  DocumentContentResponse,
  RoleEnum,
  listRFPDocumentsApi,
  uploadRFPDocumentApi,
  uploadNewDocumentVersionApi,
  getRFPDocumentVersionsApi,
  downloadRFPDocumentApi,
  archiveRFPDocumentApi,
  getVersionProcessingStatusApi,
  triggerVersionProcessingApi,
  getExtractedContentApi,
  ApiError,
} from "@/lib/api-client";

interface RFPDocumentsWorkspaceProps {
  projectId: string;
  projectName: string;
  userRole: RoleEnum;
}

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".pptx"];

export default function RFPDocumentsWorkspace({
  projectId,
  projectName,
  userRole,
}: RFPDocumentsWorkspaceProps) {
  const isProductTeam = userRole === "PRODUCT_TEAM";

  const [documents, setDocuments] = useState<RFPDocumentResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Upload State
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Version History Modal State
  const [showVersionModal, setShowVersionModal] = useState<boolean>(false);
  const [selectedDocForVersion, setSelectedDocForVersion] = useState<RFPDocumentResponse | null>(null);
  const [versions, setVersions] = useState<DocumentVersionResponse[]>([]);
  const [versionsLoading, setVersionsLoading] = useState<boolean>(false);
  const [versionUploadFile, setVersionUploadFile] = useState<File | null>(null);
  const [versionUploading, setVersionUploading] = useState<boolean>(false);
  const [versionError, setVersionError] = useState<string | null>(null);

  // Content Preview Modal State
  const [showContentModal, setShowContentModal] = useState<boolean>(false);
  const [selectedDocForContent, setSelectedDocForContent] = useState<RFPDocumentResponse | null>(null);
  const [extractedContent, setExtractedContent] = useState<DocumentContentResponse | null>(null);
  const [contentLoading, setContentLoading] = useState<boolean>(false);
  const [contentError, setContentError] = useState<string | null>(null);

  // Download / Action States
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Fetch Documents List
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listRFPDocumentsApi(projectId, 1, 100);
      setDocuments(res.items);
    } catch (err: any) {
      setError(err?.detail || "Failed to load RFP documents.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // 2. Controlled Polling for Pending/Processing Documents
  useEffect(() => {
    const hasPendingOrProcessing = documents.some((doc) => {
      const status = doc.current_version?.processing_status;
      return status === "PENDING" || status === "PROCESSING";
    });

    if (hasPendingOrProcessing) {
      if (!pollTimerRef.current) {
        pollTimerRef.current = setInterval(async () => {
          try {
            const res = await listRFPDocumentsApi(projectId, 1, 100);
            setDocuments(res.items);

            // Stop polling if all completed/failed
            const stillActive = res.items.some((doc) => {
              const status = doc.current_version?.processing_status;
              return status === "PENDING" || status === "PROCESSING";
            });
            if (!stillActive && pollTimerRef.current) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
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
  }, [documents, projectId]);

  // Client-Side File Validation
  const validateFile = (file: File): string | null => {
    if (file.size === 0) {
      return "Uploaded file is empty (0 bytes).";
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit of 50MB.`;
    }
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return `Unsupported file extension '${ext}'. Allowed: .pdf, .docx, .xlsx, .pptx`;
    }
    return null;
  };

  // Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const valErr = validateFile(file);
      if (valErr) {
        setUploadError(valErr);
        setSelectedFile(null);
      } else {
        setUploadError(null);
        setSelectedFile(file);
      }
    }
  };

  // Drag and Drop Handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const valErr = validateFile(file);
      if (valErr) {
        setUploadError(valErr);
        setSelectedFile(null);
      } else {
        setUploadError(null);
        setSelectedFile(file);
      }
    }
  };

  // 3. Upload Document Handler
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError("Please select a valid document to upload.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const uploadedDoc = await uploadRFPDocumentApi(projectId, selectedFile);
      setUploadSuccess(`Successfully uploaded "${uploadedDoc.name}". Processing initiated.`);
      setSelectedFile(null);
      setShowUploadModal(false);
      await fetchDocuments();
    } catch (err: any) {
      setUploadError(err?.detail || "Upload failed. Please check backend connection.");
    } finally {
      setUploading(false);
    }
  };

  // 4. Download Handler
  const handleDownload = async (documentId: string, versionId?: string) => {
    setDownloadingId(documentId);
    try {
      const res = await downloadRFPDocumentApi(projectId, documentId, versionId);
      if (res.download_url) {
        window.open(res.download_url, "_blank");
      }
    } catch (err: any) {
      alert(`Download failed: ${err?.detail || "Could not generate download URL"}`);
    } finally {
      setDownloadingId(null);
    }
  };

  // 5. Trigger / Retry Processing Handler
  const handleTriggerProcessing = async (documentId: string, versionId: string) => {
    setReprocessingId(documentId);
    try {
      await triggerVersionProcessingApi(projectId, documentId, versionId);
      await fetchDocuments();
    } catch (err: any) {
      alert(`Processing trigger failed: ${err?.detail || "Error triggering document processing"}`);
    } finally {
      setReprocessingId(null);
    }
  };

  // 6. Archive Document Handler
  const handleArchiveDocument = async (documentId: string) => {
    if (!confirm("Are you sure you want to archive this document?")) return;
    setArchivingId(documentId);
    try {
      await archiveRFPDocumentApi(projectId, documentId);
      await fetchDocuments();
    } catch (err: any) {
      alert(`Archive failed: ${err?.detail || "Error archiving document"}`);
    } finally {
      setArchivingId(null);
    }
  };

  // 7. Open Version History Modal
  const handleOpenVersions = async (doc: RFPDocumentResponse) => {
    setSelectedDocForVersion(doc);
    setShowVersionModal(true);
    setVersionsLoading(true);
    setVersionError(null);
    try {
      const vList = await getRFPDocumentVersionsApi(projectId, doc.id);
      setVersions(vList);
    } catch (err: any) {
      setVersionError(err?.detail || "Failed to load version history.");
    } finally {
      setVersionsLoading(false);
    }
  };

  // Upload New Version Submit
  const handleVersionUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocForVersion || !versionUploadFile) return;

    setVersionUploading(true);
    setVersionError(null);

    try {
      await uploadNewDocumentVersionApi(projectId, selectedDocForVersion.id, versionUploadFile);
      setVersionUploadFile(null);
      const updatedVersions = await getRFPDocumentVersionsApi(projectId, selectedDocForVersion.id);
      setVersions(updatedVersions);
      await fetchDocuments();
    } catch (err: any) {
      setVersionError(err?.detail || "Failed to upload new version.");
    } finally {
      setVersionUploading(false);
    }
  };

  // 8. Open Extracted Content Preview Modal
  const handleOpenContent = async (doc: RFPDocumentResponse) => {
    if (!doc.current_version_id) return;
    setSelectedDocForContent(doc);
    setShowContentModal(true);
    setContentLoading(true);
    setContentError(null);
    setExtractedContent(null);

    try {
      const contentRes = await getExtractedContentApi(projectId, doc.id, doc.current_version_id);
      setExtractedContent(contentRes);
    } catch (err: any) {
      setContentError(err?.detail || "Extracted content unavailable or processing not completed.");
    } finally {
      setContentLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      
      {/* Workspace Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-slate-800 gap-4">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <span>📄</span> Document Management & Processing
          </h3>
          <p className="text-xs text-slate-400">
            Real PostgreSQL & Celery pipeline for <span className="text-slate-200 font-semibold">{projectName}</span>
          </p>
        </div>

        {/* Action Button */}
        {isProductTeam ? (
          <button
            onClick={() => {
              setShowUploadModal(true);
              setUploadError(null);
              setSelectedFile(null);
            }}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-blue-500/20 transition flex items-center gap-1.5"
          >
            <span>+ Upload Document</span>
          </button>
        ) : (
          <span className="px-3 py-1.5 bg-slate-800 text-slate-400 border border-slate-700 text-xs font-semibold rounded-xl">
            Read-Only Document Access
          </span>
        )}
      </div>

      {/* Main Error State */}
      {error && (
        <div className="p-4 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl flex justify-between items-center">
          <div>⚠️ {error}</div>
          <button onClick={fetchDocuments} className="px-3 py-1 bg-red-900 hover:bg-red-800 text-white rounded-lg text-xs">
            Retry
          </button>
        </div>
      )}

      {/* Upload Success Alert */}
      {uploadSuccess && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs rounded-xl flex justify-between items-center">
          <div>✅ {uploadSuccess}</div>
          <button onClick={() => setUploadSuccess(null)} className="text-emerald-400 hover:text-emerald-200 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Documents List Area */}
      {loading ? (
        <div className="p-12 text-center space-y-3">
          <svg className="animate-spin h-8 w-8 text-blue-500 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-xs font-mono text-slate-400">Loading documents from FastAPI backend...</p>
        </div>
      ) : documents.length === 0 ? (
        
        /* Empty State */
        <div className="p-12 border border-dashed border-slate-800 rounded-xl text-center space-y-3 bg-slate-950/50">
          <div className="text-3xl">📁</div>
          <h4 className="text-sm font-bold text-white">No documents uploaded yet.</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Upload RFP specification files (.pdf, .docx, .xlsx, .pptx) to execute real text extraction and document indexing.
          </p>
          {isProductTeam && (
            <button
              onClick={() => {
                setShowUploadModal(true);
                setUploadError(null);
                setSelectedFile(null);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition"
            >
              Upload First Document
            </button>
          )}
        </div>

      ) : (

        /* Document Table */
        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 bg-slate-900/60">
                  <th className="py-3 px-4">Document Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Version</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Processing Status</th>
                  <th className="py-3 px-4">Uploaded Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-xs">
                {documents.map((doc) => {
                  const ver = doc.current_version;
                  const procStatus = ver?.processing_status || "PENDING";

                  return (
                    <tr key={doc.id} className="hover:bg-slate-900/50 transition">
                      
                      {/* Name */}
                      <td className="py-3 px-4 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <span className="text-base">
                            {doc.document_type === "PDF" ? "📕" : doc.document_type === "DOCX" ? "📘" : doc.document_type === "XLSX" ? "📊" : "📙"}
                          </span>
                          <div>
                            <div className="font-semibold text-slate-100">{doc.name}</div>
                            {ver?.original_filename && (
                              <div className="text-[10px] font-mono text-slate-500">{ver.original_filename}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 font-mono text-[10px] font-bold rounded border bg-slate-800 text-slate-300 border-slate-700">
                          {doc.document_type}
                        </span>
                      </td>

                      {/* Version Badge */}
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleOpenVersions(doc)}
                          className="px-2 py-0.5 font-mono text-[10px] font-bold rounded border bg-blue-950 text-blue-300 border-blue-800 hover:bg-blue-900 transition flex items-center gap-1"
                        >
                          v{ver?.version_number || 1}
                          <span className="text-[9px]">⚙️</span>
                        </button>
                      </td>

                      {/* Size */}
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {ver ? formatFileSize(ver.file_size_bytes) : "N/A"}
                      </td>

                      {/* Processing Status Badge */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          <span className={`w-fit px-2.5 py-1 font-mono text-[10px] font-bold rounded-lg border flex items-center gap-1.5 ${
                            procStatus === "COMPLETED"
                              ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                              : procStatus === "PROCESSING"
                              ? "bg-blue-950 text-blue-300 border-blue-800 animate-pulse"
                              : procStatus === "FAILED"
                              ? "bg-red-950 text-red-300 border-red-800"
                              : "bg-amber-950 text-amber-300 border-amber-800"
                          }`}>
                            {procStatus === "PROCESSING" && (
                              <svg className="animate-spin h-3 w-3 text-blue-400" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            )}
                            {procStatus}
                          </span>

                          {ver?.processing_error && (
                            <div className="text-[10px] text-red-400 max-w-xs truncate" title={ver.processing_error}>
                              ⚠️ {ver.processing_error}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Uploaded Date */}
                      <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          
                          {/* Extracted Content Button (If Completed) */}
                          {procStatus === "COMPLETED" && (
                            <button
                              onClick={() => handleOpenContent(doc)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px] rounded-lg border border-slate-700 transition"
                              title="View Extracted Text Preview"
                            >
                              Text Preview
                            </button>
                          )}

                          {/* Retry Processing Button (If Failed / Pending / Product Team) */}
                          {isProductTeam && (procStatus === "FAILED" || procStatus === "PENDING") && (
                            <button
                              onClick={() => ver && handleTriggerProcessing(doc.id, ver.id)}
                              disabled={reprocessingId === doc.id}
                              className="px-2.5 py-1 bg-amber-950 hover:bg-amber-900 border border-amber-800 text-amber-200 font-semibold text-[11px] rounded-lg transition disabled:opacity-50"
                            >
                              {reprocessingId === doc.id ? "Processing..." : "Process"}
                            </button>
                          )}

                          {/* Download Button */}
                          <button
                            onClick={() => handleDownload(doc.id, doc.current_version_id || undefined)}
                            disabled={downloadingId === doc.id}
                            className="px-2.5 py-1 bg-blue-950/60 hover:bg-blue-900 border border-blue-800 text-blue-200 font-semibold text-[11px] rounded-lg transition disabled:opacity-50"
                            title="Download Document"
                          >
                            {downloadingId === doc.id ? "Downloading..." : "Download"}
                          </button>

                          {/* Archive Button */}
                          {isProductTeam && doc.status !== "ARCHIVED" && (
                            <button
                              onClick={() => handleArchiveDocument(doc.id)}
                              disabled={archivingId === doc.id}
                              className="px-2 py-1 bg-red-950/50 hover:bg-red-900 border border-red-800 text-red-300 font-semibold text-[11px] rounded-lg transition disabled:opacity-50"
                              title="Archive Document"
                            >
                              Archive
                            </button>
                          )}

                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================
          UPLOAD DOCUMENT MODAL
         ======================================================================== */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>📤</span> Upload RFP Document
              </h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Error Alert */}
            {uploadError && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl">
                ⚠️ {uploadError}
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              
              {/* Drag and Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer ${
                  isDragOver
                    ? "border-blue-500 bg-blue-950/30"
                    : selectedFile
                    ? "border-emerald-500/60 bg-emerald-950/20"
                    : "border-slate-700 hover:border-slate-500 bg-slate-950/50"
                }`}
              >
                <input
                  type="file"
                  id="rfp-file-input"
                  accept=".pdf,.docx,.xlsx,.pptx"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label htmlFor="rfp-file-input" className="cursor-pointer space-y-2 block">
                  <div className="text-3xl">📁</div>
                  {selectedFile ? (
                    <div>
                      <div className="text-sm font-semibold text-emerald-300">{selectedFile.name}</div>
                      <div className="text-xs font-mono text-slate-400">{formatFileSize(selectedFile.size)}</div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-sm font-medium text-slate-200">
                        Drag and drop RFP file here, or <span className="text-blue-400 font-semibold underline">browse</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Supported formats: .pdf, .docx, .xlsx, .pptx (Max 50MB)
                      </div>
                    </div>
                  )}
                </label>
              </div>

              {/* Upload Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !selectedFile}
                  className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50 flex items-center gap-2"
                >
                  {uploading ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Uploading to Backend...</span>
                    </>
                  ) : (
                    <span>Upload & Process Document</span>
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================================
          VERSION HISTORY MODAL
         ======================================================================== */}
      {showVersionModal && selectedDocForVersion && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>⚙️</span> Version History
                </h3>
                <p className="text-xs text-slate-400 font-mono">{selectedDocForVersion.name}</p>
              </div>
              <button
                onClick={() => setShowVersionModal(false)}
                className="text-slate-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {versionError && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl">
                ⚠️ {versionError}
              </div>
            )}

            {/* Upload New Version (Product Team) */}
            {isProductTeam && (
              <form onSubmit={handleVersionUploadSubmit} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-200 uppercase">Upload New Document Version</h4>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept=".pdf,.docx,.xlsx,.pptx"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setVersionUploadFile(e.target.files[0]);
                      }
                    }}
                    className="text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-950 file:text-blue-300 hover:file:bg-blue-900 cursor-pointer"
                  />
                  <button
                    type="submit"
                    disabled={versionUploading || !versionUploadFile}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 whitespace-nowrap"
                  >
                    {versionUploading ? "Uploading..." : "Upload Version"}
                  </button>
                </div>
              </form>
            )}

            {/* Version List */}
            {versionsLoading ? (
              <div className="p-8 text-center text-xs font-mono text-slate-400">Loading version history...</div>
            ) : (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase">Persisted Document Versions</h4>
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                  {versions.map((v) => (
                    <div key={v.id} className="p-3 text-xs space-y-1">
                      <div className="flex justify-between items-center font-mono">
                        <span className="font-bold text-blue-300">Version {v.version_number}</span>
                        <span className="text-[10px] text-slate-500">{new Date(v.created_at).toLocaleString()}</span>
                      </div>
                      <div className="text-slate-300 font-medium">{v.original_filename}</div>
                      <div className="flex items-center gap-4 text-[10px] font-mono text-slate-400">
                        <span>Size: {formatFileSize(v.file_size_bytes)}</span>
                        <span>Status: <strong className="text-slate-200">{v.processing_status}</strong></span>
                      </div>
                      <div className="text-[9px] font-mono text-slate-600 truncate" title={v.checksum_sha256}>
                        SHA256: {v.checksum_sha256}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ========================================================================
          EXTRACTED CONTENT PREVIEW MODAL
         ======================================================================== */}
      {showContentModal && selectedDocForContent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-3xl w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>📖</span> Extracted Document Content
                </h3>
                <p className="text-xs text-slate-400 font-mono">{selectedDocForContent.name}</p>
              </div>
              <button
                onClick={() => setShowContentModal(false)}
                className="text-slate-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {contentError && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl">
                ⚠️ {contentError}
              </div>
            )}

            {contentLoading ? (
              <div className="p-12 text-center text-xs font-mono text-slate-400">Fetching extracted content...</div>
            ) : extractedContent ? (
              <div className="space-y-4">
                
                {/* Stats Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                    <div className="text-[10px] text-slate-500 uppercase">Characters</div>
                    <div className="text-base font-bold text-blue-300">{extractedContent.character_count.toLocaleString()}</div>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                    <div className="text-[10px] text-slate-500 uppercase">Source Units</div>
                    <div className="text-base font-bold text-indigo-300">{extractedContent.source_unit_count}</div>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl col-span-2 sm:col-span-1">
                    <div className="text-[10px] text-slate-500 uppercase">Content Blocks</div>
                    <div className="text-base font-bold text-emerald-300">{extractedContent.blocks.length}</div>
                  </div>
                </div>

                {/* Text Content Preview */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase">Full Extracted Text</h4>
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-300 max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {extractedContent.full_text || "No text extracted."}
                  </div>
                </div>

                {/* Sample Content Blocks */}
                {extractedContent.blocks.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase">Structured Source Blocks ({extractedContent.blocks.length})</h4>
                    <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden bg-slate-950 max-h-48 overflow-y-auto">
                      {extractedContent.blocks.slice(0, 10).map((block) => (
                        <div key={block.id} className="p-3 text-xs space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-slate-500">
                            <span>Block #{block.sequence_number} ({block.source_type})</span>
                            <span>Index: {block.source_index}</span>
                          </div>
                          <p className="text-slate-300 font-sans">{block.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            ) : null}

          </div>
        </div>
      )}

    </div>
  );
}
