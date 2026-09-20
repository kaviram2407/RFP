import assert from "assert";
import {
  loginApi,
  listRFPProjectsApi,
  createProposalApi,
  submitProposalVersionForReviewApi,
  reviewProposalVersionApi,
  getProposalApprovalStatusApi,
  getProposalApprovalHistoryApi,
  createProposalRevisionApi,
  updateProposalSectionApi,
  getProposalApi,
  setToken,
} from "./api-client";

async function runApprovalWorkflowIntegrationTests() {
  console.log("=== PHASE 11 REVIEW & EXECUTIVE APPROVAL WORKFLOW INTEGRATION SUITE ===");

  // 1. Authenticate as Product Team
  console.log("1. Authenticating as Product Team (product_a@orga.com)...");
  const prodAuth = await loginApi("product_a@orga.com", "password123");
  assert(prodAuth.access_token, "Product Team access token received");
  setToken(prodAuth.access_token);
  console.log("✓ Product Team authenticated.");

  // 2. Fetch RFP Project & Create Proposal
  console.log("\n2. Fetching RFP project & creating proposal...");
  const projectsList = await listRFPProjectsApi(1, 10);
  assert(projectsList.items.length > 0, "RFP project exists");
  const projectId = projectsList.items[0].id;

  const proposalTitle = `Phase 11 Approval Proposal ${Date.now()}`;
  const proposal = await createProposalApi(projectId, proposalTitle, "Phase 11 workflow test");
  const proposalId = proposal.id;
  const v1Id = proposal.current_version_id!;
  console.log(`✓ Created Proposal ID: ${proposalId}, Version 1 ID: ${v1Id}`);

  // 3. Product Team submits Version 1 for review
  console.log("\n3. Product Team submitting Version 1 for review...");
  const v1Submitted = await submitProposalVersionForReviewApi(proposalId, v1Id);
  assert.strictEqual(v1Submitted.status, "VP_REVIEW", "Status changed to VP_REVIEW");
  assert.strictEqual(v1Submitted.current_stage, "VP", "Current stage set to VP");
  assert.strictEqual(v1Submitted.is_immutable, true, "Version is marked immutable");
  console.log("✓ Version 1 submitted for review. Status: VP_REVIEW, Stage: VP, Immutable: true.");

  // 4. Immutability check: Attempt section update on Version 1 should fail
  console.log("\n4. Verifying immutability guard on Version 1...");
  let updateFailed = false;
  try {
    const secId = v1Submitted.sections[0].id;
    await updateProposalSectionApi(proposalId, v1Id, secId, { content: "Unauthorized edit attempt" });
  } catch (err: any) {
    updateFailed = true;
    console.log(`✓ Section edit blocked as expected: ${err.message || err}`);
  }
  assert(updateFailed, "Section edit on locked Version 1 correctly threw an error");

  // 5. VP Review: VP approves Version 1 -> Advances to CTO_REVIEW
  console.log("\n5. VP authenticating and approving VP stage...");
  const vpAuth = await loginApi("vp_a@orga.com", "password123");
  setToken(vpAuth.access_token);

  const vpReviewResp = await reviewProposalVersionApi(
    proposalId,
    v1Id,
    "APPROVED",
    "VP Commercial & Legal risk assessment approved."
  );
  assert.strictEqual(vpReviewResp.stage, "VP");
  assert.strictEqual(vpReviewResp.decision, "APPROVED");
  console.log("✓ VP Stage approved successfully.");

  // 6. Check status after VP approval -> stage should be CTO, status CTO_REVIEW
  const statusAfterVp = await getProposalApprovalStatusApi(proposalId, v1Id);
  assert.strictEqual(statusAfterVp.current_stage, "CTO");
  assert.strictEqual(statusAfterVp.current_status, "CTO_REVIEW");
  assert.strictEqual(statusAfterVp.can_user_approve, false, "VP cannot approve CTO stage");
  console.log("✓ Proposal advanced to CTO_REVIEW stage.");

  // 7. CTO Review: CTO requests changes on Version 1 -> Status changes to CHANGES_REQUESTED
  console.log("\n7. CTO authenticating and requesting changes...");
  const ctoAuth = await loginApi("cto_a@orga.com", "password123");
  setToken(ctoAuth.access_token);

  const ctoStatus = await getProposalApprovalStatusApi(proposalId, v1Id);
  assert.strictEqual(ctoStatus.can_user_approve, true, "CTO is authorized to review at CTO stage");

  const ctoReviewResp = await reviewProposalVersionApi(
    proposalId,
    v1Id,
    "REQUEST_CHANGES",
    "Please update Section 2 with zero-trust data residency guarantees."
  );
  assert.strictEqual(ctoReviewResp.decision, "REQUEST_CHANGES");
  console.log("✓ CTO requested changes on Version 1.");

  // 8. Revision Pathway: Product Team creates Version 2 revision
  console.log("\n8. Product Team creating Version 2 revision...");
  setToken(prodAuth.access_token);

  const v2 = await createProposalRevisionApi(proposalId, v1Id);
  assert.strictEqual(v2.version_number, 2, "New version number is 2");
  assert.strictEqual(v2.status, "DRAFT", "Version 2 is in DRAFT status");
  assert.strictEqual(v2.is_immutable, false, "Version 2 is mutable");
  const v2Id = v2.id;
  console.log(`✓ Version 2 created. ID: ${v2Id}, Status: DRAFT, Immutable: false.`);

  // 9. Edit section on Version 2 (Mutable)
  console.log("\n9. Product Team editing section on Version 2...");
  const v2SecId = v2.sections[0].id;
  const editedSec = await updateProposalSectionApi(proposalId, v2Id, v2SecId, {
    content: "## Executive Summary\nUpdated with zero-trust data residency guarantees as requested by CTO.",
  });
  assert(editedSec.content.includes("zero-trust data residency"), "Section edit persisted on Version 2");
  console.log("✓ Section edited successfully on Version 2.");

  // 10. Product Team submits Version 2 for review
  console.log("\n10. Submitting Version 2 for review...");
  const v2Submitted = await submitProposalVersionForReviewApi(proposalId, v2Id);
  assert.strictEqual(v2Submitted.status, "VP_REVIEW");
  console.log("✓ Version 2 submitted for review.");

  // 11. Full Linear Approval Workflow on Version 2: VP -> CTO -> CEO -> APPROVED
  console.log("\n11. Running full linear approval pipeline on Version 2...");
  
  // VP Approves V2
  setToken(vpAuth.access_token);
  await reviewProposalVersionApi(proposalId, v2Id, "APPROVED", "VP approved V2.");
  console.log("  ✓ VP approved Version 2.");

  // CTO Approves V2
  setToken(ctoAuth.access_token);
  await reviewProposalVersionApi(proposalId, v2Id, "APPROVED", "CTO zero-trust architecture approved V2.");
  console.log("  ✓ CTO approved Version 2.");

  // CEO Approves V2
  const ceoAuth = await loginApi("ceo_a@orga.com", "password123");
  setToken(ceoAuth.access_token);
  const ceoApproval = await reviewProposalVersionApi(proposalId, v2Id, "APPROVED", "CEO final commercial approval granted.");
  assert.strictEqual(ceoApproval.decision, "APPROVED");
  console.log("  ✓ CEO approved Version 2.");

  // 12. Verify Final Approved Proposal Status & History
  console.log("\n12. Verifying final proposal status & approval audit history...");
  const finalStatus = await getProposalApprovalStatusApi(proposalId, v2Id);
  assert.strictEqual(finalStatus.current_status, "APPROVED");
  assert.strictEqual(finalStatus.is_immutable, true);

  const history = await getProposalApprovalHistoryApi(proposalId, v2Id);
  assert.strictEqual(history.length, 3, "History contains 3 approval records (VP, CTO, CEO)");
  console.log(`✓ Final status verified: APPROVED. ${history.length} approval record(s) in audit log.`);

  const propFinal = await getProposalApi(proposalId);
  assert.strictEqual(propFinal.status, "APPROVED");
  console.log(`✓ Overall Proposal Status: ${propFinal.status}.`);

  console.log("\n=== ALL PHASE 11 INTEGRATION TESTS PASSED PERFECTLY ===");
}

runApprovalWorkflowIntegrationTests().catch((err) => {
  console.error("❌ Integration test failed:", err);
  process.exit(1);
});
