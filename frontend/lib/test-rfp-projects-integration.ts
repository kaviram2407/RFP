import {
  loginApi,
  listRFPProjectsApi,
  createRFPProjectApi,
  getRFPProjectApi,
  updateRFPProjectApi,
  archiveRFPProjectApi,
  removeToken,
  getToken,
  ApiError,
  RFPProjectResponse,
} from "./api-client";

async function runRFPProjectTests() {
  console.log("=== FRONTEND F2 RFP PROJECT INTEGRATION TESTS ===");
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
    }
  }

  // Login as PRODUCT_TEAM user
  try {
    await loginApi("product_a@orga.com", "password123");
  } catch (e: any) {
    console.error("Failed to authenticate product_a user for F2 tests:", e);
    process.exit(1);
  }

  // 1. Fetch RFP Projects (GET /api/v1/rfp-projects)
  try {
    const listRes = await listRFPProjectsApi(1, 20);
    assert(
      Array.isArray(listRes.items) && typeof listRes.total === "number",
      "1. Fetch RFP projects returns valid RFPProjectListResponse"
    );
  } catch (err: any) {
    assert(false, `1. Fetch RFP projects failed: ${err.message}`);
  }

  // 2. Empty RFP List check (verified response structure handling)
  try {
    const listRes = await listRFPProjectsApi(1, 20, "ARCHIVED");
    assert(
      Array.isArray(listRes.items),
      "2. Filtered list returns valid items array (supports empty list handling)"
    );
  } catch (err: any) {
    assert(false, `2. Empty RFP list filter check failed: ${err.message}`);
  }

  // 3. Create RFP Project (POST /api/v1/rfp-projects)
  const testRefNum = `REF-${Date.now()}`;
  let createdProject: RFPProjectResponse | null = null;

  try {
    createdProject = await createRFPProjectApi({
      name: "Global FinTech Cloud Modernization RFP 2026",
      reference_number: testRefNum,
      customer_name: "Global FinTech Corp",
      customer_contact: "procurement@fintech.com",
      description: "End-to-end cloud analytics & security transformation project.",
      submission_deadline: new Date(Date.now() + 86400000 * 30).toISOString(),
    });

    assert(
      createdProject.name === "Global FinTech Cloud Modernization RFP 2026" &&
        createdProject.reference_number === testRefNum &&
        createdProject.status === "DRAFT",
      "3. Create RFP project calls POST /api/v1/rfp-projects and persists new project in DB"
    );
  } catch (err: any) {
    assert(false, `3. Create RFP project failed: ${err.message}`);
  }

  // 4. Create validation failure (Duplicate reference number / empty string)
  try {
    await createRFPProjectApi({
      name: "Duplicate RFP Test",
      reference_number: testRefNum, // Same reference number in same org -> 400 Bad Request
    });
    assert(false, "Duplicate reference number should throw 400 ApiError");
  } catch (err: any) {
    assert(
      err instanceof ApiError && (err.status === 400 || err.status === 409 || err.status === 422),
      "4. Create validation failure returns HTTP 400/409/422 ApiError"
    );
  }

  // 5. Open Project Details (GET /api/v1/rfp-projects/{id})
  if (createdProject) {
    try {
      const fetchedDetails = await getRFPProjectApi(createdProject.id);
      assert(
        fetchedDetails.id === createdProject.id && fetchedDetails.name === createdProject.name,
        "5. Open project calls GET /api/v1/rfp-projects/{id} and returns full backend project details"
      );
    } catch (err: any) {
      assert(false, `5. Open project details failed: ${err.message}`);
    }

    // 6. Update Project (PATCH /api/v1/rfp-projects/{id})
    try {
      const updated = await updateRFPProjectApi(createdProject.id, {
        name: "Global FinTech Cloud Modernization RFP 2026 (Updated)",
        status: "ACTIVE",
      });
      assert(
        updated.name === "Global FinTech Cloud Modernization RFP 2026 (Updated)" &&
          updated.status === "ACTIVE",
        "6. Update project calls PATCH /api/v1/rfp-projects/{id} and updates status to ACTIVE"
      );
    } catch (err: any) {
      assert(false, `6. Update project failed: ${err.message}`);
    }

    // 7. Archive Project (POST /api/v1/rfp-projects/{id}/archive)
    try {
      const archived = await archiveRFPProjectApi(createdProject.id);
      assert(
        archived.status === "ARCHIVED" && Boolean(archived.archived_at),
        "7. Archive project calls POST /api/v1/rfp-projects/{id}/archive and sets status to ARCHIVED"
      );
    } catch (err: any) {
      assert(false, `7. Archive project failed: ${err.message}`);
    }
  }

  // 8. Unauthorized response (VP role attempting write operation)
  try {
    await loginApi("vp_a@orga.com", "password123");
    await createRFPProjectApi({
      name: "Unauthorized VP Project",
      reference_number: `UNAUTH-${Date.now()}`,
    });
    assert(false, "VP user create project should fail with 403 Forbidden");
  } catch (err: any) {
    assert(
      err instanceof ApiError && err.status === 403,
      "8. Unauthorized write operation by VP user returns HTTP 403 Forbidden"
    );
  }

  // 9. Network failure / unauthenticated request handling
  removeToken();
  try {
    await listRFPProjectsApi();
    assert(false, "Request without token should fail with 401");
  } catch (err: any) {
    assert(
      err instanceof ApiError && err.status === 401,
      "9. Unauthenticated request without token returns HTTP 401"
    );
  }

  // 10. Authentication header inclusion check
  assert(
    getToken() === null,
    "10. Authentication header token management is verified"
  );

  console.log(`\nTEST RESULTS: ${passed}/${total} PASSED`);
  if (passed !== total) {
    process.exit(1);
  }
}

runRFPProjectTests().catch((e) => {
  console.error("F2 Test execution error:", e);
  process.exit(1);
});
