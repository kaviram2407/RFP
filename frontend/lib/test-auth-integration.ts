import {
  loginApi,
  getCurrentUserApi,
  getToken,
  removeToken,
  ApiError,
  getApiBaseUrl,
} from "./api-client";

async function runAuthTests() {
  console.log("=== FRONTEND F1 AUTHENTICATION INTEGRATION TESTS ===");
  console.log(`Target Base URL: ${getApiBaseUrl()}`);
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

  // Clear initial token
  removeToken();

  // Test 1: Protected route / user retrieval without token fails
  try {
    await getCurrentUserApi();
    assert(false, "Unauthenticated user retrieval should fail");
  } catch (err: any) {
    assert(err instanceof ApiError && err.status === 401, "1. Protected API access without token returns HTTP 401");
  }

  // Test 2: Login with invalid password fails
  try {
    await loginApi("product_a@orga.com", "wrongpassword");
    assert(false, "Invalid login should throw ApiError");
  } catch (err: any) {
    assert(
      err instanceof ApiError && err.status === 401 && err.detail.includes("Incorrect email or password"),
      "2. Invalid password returns HTTP 401 error"
    );
  }

  // Test 3: Login with unknown user fails
  try {
    await loginApi("unknown_user@orga.com", "password123");
    assert(false, "Unknown user login should throw ApiError");
  } catch (err: any) {
    assert(err instanceof ApiError && err.status === 401, "3. Unknown user login returns HTTP 401 error");
  }

  // Test 4: Login with valid credentials succeeds
  let token = "";
  try {
    const tokenRes = await loginApi("product_a@orga.com", "password123");
    token = tokenRes.access_token;
    assert(
      bool(tokenRes.access_token) && tokenRes.token_type === "bearer",
      "4. Valid login calls POST /auth/login and receives JWT Bearer token"
    );
  } catch (err: any) {
    assert(false, `4. Valid login failed: ${err.message}`);
  }

  // Test 5: Authenticated user retrieval (/auth/me) succeeds
  try {
    const user = await getCurrentUserApi();
    assert(
      user.email === "product_a@orga.com" && user.role === "PRODUCT_TEAM",
      "5. GET /auth/me returns actual authenticated backend user & role (PRODUCT_TEAM)"
    );
  } catch (err: any) {
    assert(false, `5. User retrieval failed: ${err.message}`);
  }

  // Test 6: Login as VP user succeeds and retrieves VP role
  try {
    await loginApi("vp_a@orga.com", "password123");
    const vpUser = await getCurrentUserApi();
    assert(
      vpUser.email === "vp_a@orga.com" && vpUser.role === "VP",
      "6. VP login retrieves actual backend role (VP)"
    );
  } catch (err: any) {
    assert(false, `6. VP user login failed: ${err.message}`);
  }

  // Test 7: Logout clears token and blocks subsequent requests
  removeToken();
  assert(getToken() === null, "7. Logout removes stored JWT token from session");

  try {
    await getCurrentUserApi();
    assert(false, "API call after logout should fail");
  } catch (err: any) {
    assert(err instanceof ApiError && err.status === 401, "8. Unauthenticated access blocked after logout");
  }

  console.log(`\nTEST RESULTS: ${passed}/${total} PASSED`);
  if (passed !== total) {
    process.exit(1);
  }
}

function bool(val: any): boolean {
  return Boolean(val);
}

runAuthTests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
