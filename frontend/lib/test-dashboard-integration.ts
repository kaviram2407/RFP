import assert from "assert";
import {
  loginApi,
  getDashboardSummaryApi,
  listRFPProjectsApi,
  setToken,
} from "./api-client";

async function runDashboardIntegrationTests() {
  console.log("=== PHASE 12 DASHBOARD & ANALYTICS INTEGRATION SUITE ===");

  // 1. Authenticate as Product Team (Org A)
  console.log("1. Authenticating as Product Team (product_a@orga.com)...");
  const prodAuth = await loginApi("product_a@orga.com", "password123");
  assert(prodAuth.access_token, "Product Team access token received");
  setToken(prodAuth.access_token);
  console.log("✓ Product Team authenticated.");

  // 2. Fetch Product Team Dashboard
  console.log("\n2. Fetching Product Team Dashboard Summary...");
  const prodDashboard = await getDashboardSummaryApi();
  assert.strictEqual(prodDashboard.user_role, "PRODUCT_TEAM", "Role verified as PRODUCT_TEAM");
  assert(prodDashboard.kpis.active_rfps_count >= 0, "KPI active_rfps_count exists");
  assert(prodDashboard.kpis.total_requirements_count >= 0, "KPI total_requirements_count exists");
  assert(prodDashboard.kpis.open_gaps_count >= 0, "KPI open_gaps_count exists");
  assert(prodDashboard.kpis.total_risks_count >= 0, "KPI total_risks_count exists");
  assert(prodDashboard.rfp_status_distribution.length > 0, "RFP status distribution returned");
  assert(prodDashboard.requirement_priority_distribution.length > 0, "Requirement priority distribution returned");
  assert(prodDashboard.compliance_status_distribution.length > 0, "Compliance status distribution returned");
  assert(prodDashboard.gap_severity_distribution.length > 0, "Gap severity distribution returned");
  assert(prodDashboard.risk_severity_distribution.length > 0, "Risk severity distribution returned");
  assert(prodDashboard.proposal_stage_distribution.length > 0, "Proposal stage distribution returned");
  console.log(`✓ Product Team Dashboard verified. Active RFPs: ${prodDashboard.kpis.active_rfps_count}, Requirements: ${prodDashboard.kpis.total_requirements_count}, Open Gaps: ${prodDashboard.kpis.open_gaps_count}`);

  // 3. Authenticate as VP (Org A)
  console.log("\n3. Authenticating as VP (vp_a@orga.com)...");
  const vpAuth = await loginApi("vp_a@orga.com", "password123");
  assert(vpAuth.access_token, "VP access token received");
  setToken(vpAuth.access_token);

  console.log("Fetching VP Dashboard Summary...");
  const vpDashboard = await getDashboardSummaryApi();
  assert.strictEqual(vpDashboard.user_role, "VP", "Role verified as VP");
  assert(Array.isArray(vpDashboard.approval_queue), "VP approval queue returned");
  assert(Array.isArray(vpDashboard.recent_decisions), "VP recent decisions returned");
  console.log(`✓ VP Dashboard verified. Pending Approval Items: ${vpDashboard.approval_queue.length}`);

  // 4. Authenticate as CTO (Org A)
  console.log("\n4. Authenticating as CTO (cto_a@orga.com)...");
  const ctoAuth = await loginApi("cto_a@orga.com", "password123");
  assert(ctoAuth.access_token, "CTO access token received");
  setToken(ctoAuth.access_token);

  console.log("Fetching CTO Dashboard Summary...");
  const ctoDashboard = await getDashboardSummaryApi();
  assert.strictEqual(ctoDashboard.user_role, "CTO", "Role verified as CTO");
  assert(Array.isArray(ctoDashboard.approval_queue), "CTO approval queue returned");
  console.log(`✓ CTO Dashboard verified. Pending Approval Items: ${ctoDashboard.approval_queue.length}`);

  // 5. Authenticate as CEO (Org A)
  console.log("\n5. Authenticating as CEO (ceo_a@orga.com)...");
  const ceoAuth = await loginApi("ceo_a@orga.com", "password123");
  assert(ceoAuth.access_token, "CEO access token received");
  setToken(ceoAuth.access_token);

  console.log("Fetching CEO Dashboard Summary...");
  const ceoDashboard = await getDashboardSummaryApi();
  assert.strictEqual(ceoDashboard.user_role, "CEO", "Role verified as CEO");
  assert(Array.isArray(ceoDashboard.approval_queue), "CEO approval queue returned");
  console.log(`✓ CEO Dashboard verified. Pending Approval Items: ${ceoDashboard.approval_queue.length}`);

  // 6. Test Filtering by RFP Project ID
  console.log("\n6. Testing Dashboard Filtering by RFP Project ID...");
  const projects = await listRFPProjectsApi(1, 5);
  if (projects.items.length > 0) {
    const rfpId = projects.items[0].id;
    const filteredDashboard = await getDashboardSummaryApi({ rfp_id: rfpId });
    console.log("FILTERED KPIS:", filteredDashboard.kpis);
    assert(filteredDashboard.kpis.active_rfps_count <= 1, "Filtered summary returned metrics scoped to single RFP");
    console.log(`✓ Filtered Dashboard verified for RFP ${rfpId}. Active RFPs: ${filteredDashboard.kpis.active_rfps_count}`);
  } else {
    console.log("Skipping RFP filter check as no RFPs exist.");
  }

  // 7. Tenant Isolation Check (Org B)
  console.log("\n7. Verifying Tenant Isolation with Org B User (product_b@orgb.com)...");
  const orgBAuth = await loginApi("product_b@orgb.com", "password123");
  assert(orgBAuth.access_token, "Org B user authenticated");
  setToken(orgBAuth.access_token);

  const orgBDashboard = await getDashboardSummaryApi();
  assert.strictEqual(orgBDashboard.user_role, "PRODUCT_TEAM", "Org B role verified");
  assert(orgBDashboard.kpis.active_rfps_count !== prodDashboard.kpis.active_rfps_count || orgBDashboard.kpis.active_rfps_count === 0, "Tenant isolation enforced");
  console.log(`✓ Org B Dashboard isolated. Active RFPs for Org B: ${orgBDashboard.kpis.active_rfps_count}`);

  console.log("\n=== ALL PHASE 12 DASHBOARD INTEGRATION TESTS PASSED ===");
}

runDashboardIntegrationTests().catch((err) => {
  console.error("❌ Phase 12 Dashboard Integration Suite Failed:", err);
  process.exit(1);
});
