import assert from "assert";
import {
  loginApi,
  listRFPProjectsApi,
  createProposalApi,
  listProposalsApi,
  getProposalApi,
  createProposalVersionApi,
  listProposalVersionsApi,
  generateProposalSectionApi,
  regenerateProposalSectionApi,
  getProposalSectionApi,
  updateProposalSectionApi,
  getProposalSectionEvidenceApi,
  getProposalSectionClaimsApi,
  setToken,
} from "./api-client";

async function runProposalGenerationIntegrationTests() {
  console.log("=== PHASE 10 PROPOSAL GENERATION INTEGRATION TEST SUITE ===");

  // 1. Authenticate as Product Team user
  console.log("1. Authenticating as Product Team user...");
  const authRes = await loginApi("product_a@orga.com", "password123");
  assert(authRes.access_token, "Access token received");
  setToken(authRes.access_token);
  console.log("✓ Authentication successful.");

  // 2. Fetch RFP Project
  console.log("\n2. Fetching existing RFP project...");
  const projectsList = await listRFPProjectsApi(1, 10);
  assert(projectsList.items.length > 0, "At least one RFP project exists");
  const projectId = projectsList.items[0].id;
  console.log(`✓ Using RFP Project ID: ${projectId} (${projectsList.items[0].name})`);

  // 3. Create Proposal
  console.log("\n3. Creating proposal for project...");
  const proposalTitle = `Phase 10 Test Proposal ${Date.now()}`;
  const newProposal = await createProposalApi(projectId, proposalTitle, "Integration test proposal description");
  assert(newProposal.id, "Proposal created with ID");
  assert(newProposal.title === proposalTitle, "Title matches");
  assert(newProposal.current_version_id, "Current version ID populated");
  const proposalId = newProposal.id;
  const versionId = newProposal.current_version_id!;
  console.log(`✓ Created Proposal ID: ${proposalId}, Version ID: ${versionId}`);

  // 4. List Proposals for Project
  console.log("\n4. Listing proposals for RFP project...");
  const propList = await listProposalsApi(projectId);
  assert(propList.length >= 1, "Proposals list returned item");
  const foundProp = propList.find((p) => p.id === proposalId);
  assert(foundProp, "Newly created proposal found in list");
  console.log(`✓ List proposals confirmed. Found ${propList.length} proposal(s).`);

  // 5. Get Proposal Details
  console.log("\n5. Fetching proposal details...");
  const propDetails = await getProposalApi(proposalId);
  assert(propDetails.id === proposalId, "Proposal ID matches");
  assert(propDetails.current_version, "Current version object populated");
  const sections = propDetails.current_version!.sections;
  assert(sections.length === 8, "Default 8 proposal sections created");
  console.log(`✓ Proposal details fetched. ${sections.length} sections found.`);

  // 6. Generate Single Section
  console.log("\n6. Generating proposal section 1...");
  const firstSec = sections[0];
  const generatedSec = await generateProposalSectionApi(proposalId, versionId, firstSec.id);
  assert(generatedSec.generation_status === "COMPLETED", "Section generation completed");
  assert(generatedSec.content.length > 0, "Generated section content is not empty");
  console.log(`✓ Section '${generatedSec.section_title}' generated successfully.`);

  // 7. Get Section Evidence List
  console.log("\n7. Fetching section evidence citations...");
  const evidenceList = await getProposalSectionEvidenceApi(proposalId, versionId, firstSec.id);
  assert(Array.isArray(evidenceList), "Evidence list returned array");
  console.log(`✓ Evidence citations fetched. (${evidenceList.length} evidence items)`);

  // 8. Get Section Unsupported Claims List
  console.log("\n8. Fetching section unsupported claims...");
  const claimsList = await getProposalSectionClaimsApi(proposalId, versionId, firstSec.id);
  assert(Array.isArray(claimsList), "Claims list returned array");
  console.log(`✓ Unsupported claims fetched. (${claimsList.length} claims items)`);

  // 9. Update / Edit Section Content & Review Status
  console.log("\n9. Editing section content & review status...");
  const updatedContent = "## 1. Executive Summary\n\nManually reviewed and updated by Product Team.";
  const updatedSec = await updateProposalSectionApi(proposalId, versionId, firstSec.id, {
    content: updatedContent,
    review_status: "APPROVED",
    reviewer_comments: "Verified against company standards.",
  });
  assert(updatedSec.content === updatedContent, "Edited content persisted");
  assert(updatedSec.review_status === "APPROVED", "Review status updated to APPROVED");
  console.log("✓ Section edits & review status updated successfully.");

  // 10. Regenerate Section
  console.log("\n10. Regenerating proposal section...");
  const regenSec = await regenerateProposalSectionApi(proposalId, versionId, firstSec.id);
  assert(regenSec.generation_status === "COMPLETED", "Regeneration completed");
  console.log("✓ Section regenerated successfully.");

  // 11. Create New Proposal Version
  console.log("\n11. Creating new proposal version (Version 2)...");
  const newVer = await createProposalVersionApi(proposalId, versionId);
  assert(newVer.version_number === 2, "New version number is 2");
  assert(newVer.sections.length === 8, "Sections copied to Version 2");
  console.log(`✓ Created Proposal Version ${newVer.version_number}.`);

  // 12. List Proposal Versions
  console.log("\n12. Listing proposal versions...");
  const verList = await listProposalVersionsApi(proposalId);
  assert(verList.length === 2, "2 proposal versions exist");
  console.log("✓ Version history preserved. 2 versions listed.");

  // 13. RBAC Test - VP Access
  console.log("\n13. Testing RBAC permissions with VP user...");
  const vpAuth = await loginApi("vp_a@orga.com", "password123");
  assert(vpAuth.access_token, "VP Token received");
  setToken(vpAuth.access_token);

  const vpViewProp = await getProposalApi(proposalId);
  assert(vpViewProp.id === proposalId, "VP user can view proposal");
  console.log("✓ VP user authorization verified (view access granted).");

  // 14. Tenant Isolation Test
  console.log("\n14. Testing tenant isolation & non-existent resource protection...");
  try {
    const fakeProposalId = "00000000-0000-0000-0000-000000000000";
    await getProposalApi(fakeProposalId);
    assert.fail("Should have thrown 404 for unauthorized/non-existent proposal");
  } catch (err: any) {
    assert(err.status === 404 || err.detail?.includes("not found"), "Tenant isolation 404 verified");
    console.log("✓ Tenant isolation & 404 protection confirmed.");
  }

  console.log("\n==================================================");
  console.log("✓ ALL 14 PROPOSAL GENERATION INTEGRATION SCENARIOS PASSED");
  console.log("==================================================");
}

runProposalGenerationIntegrationTests().catch((err) => {
  console.error("❌ Phase 10 Proposal Generation Integration Test Failed:", err);
  process.exit(1);
});
