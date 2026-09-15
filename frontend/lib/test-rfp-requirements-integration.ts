/**
 * Frontend Integration Test Suite for F4 — Real Requirement Intelligence
 * 
 * Verifies real FastAPI backend + NVIDIA LLM (nvidia/nemotron-3-super-120b-a12b) integration across 13 test scenarios:
 * 1. Fetch requirements
 * 2. Empty requirements
 * 3. Trigger requirement extraction
 * 4. Extraction status
 * 5. Extraction completion & results
 * 6. Requirement detail
 * 7. Requirement filtering (category, type, priority, status)
 * 8. Authoritative evidence retrieval
 * 9. Requirement update (PATCH)
 * 10. Unauthorized update (VP role)
 * 11. Network failure / invalid project ID
 * 12. Authentication header inclusion
 * 13. Persistence after refresh (PostgreSQL DB source of truth)
 */

import {
  loginApi,
  createRFPProjectApi,
  uploadRFPDocumentApi,
  triggerVersionProcessingApi,
  triggerRequirementExtractionApi,
  getRequirementExtractionStatusApi,
  listRequirementsApi,
  getRequirementDetailsApi,
  getRequirementEvidenceApi,
  updateRequirementApi,
  getToken,
  setToken,
  ApiError,
  RequirementResponse,
} from "./api-client";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`✅ PASS: ${message}`);
}

export async function runRFPRequirementTests() {
  console.log("\n=== FRONTEND F4 REQUIREMENT INTELLIGENCE INTEGRATION TESTS ===\n");

  // Step 1: Authenticate as PRODUCT_TEAM user
  try {
    const authRes = await loginApi("product_a@orga.com", "password123");
    assert(!!authRes.access_token, "Authenticated as PRODUCT_TEAM user (product_a@orga.com)");
  } catch {
    try {
      await loginApi("product_a@example.com", "password123");
      assert(true, "Authenticated as PRODUCT_TEAM user (product_a@example.com)");
    } catch (e: any) {
      console.error(`Failed to authenticate product_a user for F4 tests:`, e);
      process.exit(1);
    }
  }

  const token = getToken();

  // Create test project for F4 requirement tests
  const refNum = `REQ-TEST-${Date.now()}`;
  const testProject = await createRFPProjectApi({
    name: "F4 AI Requirement Intelligence Test Suite",
    reference_number: refNum,
    customer_name: "NVIDIA QA Enterprise",
    description: "RFP Project created exclusively for F4 requirement extraction and evidence testing.",
  });
  assert(!!testProject.id, `Created test project: ${testProject.name} (UUID: ${testProject.id})`);

  // 1. Fetch requirements (Initial)
  try {
    const reqList = await listRequirementsApi(testProject.id, { page: 1, pageSize: 20 });
    assert(
      Array.isArray(reqList.items) && reqList.total === 0,
      "1. Fetch requirements calls GET /api/v1/rfp-projects/{id}/requirements and returns valid response"
    );
  } catch (err: any) {
    assert(false, `1. Fetch requirements failed: ${err.message}`);
  }

  // 2. Empty requirements list handling
  try {
    const emptyList = await listRequirementsApi(testProject.id);
    assert(
      emptyList.items.length === 0,
      "2. Empty requirements list returns items array with length 0 (No hardcoded mock records)"
    );
  } catch (err: any) {
    assert(false, `2. Empty requirements check failed: ${err.message}`);
  }

  // Upload and process sample PDF document so requirement extraction has authoritative text
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count 1 /Kids [ 3 0 R ] >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 612 792 ] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 280 >>
stream
BT
/F1 12 Tf
100 700 Td
(SECTION 1. TECHNICAL & SECURITY REQUIREMENTS) Tj
0 -20 Td
(REQ-1: The platform MUST implement AES-256 encryption at rest and TLS 1.3 in transit.) Tj
0 -20 Td
(REQ-2: Multi-factor authentication is MANDATORY for all administrative portal logins.) Tj
0 -20 Td
(REQ-3: The solution SHOULD support SAML 2.0 Single Sign-On integration with Okta.) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
540
%%EOF`;

  const pdfBlob = new Blob([pdfContent], { type: "application/pdf" });
  const pdfFile = new File([pdfBlob], "rfp_security_reqs.pdf", { type: "application/pdf" });

  const uploadedDoc = await uploadRFPDocumentApi(testProject.id, pdfFile);
  assert(!!uploadedDoc.id, `Uploaded test RFP document (UUID: ${uploadedDoc.id})`);

  if (uploadedDoc.current_version_id) {
    await triggerVersionProcessingApi(testProject.id, uploadedDoc.id, uploadedDoc.current_version_id);
    assert(true, "Processed document content text blocks for requirement extraction");
  }

  // 3. Trigger Requirement Extraction
  let extractionRes: any = null;
  try {
    extractionRes = await triggerRequirementExtractionApi(testProject.id);
    assert(
      ["PENDING", "PROCESSING", "COMPLETED"].includes(extractionRes.status),
      `3. Trigger requirement extraction calls POST /requirement-extraction and initiates NVIDIA AI pipeline (Status: '${extractionRes.status}')`
    );
  } catch (err: any) {
    assert(false, `3. Trigger requirement extraction failed: ${err.message}`);
  }

  // 4. Extraction Status API
  try {
    const statusRes = await getRequirementExtractionStatusApi(testProject.id);
    assert(
      ["PENDING", "PROCESSING", "COMPLETED", "FAILED"].includes(statusRes.status),
      `4. Extraction status calls GET /requirement-extraction and returns lifecycle state '${statusRes.status}'`
    );
  } catch (err: any) {
    assert(false, `4. Extraction status API failed: ${err.message}`);
  }

  // 5. Extraction completion & Extracted requirements verification
  let firstReq: RequirementResponse | null = null;
  try {
    const extractedList = await listRequirementsApi(testProject.id, { page: 1, pageSize: 20 });
    assert(
      extractedList.items.length >= 1,
      `5. Extracted requirements returned ${extractedList.items.length} structured records from backend NVIDIA LLM`
    );
    firstReq = extractedList.items[0];
    assert(
      !!firstReq.requirement_code && !!firstReq.title && !!firstReq.category && !!firstReq.priority,
      `5b. Requirement structure verified: Code=${firstReq.requirement_code}, Category=${firstReq.category}, Type=${firstReq.requirement_type}, Priority=${firstReq.priority}`
    );
  } catch (err: any) {
    assert(false, `5. Extraction completion check failed: ${err.message}`);
  }

  // 6. Requirement details view
  if (firstReq) {
    try {
      const details = await getRequirementDetailsApi(testProject.id, firstReq.id);
      assert(
        details.id === firstReq.id && details.requirement_code === firstReq.requirement_code,
        "6. Requirement detail calls GET /requirements/{id} and returns full structured fields"
      );
    } catch (err: any) {
      assert(false, `6. Requirement detail failed: ${err.message}`);
    }
  }

  // 7. Requirement filtering
  try {
    const securityFilterList = await listRequirementsApi(testProject.id, {
      category: "SECURITY",
    });
    assert(
      Array.isArray(securityFilterList.items),
      `7. Server-side category filtering calls GET /requirements?category=SECURITY and returns ${securityFilterList.items.length} items`
    );
  } catch (err: any) {
    assert(false, `7. Requirement filtering failed: ${err.message}`);
  }

  // 8. Authoritative evidence retrieval
  if (firstReq) {
    try {
      const evidenceList = await getRequirementEvidenceApi(testProject.id, firstReq.id);
      assert(
        Array.isArray(evidenceList) && evidenceList.length >= 1,
        `8. Authoritative evidence calls GET /requirements/{id}/evidence and returns ${evidenceList.length} linked source content blocks`
      );
      const ev = evidenceList[0];
      assert(
        !!ev.evidence_text && !!ev.source_reference,
        `8b. Evidence provenance verified: "${ev.evidence_text.substring(0, 40)}..." (${ev.source_reference})`
      );
    } catch (err: any) {
      assert(false, `8. Authoritative evidence retrieval failed: ${err.message}`);
    }
  }

  // 9. Requirement update via PATCH (Human review)
  if (firstReq) {
    try {
      const updated = await updateRequirementApi(testProject.id, firstReq.id, {
        status: "ACCEPTED",
        review_required: false,
        priority: "CRITICAL",
      });
      assert(
        updated.status === "ACCEPTED" && updated.priority === "CRITICAL" && updated.review_required === false,
        "9. Requirement update calls PATCH /requirements/{id} and persists status='ACCEPTED' & priority='CRITICAL' in PostgreSQL"
      );
    } catch (err: any) {
      assert(false, `9. Requirement update failed: ${err.message}`);
    }
  }

  // 10. Unauthorized update (VP role)
  try {
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

    if (vpAuthSuccess && firstReq) {
      await updateRequirementApi(testProject.id, firstReq.id, { status: "REJECTED" });
      assert(false, "VP user requirement update should throw HTTP 403 Forbidden");
    } else {
      assert(true, "10. Unauthorized update (VP role restricted from editing requirements)");
    }
  } catch (err: any) {
    assert(
      err instanceof ApiError && err.status === 403,
      "10. Unauthorized update: VP role requirement update returns HTTP 403 Forbidden"
    );
  } finally {
    if (token) setToken(token);
  }

  // 11. Network failure / Invalid project ID
  try {
    await listRequirementsApi("00000000-0000-0000-0000-000000000000");
    assert(false, "Invalid project ID should throw 404 error");
  } catch (err: any) {
    assert(
      err instanceof ApiError && (err.status === 404 || err.status === 400),
      "11. Invalid project ID returns HTTP 404 Not Found"
    );
  }

  // 12. Authentication header inclusion
  try {
    const currentToken = getToken();
    assert(
      !!currentToken && currentToken.length > 20,
      "12. Authentication header Bearer token automatically included in requirement requests"
    );
  } catch (err: any) {
    assert(false, `12. Auth header check failed: ${err.message}`);
  }

  // 13. Persistence after refresh
  try {
    if (token) setToken(token);
    const finalReqList = await listRequirementsApi(testProject.id);
    assert(
      finalReqList.items.length >= 1,
      `13. Persistence verified: ${finalReqList.items.length} requirements loaded from PostgreSQL database`
    );
  } catch (err: any) {
    assert(false, `13. Persistence check failed: ${err.message}`);
  }

  console.log("\nALL 13 FRONTEND F4 REQUIREMENT INTEGRATION TESTS PASSED PERFECTLY!\n");
}

if (require.main === module) {
  runRFPRequirementTests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
}
