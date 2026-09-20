import {
  loginApi,
  getCurrentUserApi,
  getToken,
  setToken,
  removeToken,
  ApiError,
  getApiBaseUrl,
} from "./api-client";

async function runAuthTests() {
  console.log("=== FRONTEND F1 AUTHENTICATION & SESSION HARDENING INTEGRATION TESTS ===");
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

  // Test 1: Protected route / user retrieval without token fails (HTTP 401)
  try {
    await getCurrentUserApi();
    assert(false, "Unauthenticated user retrieval should fail");
  } catch (err: any) {
    assert(err instanceof ApiError && err.status === 401, "1. Protected API access without token returns HTTP 401");
  }

  // Test 2: Login with invalid password fails (HTTP 401)
  try {
    await loginApi("product_a@orga.com", "wrongpassword");
    assert(false, "Invalid login should throw ApiError");
  } catch (err: any) {
    assert(
      err instanceof ApiError && err.status === 401 && err.detail.includes("Incorrect email or password"),
      "2. Invalid password returns HTTP 401 error"
    );
  }

  // Test 3: Login with unknown user fails (HTTP 401)
  try {
    await loginApi("unknown_user@orga.com", "password123");
    assert(false, "Unknown user login should throw ApiError");
  } catch (err: any) {
    assert(err instanceof ApiError && err.status === 401, "3. Unknown user login returns HTTP 401 error");
  }

  // Test 4: Successful login -> token retained in storage & user loaded
  let token = "";
  try {
    const tokenRes = await loginApi("product_a@orga.com", "password123");
    token = tokenRes.access_token;
    assert(
      Boolean(tokenRes.access_token) && tokenRes.token_type === "bearer" && getToken() === token,
      "4. Successful login retains access token in storage"
    );
  } catch (err: any) {
    assert(false, `4. Valid login failed: ${err.message}`);
  }

  // Test 5: Valid token -> user authenticated (/auth/me returns user & role)
  try {
    const user = await getCurrentUserApi();
    assert(
      user.email === "product_a@orga.com" && user.role === "PRODUCT_TEAM",
      "5. Valid token verifies authenticated state via GET /auth/me"
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

  // Test 7: Stale/Invalid token handling during initial session validation
  console.log("\nTesting Stale JWT Token Hardening...");
  // Inject invalid/stale token into storage
  setToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.staleToken");
  assert(getToken() === "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.staleToken", "Stale token set in storage");

  try {
    await getCurrentUserApi();
    assert(false, "Stale token request should fail with 401");
  } catch (err: any) {
    assert(
      err instanceof ApiError && err.status === 401 && err.detail === "Could not validate credentials",
      "7a. Stale token request returns HTTP 401 Could not validate credentials"
    );
    assert(
      getToken() === null,
      "7b. 401 during session validation automatically removes stale token from storage"
    );
  }

  // Test 8: Logout behavior remains correct
  await loginApi("product_a@orga.com", "password123");
  assert(getToken() !== null, "Token present before logout");
  removeToken();
  assert(getToken() === null, "8a. Logout removes stored JWT token from session");

  try {
    await getCurrentUserApi();
    assert(false, "API call after logout should fail");
  } catch (err: any) {
    assert(err instanceof ApiError && err.status === 401, "8b. Unauthenticated access blocked after logout");
  }

  console.log(`\nTEST RESULTS: ${passed}/${total} PASSED`);
  if (passed !== total) {
    process.exit(1);
  }
}

runAuthTests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
