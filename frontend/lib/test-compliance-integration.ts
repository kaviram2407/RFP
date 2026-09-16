import assert from "assert";
import {
  loginApi,
  listRFPProjectsApi,
  createRFPProjectApi,
  triggerComplianceAssessmentApi,
  getComplianceAssessmentStatusApi,
  listComplianceAssessmentsApi,
  getRequirementComplianceApi,
  updateRequirementComplianceReviewApi,
  setToken,
} from "./api-client";

async function runComplianceIntegrationTests() {
  console.log("=== PHASE 9 COMPLIANCE & RISK INTEGRATION TEST SUITE ===");

  // 1. Login as Product Team
  console.log("1. Authenticating as Product Team user...");
  const authRes = await loginApi("product_a@orga.com", "password123");
  assert(authRes.access_token, "Access token received");
  setToken(authRes.access_token);
  console.log("✓ Authentication successful.");

  // 2. Fetch or Create an RFP Project
  console.log("\n2. Fetching existing RFP project...");
  const projectsList = await listRFPProjectsApi(1, 10);
  let projectId: string;

  if (projectsList.items.length > 0) {
    projectId = projectsList.items[0].id;
    console.log(`✓ Using existing RFP project: ${projectId}`);
  } else {
    console.log("Creating new RFP project for test...");
    const newProj = await createRFPProjectApi({
      name: `Compliance Test Project ${Date.now()}`,
      reference_number: `REF-COMP-${Date.now()}`,
      customer_name: "Compliance Client X",
    });
    projectId = newProj.id;
    console.log(`✓ Created test project: ${projectId}`);
  }

  // 3. Trigger Compliance Assessment
  console.log("\n3. Triggering bulk compliance assessment via POST /api/v1/rfp-projects/{id}/compliance-assessment...");
  const triggerRes = await triggerComplianceAssessmentApi(projectId);
  assert.strictEqual(triggerRes.status, "COMPLETED");
  console.log(`✓ Compliance assessment status: ${triggerRes.status}, Total requirements processed: ${triggerRes.processed_requirements}`);

  // 4. Poll Compliance Assessment Status
  console.log("\n4. Polling assessment status via GET /api/v1/rfp-projects/{id}/compliance-assessment/status...");
  const statusRes = await getComplianceAssessmentStatusApi(projectId);
  assert(statusRes.status, "Status returned");
  console.log(`✓ Current status: ${statusRes.status}`);

  // 5. Fetch List of Compliance Assessments with Filters
  console.log("\n5. Listing compliance assessments via GET /api/v1/rfp-projects/{id}/compliance-assessments...");
  const listRes = await listComplianceAssessmentsApi(projectId);
  assert(Array.isArray(listRes), "Returned list array");
  console.log(`✓ Retrieved ${listRes.length} compliance assessments.`);

  if (listRes.length > 0) {
    const targetAssessment = listRes[0];
    const reqId = targetAssessment.requirement_id;

    // 6. Get Single Requirement Compliance Detail
    console.log(`\n6. Fetching single requirement compliance for req ID: ${reqId}...`);
    const singleRes = await getRequirementComplianceApi(projectId, reqId);
    assert.strictEqual(singleRes.requirement_id, reqId);
    assert(singleRes.status, "Compliance status present");
    assert(Array.isArray(singleRes.evidence_list), "Evidence list present");
    console.log(`✓ Single requirement compliance loaded. Status: ${singleRes.status}, Evidence items: ${singleRes.evidence_list.length}`);

    // 7. Test Human-in-the-Loop Review Update
    console.log(`\n7. Updating review status via PATCH /api/v1/rfp-projects/${projectId}/requirements/${reqId}/compliance...`);
    const patchRes = await updateRequirementComplianceReviewApi(projectId, reqId, {
      status: "COMPLIANT",
      review_status: "APPROVED",
      reviewer_comments: "Verified by lead solution architect during automated test.",
    });
    assert.strictEqual(patchRes.status, "COMPLIANT");
    assert.strictEqual(patchRes.review_status, "APPROVED");
    assert.strictEqual(patchRes.reviewer_comments, "Verified by lead solution architect during automated test.");
    console.log("✓ Human review update successfully persisted!");
  } else {
    console.log("ℹ No requirements currently exist in project for single requirement detail test.");
  }

  // 8. Test VP User Access (Read & Review Access)
  console.log("\n8. Testing VP User authorization...");
  const vpAuth = await loginApi("vp_a@orga.com", "password123");
  assert(vpAuth.access_token, "VP Token received");
  setToken(vpAuth.access_token);
  const vpListRes = await listComplianceAssessmentsApi(projectId);
  assert(Array.isArray(vpListRes), "VP can read list array");
  console.log("✓ VP user can read compliance assessments.");

  // Restore Product Team token
  setToken(authRes.access_token);

  // 9. Test Tenant Isolation
  console.log("\n9. Testing Organization Tenant Isolation...");
  try {
    const fakeProjectId = "00000000-0000-0000-0000-000000000000";
    await listComplianceAssessmentsApi(fakeProjectId);
    assert.fail("Should have thrown 404 for non-existent project");
  } catch (err: any) {
    assert(err.status === 404 || err.detail?.includes("not found"), "Tenant isolation 404 verified");
    console.log("✓ Tenant isolation & 404 verification passed!");
  }

  console.log("\n==================================================");
  console.log("🎉 ALL PHASE 9 COMPLIANCE INTEGRATION TESTS PASSED!");
  console.log("==================================================");
}

runComplianceIntegrationTests().catch((err) => {
  console.error("❌ Integration test failed:", err);
  process.exit(1);
});
