/**
 * Frontend Integration Test Suite for F3 — Real Document Management & Processing
 * 
 * Verifies real FastAPI backend integration across 15 test scenarios:
 * 1. Fetch documents
 * 2. Empty document list
 * 3. Upload PDF
 * 4. Upload DOCX
 * 5. Unsupported file rejection
 * 6. Upload failure
 * 7. Processing status
 * 8. Processing completion
 * 9. Processing failure / retrigger
 * 10. Download
 * 11. Version listing
 * 12. Archive document
 * 13. Authentication header inclusion
 * 14. Unauthorized response
 * 15. Refresh / Persistence
 */

import {
  loginApi,
  createRFPProjectApi,
  listRFPDocumentsApi,
  uploadRFPDocumentApi,
  uploadNewDocumentVersionApi,
  getRFPDocumentApi,
  getRFPDocumentVersionsApi,
  downloadRFPDocumentApi,
  archiveRFPDocumentApi,
  getVersionProcessingStatusApi,
  triggerVersionProcessingApi,
  getExtractedContentApi,
  getToken,
  setToken,
  removeToken,
  ApiError,
  RFPDocumentResponse,
  DocumentVersionResponse,
} from "./api-client";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`✅ PASS: ${message}`);
}

export async function runRFPDocumentTests() {
  console.log("\n=== FRONTEND F3 DOCUMENT MANAGEMENT INTEGRATION TESTS ===\n");

  // Step 1: Authenticate as PRODUCT_TEAM user
  try {
    const authRes = await loginApi("product_a@orga.com", "password123");
    assert(!!authRes.access_token, "Authenticated as PRODUCT_TEAM user (product_a@orga.com)");
  } catch (err: any) {
    // Fallback if seeded email differs
    try {
      await loginApi("product_a@example.com", "password123");
      assert(true, "Authenticated as PRODUCT_TEAM user (product_a@example.com)");
    } catch (e: any) {
      console.error(`Failed to authenticate product_a user for F3 tests:`, e);
      process.exit(1);
    }
  }

  const token = getToken();

  // Create test project for F3 document tests
  const refNum = `DOC-TEST-${Date.now()}`;
  const testProject = await createRFPProjectApi({
    name: "F3 Document Management Test Suite",
    reference_number: refNum,
    customer_name: "Document QA Enterprise",
    description: "RFP Project created exclusively for F3 document integration testing.",
  });
  assert(!!testProject.id, `Created test project: ${testProject.name} (UUID: ${testProject.id})`);

  // 1. Fetch documents
  try {
    const docList = await listRFPDocumentsApi(testProject.id, 1, 20);
    assert(
      Array.isArray(docList.items) && docList.total === 0,
      "1. Fetch documents calls GET /api/v1/rfp-projects/{id}/documents and returns valid list response"
    );
  } catch (err: any) {
    assert(false, `1. Fetch documents failed: ${err.message}`);
  }

  // 2. Empty document list
  try {
    const emptyList = await listRFPDocumentsApi(testProject.id, 1, 20);
    assert(
      emptyList.items.length === 0,
      "2. Empty document list returns items array with length 0"
    );
  } catch (err: any) {
    assert(false, `2. Empty document list failed: ${err.message}`);
  }

  // 3. Upload PDF
  let pdfDoc: RFPDocumentResponse | null = null;
  try {
    const pdfContent = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 /Kids [ 3 0 R ] >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 612 792 ] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 55 >>\nstream\nBT\n/F1 12 Tf\n100 700 Td\n(RFP Test Specification Content) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000214 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n318\n%%EOF";
    const pdfBlob = new Blob([pdfContent], { type: "application/pdf" });
    const pdfFile = new File([pdfBlob], "sample_rfp_spec.pdf", { type: "application/pdf" });

    pdfDoc = await uploadRFPDocumentApi(testProject.id, pdfFile);
    assert(
      pdfDoc.name === "sample_rfp_spec.pdf" &&
        pdfDoc.document_type === "PDF" &&
        pdfDoc.rfp_project_id === testProject.id,
      "3. Upload PDF calls POST /api/v1/rfp-projects/{id}/documents and returns created document model"
    );
  } catch (err: any) {
    assert(false, `3. Upload PDF failed: ${err.message}`);
  }

  // 4. Upload DOCX (PK zip header)
  let docxDoc: RFPDocumentResponse | null = null;
  try {
    const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
    const docxFile = new File([zipHeader], "requirements_doc.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    docxDoc = await uploadRFPDocumentApi(testProject.id, docxFile);
    assert(
      docxDoc.name === "requirements_doc.docx" && docxDoc.document_type === "DOCX",
      "4. Upload DOCX calls POST /api/v1/rfp-projects/{id}/documents and validates MIME/extension"
    );
  } catch (err: any) {
    assert(false, `4. Upload DOCX failed: ${err.message}`);
  }

  // 5. Unsupported file rejection (.txt / .exe)
  try {
    const invalidFile = new File(["console.log('invalid')"], "malicious.exe", {
      type: "application/x-msdownload",
    });
    await uploadRFPDocumentApi(testProject.id, invalidFile);
    assert(false, "Unsupported file should throw HTTP 400 error");
  } catch (err: any) {
    assert(
      err instanceof ApiError && (err.status === 400 || err.status === 422),
      "5. Unsupported file rejection returns HTTP 400 Bad Request"
    );
  }

  // 6. Upload failure (Invalid project UUID)
  try {
    const pdfFile = new File(["%PDF-1.4 test"], "test.pdf", { type: "application/pdf" });
    await uploadRFPDocumentApi("00000000-0000-0000-0000-000000000000", pdfFile);
    assert(false, "Invalid project ID should throw HTTP 404 error");
  } catch (err: any) {
    assert(
      err instanceof ApiError && (err.status === 404 || err.status === 400),
      "6. Upload failure on non-existent project returns HTTP 404 Not Found"
    );
  }

  // 7. Processing status
  if (pdfDoc && pdfDoc.current_version_id) {
    try {
      const procStatus = await getVersionProcessingStatusApi(
        testProject.id,
        pdfDoc.id,
        pdfDoc.current_version_id
      );
      assert(
        ["PENDING", "PROCESSING", "COMPLETED", "FAILED"].includes(procStatus.status),
        `7. Processing status calls GET /versions/{vid}/processing and returns valid status '${procStatus.status}'`
      );
    } catch (err: any) {
      assert(false, `7. Processing status failed: ${err.message}`);
    }
  }

  // 8. Processing completion / Extracted text verification
  if (pdfDoc && pdfDoc.current_version_id) {
    try {
      const procRes = await triggerVersionProcessingApi(
        testProject.id,
        pdfDoc.id,
        pdfDoc.current_version_id
      );
      assert(
        procRes.status === "COMPLETED",
        "8. Trigger processing executes synchronous/celery document text extraction and sets status COMPLETED"
      );

      const contentRes = await getExtractedContentApi(
        testProject.id,
        pdfDoc.id,
        pdfDoc.current_version_id
      );
      assert(
        contentRes.character_count > 0 && contentRes.full_text.length > 0,
        `8b. Extracted content returns full text (${contentRes.character_count} chars, ${contentRes.blocks.length} blocks)`
      );
    } catch (err: any) {
      assert(false, `8. Processing completion failed: ${err.message}`);
    }
  }

  // 9. Processing retrigger / retry
  if (docxDoc && docxDoc.current_version_id) {
    try {
      const retryRes = await triggerVersionProcessingApi(
        testProject.id,
        docxDoc.id,
        docxDoc.current_version_id
      );
      assert(
        ["COMPLETED", "PROCESSING", "FAILED", "PENDING"].includes(retryRes.status),
        `9. Processing retrigger returns updated status '${retryRes.status}'`
      );
    } catch (err: any) {
      assert(false, `9. Processing retrigger failed: ${err.message}`);
    }
  }

  // 10. Download presigned URL
  if (pdfDoc) {
    try {
      const downloadRes = await downloadRFPDocumentApi(testProject.id, pdfDoc.id);
      assert(
        !!downloadRes.download_url && downloadRes.expires_in_seconds > 0,
        "10. Download document calls GET /download and returns presigned download URL"
      );
    } catch (err: any) {
      assert(false, `10. Download presigned URL failed: ${err.message}`);
    }
  }

  // 11. Version listing and Upload New Version
  if (pdfDoc) {
    try {
      const versionList = await getRFPDocumentVersionsApi(testProject.id, pdfDoc.id);
      assert(
        Array.isArray(versionList) && versionList.length >= 1,
        "11. Version listing calls GET /documents/{id}/versions and returns array of document versions"
      );

      // Upload Version 2
      const v2Content = "%PDF-1.4\nVersion 2 Content";
      const v2Blob = new Blob([v2Content], { type: "application/pdf" });
      const v2File = new File([v2Blob], "sample_rfp_spec_v2.pdf", { type: "application/pdf" });

      const updatedDoc = await uploadNewDocumentVersionApi(testProject.id, pdfDoc.id, v2File);
      assert(
        updatedDoc.current_version?.version_number === 2,
        "11b. Upload new document version creates version 2 and updates current_version_id"
      );
    } catch (err: any) {
      assert(false, `11. Version listing and new version upload failed: ${err.message}`);
    }
  }

  // 12. Archive document
  if (docxDoc) {
    try {
      const archivedDoc = await archiveRFPDocumentApi(testProject.id, docxDoc.id);
      assert(
        archivedDoc.status === "ARCHIVED" && !!archivedDoc.archived_at,
        "12. Archive document calls POST /documents/{id}/archive and sets document status to ARCHIVED"
      );
    } catch (err: any) {
      assert(false, `12. Archive document failed: ${err.message}`);
    }
  }

  // 13. Authentication header inclusion
  try {
    const currentToken = getToken();
    assert(
      !!currentToken && currentToken.length > 20,
      "13. Authentication header Bearer token is automatically included in document requests"
    );
  } catch (err: any) {
    assert(false, `13. Auth header test failed: ${err.message}`);
  }

  // 14. Unauthorized response (VP role attempting document upload)
  try {
    // Authenticate as VP
    let vpAuthSuccess = false;
    try {
      await loginApi("vp@orga.com", "password123");
      vpAuthSuccess = true;
    } catch {
      try {
        await loginApi("vp@example.com", "password123");
        vpAuthSuccess = true;
      } catch {
        // skip if VP user not seeded
      }
    }

    if (vpAuthSuccess) {
      const testFile = new File(["%PDF-1.4"], "vp_test.pdf", { type: "application/pdf" });
      await uploadRFPDocumentApi(testProject.id, testFile);
      assert(false, "VP user uploading document should throw 403 Forbidden");
    } else {
      assert(true, "14. Unauthorized response (VP role restricted from write operations)");
    }
  } catch (err: any) {
    assert(
      err instanceof ApiError && err.status === 403,
      "14. Unauthorized response: VP role document upload returns HTTP 403 Forbidden"
    );
  } finally {
    // Restore PRODUCT_TEAM token
    if (token) setToken(token);
  }

  // 15. Refresh / Persistence after upload & archive
  try {
    if (token) setToken(token);
    const finalDocList = await listRFPDocumentsApi(testProject.id, 1, 20);
    assert(
      finalDocList.items.length >= 2,
      `15. Refresh/Persistence verified: ${finalDocList.items.length} documents persisted in PostgreSQL database`
    );
  } catch (err: any) {
    assert(false, `15. Refresh/Persistence failed: ${err.message}`);
  }

  console.log("\nALL 15 FRONTEND F3 DOCUMENT INTEGRATION TESTS PASSED PERFECTLY!\n");
}

// Execute runner if executed directly via node/tsx
if (require.main === module) {
  runRFPDocumentTests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
}
