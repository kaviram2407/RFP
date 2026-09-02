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
  processing_started_at?: string;
  processing_completed_at?: string;
  processing_error?: string;
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

export default function DocumentManagementPage() {
  const [role, setRole] = useState<"PRODUCT_TEAM" | "VP" | "CTO" | "CEO">("PRODUCT_TEAM");
  const [projectId, setProjectId] = useState<string>("sample-project-id");
  const [documents, setDocuments] = useState<RFPDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [selectedDocVersions, setSelectedDocVersions] = useState<DocumentVersion[] | null>(null);

  // Demo Mock Data for Visual Verification
  useEffect(() => {
    setDocuments([
      {
        id: "doc-uuid-1",
        name: "Enterprise_Analytics_RFP_Specification.pdf",
        document_type: "PDF",
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_version: {
          id: "ver-uuid-2",
          version_number: 2,
          original_filename: "Enterprise_Analytics_RFP_Specification_v2.pdf",
          content_type: "application/pdf",
          file_size_bytes: 4521000,
          checksum_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          processing_status: "COMPLETED",
          processing_started_at: new Date(Date.now() - 60000).toISOString(),
          processing_completed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      },
      {
        id: "doc-uuid-2",
        name: "Technical_Requirements_Matrix.xlsx",
        document_type: "XLSX",
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_version: {
          id: "ver-uuid-1",
          version_number: 1,
          original_filename: "Technical_Requirements_Matrix.xlsx",
          content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          file_size_bytes: 1240500,
          checksum_sha256: "a8f5c24298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b811",
          processing_status: "COMPLETED",
          processing_started_at: new Date(Date.now() - 30000).toISOString(),
          processing_completed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      },
    ]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const allowedExts = [".pdf", ".docx", ".xlsx", ".pptx"];
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

      if (!allowedExts.includes(ext)) {
        setError(`Invalid file format '${ext}'. Supported formats: PDF, DOCX, XLSX, PPTX.`);
        setSelectedFile(null);
        return;
      }

      if (file.size > 52428800) {
        setError(`File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds 50MB limit.`);
        setSelectedFile(null);
        return;
      }

      setSelectedFile(file);
    }
  };

  const handleUploadNewDoc = () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);

    setTimeout(() => {
      const extName = selectedFile.name.substring(selectedFile.name.lastIndexOf(".")).toUpperCase().replace(".", "");
      let docType: "PDF" | "DOCX" | "XLSX" | "PPTX" = "PDF";
      if (extName === "DOCX" || extName === "DOC") docType = "DOCX";
      else if (extName === "XLSX") docType = "XLSX";
      else if (extName === "PPTX") docType = "PPTX";

      const newDoc: RFPDocument = {
        id: `doc-${Date.now()}`,
        name: selectedFile.name,
        document_type: docType,
        status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_version: {
          id: `ver-${Date.now()}`,
          version_number: 1,
          original_filename: selectedFile.name,
          content_type: selectedFile.type || "application/octet-stream",
          file_size_bytes: selectedFile.size,
          checksum_sha256: "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
          processing_status: "COMPLETED",
          processing_started_at: new Date().toISOString(),
          processing_completed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      };

      setDocuments((prev) => [newDoc, ...prev]);
      setSelectedFile(null);
      setUploading(false);
    }, 800);
  };

  const handleDownload = (doc: RFPDocument, versionNumber?: number) => {
    alert(`Generating secure short-lived Cloudflare R2 presigned GET URL for '${doc.name}' (Version ${versionNumber || doc.current_version?.version_number || 1})...`);
  };

  const handleProcessRetry = (docId: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId && d.current_version
          ? {
              ...d,
              current_version: {
                ...d.current_version,
                processing_status: "PROCESSING" as const,
                processing_error: undefined,
              },
            }
          : d
      )
    );

    setTimeout(() => {
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === docId && d.current_version
            ? {
                ...d,
                current_version: {
                  ...d.current_version,
                  processing_status: "COMPLETED" as const,
                  processing_completed_at: new Date().toISOString(),
                },
              }
            : d
        )
      );
    }, 1200);
  };

  const isProductTeam = role === "PRODUCT_TEAM";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">AI-RFP Document & Text Extraction Engine</h1>
            <p className="text-slate-400 text-sm mt-1">
              Phase 5 — PyMuPDF, python-docx, openpyxl, python-pptx Extraction & Source Metadata Indexing
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

        {/* Upload Control Card */}
        {isProductTeam ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload RFP Document
              </h2>
              <span className="text-xs text-slate-500 font-mono">Parsers: PyMuPDF (.pdf), python-docx (.docx), openpyxl (.xlsx), python-pptx (.pptx)</span>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <input
                type="file"
                accept=".pdf,.docx,.xlsx,.pptx"
                onChange={handleFileSelect}
                className="block w-full text-sm text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer bg-slate-950 border border-slate-800 rounded-xl"
              />
              <button
                onClick={handleUploadNewDoc}
                disabled={!selectedFile || uploading}
                className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium text-sm rounded-xl transition shadow-lg shadow-blue-500/20 whitespace-nowrap"
              >
                {uploading ? "Uploading & Extracting..." : "Upload Document"}
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs font-medium">
                ⚠️ {error}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 bg-slate-900/50 border border-slate-800/60 rounded-xl text-slate-400 text-xs flex items-center gap-2">
            <span>🔒 Read-only view active for role <strong className="text-slate-200">{role}</strong>. Document upload and re-processing controls are disabled.</span>
          </div>
        )}

        {/* Document List Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-5 border-b border-slate-800 flex justify-between items-center">
            <h2 className="text-base font-semibold text-slate-200">RFP Project Documents & Extraction Lifecycle</h2>
            <span className="text-xs bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full font-mono">{documents.length} Files</span>
          </div>

          {documents.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              No documents uploaded for this RFP Project yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Document Name</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Version</th>
                    <th className="px-6 py-4">Text Processing Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {documents.map((doc) => {
                    const status = doc.current_version?.processing_status || "PENDING";
                    return (
                      <tr key={doc.id} className="hover:bg-slate-800/40 transition">
                        <td className="px-6 py-4 font-medium text-white flex items-center gap-3">
                          <span className="p-2 bg-slate-800 rounded-lg text-blue-400">📄</span>
                          {doc.name}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-400">{doc.document_type}</td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-blue-950 text-blue-300 font-mono text-xs font-semibold rounded-md border border-blue-800">
                            v{doc.current_version?.version_number || 1}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 text-xs font-semibold rounded-full border inline-flex items-center gap-1.5 ${
                              status === "COMPLETED"
                                ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                                : status === "PROCESSING"
                                ? "bg-blue-950 text-blue-300 border-blue-800 animate-pulse"
                                : status === "FAILED"
                                ? "bg-red-950 text-red-300 border-red-800"
                                : "bg-slate-800 text-slate-400 border-slate-700"
                            }`}
                          >
                            {status === "COMPLETED" && "✓ "}
                            {status === "PROCESSING" && "⚙ "}
                            {status === "FAILED" && "✖ "}
                            {status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-3">
                          <button
                            onClick={() => handleDownload(doc)}
                            className="text-xs text-blue-400 hover:text-blue-300 font-medium hover:underline"
                          >
                            Download
                          </button>

                          <button
                            onClick={() => setSelectedDocVersions(doc.current_version ? [doc.current_version] : [])}
                            className="text-xs text-slate-400 hover:text-slate-200 font-medium hover:underline"
                          >
                            Versions
                          </button>

                          {isProductTeam && (
                            <button
                              onClick={() => handleProcessRetry(doc.id)}
                              className="text-xs text-purple-400 hover:text-purple-300 font-medium hover:underline"
                            >
                              Reprocess
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Version & Extraction Metadata Drawer/Modal */}
        {selectedDocVersions && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-white">Version & Extraction Metadata</h3>
                <button
                  onClick={() => setSelectedDocVersions(null)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto">
                {selectedDocVersions.map((v) => (
                  <div key={v.id} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-sm text-slate-200">
                        Version {v.version_number} — {v.original_filename}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded">
                        {v.processing_status}
                      </span>
                    </div>

                    <div className="text-slate-500 font-mono text-xs space-y-1">
                      <div>SHA256: {v.checksum_sha256}</div>
                      <div>Size: {(v.file_size_bytes / 1024).toFixed(1)} KB</div>
                      {v.processing_completed_at && (
                        <div className="text-slate-400">Processed At: {new Date(v.processing_completed_at).toLocaleString()}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
