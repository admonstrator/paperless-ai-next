/**
 * Global Rate Limiting Integration Test
 *
 * Validates:
 * - Global limiter headers on /api, /manual
 * - Exclusion for /health
 * - Optional enforcement test (429) when GLOBAL_RATE_LIMIT_MAX is low enough
 *
 * Usage:
 * 1) Start server
 * 2) Optional: run server with GLOBAL_RATE_LIMIT_MAX=10 for fast enforcement checks
 * 3) Execute: node tests/test-rate-limiting.js
 */

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const JWT_TOKEN = process.env.JWT_TOKEN || null;
const API_KEY = process.env.API_KEY || process.env.PAPERLESS_AI_API_KEY || null;
const MAX_ENFORCEMENT_REQUESTS = parseInt(
  process.env.MAX_ENFORCEMENT_REQUESTS || '40',
  10
);

const authHeaders = () => {
  if (JWT_TOKEN) {
    return {
      Authorization: `Bearer ${JWT_TOKEN}`,
    };
  }

  if (API_KEY) {
    return {
      'x-api-key': API_KEY,
    };
  }

  return {};
};

async function checkLimiterHeaders(pathname) {
  const response = await axios.get(`${BASE_URL}${pathname}`, {
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
    },
    validateStatus: () => true,
    maxRedirects: 0,
  });

  const hasLimitHeaders = response.headers['ratelimit-limit'] !== undefined;
  return {
    status: response.status,
    hasLimitHeaders,
    headers: response.headers,
  };
}

async function testScopeCoverage() {
  console.log('\n🧪 Test 1: Global limiter scope coverage');
  console.log('='.repeat(60));

  // Mirrors app.use(['/api', '/manual'], apiGlobalLimiter) in server.js. /chat
  // used to be mounted here too and stayed in this list after the route was
  // removed, so the test failed against every running server.
  const inScopeEndpoints = ['/api/processing-status', '/manual'];

  for (const endpoint of inScopeEndpoints) {
    const result = await checkLimiterHeaders(endpoint);
    console.log(
      `Endpoint ${endpoint}: HTTP ${result.status}, headers ${result.hasLimitHeaders ? '✅' : '❌'}`
    );

    if (!result.hasLimitHeaders) {
      return false;
    }
  }

  return true;
}

async function testHealthExcluded() {
  console.log('\n🧪 Test 2: /health excluded from limiter');
  console.log('='.repeat(60));

  const result = await checkLimiterHeaders('/health');
  const hasLimitHeaders = result.hasLimitHeaders;

  console.log(
    `/health: HTTP ${result.status}, limiter headers ${hasLimitHeaders ? 'present ❌' : 'absent ✅'}`
  );

  return !hasLimitHeaders;
}

async function testEnforcement() {
  console.log('\n🧪 Test 3: Optional 429 enforcement check');
  console.log('='.repeat(60));

  const initial = await checkLimiterHeaders('/api/processing-status');
  if (!initial.hasLimitHeaders) {
    console.log('Limiter headers are missing, skipping enforcement.');
    return false;
  }

  const remaining = parseInt(initial.headers['ratelimit-remaining'] || '0', 10);
  const plannedRequests = Math.min(remaining + 2, MAX_ENFORCEMENT_REQUESTS);

  if (plannedRequests < remaining + 1) {
    console.log(
      `Skipping strict 429 check (remaining=${remaining}, cap=${MAX_ENFORCEMENT_REQUESTS}).`
    );
    console.log(
      'Tip: run server with lower GLOBAL_RATE_LIMIT_MAX (e.g. 10) for this test.'
    );
    return true;
  }

  let saw429 = false;
  for (let i = 0; i < plannedRequests; i++) {
    const response = await axios.get(`${BASE_URL}/api/processing-status`, {
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      validateStatus: () => true,
      maxRedirects: 0,
    });

    if (response.status === 429) {
      saw429 = true;
      console.log(`Received HTTP 429 at request ${i + 1} ✅`);
      break;
    }
  }

  if (!saw429) {
    console.log('No HTTP 429 observed within request cap.');
    return false;
  }

  return true;
}

async function runTests() {
  console.log(
    '\n╔════════════════════════════════════════════════════════════╗'
  );
  console.log('║          Global Rate Limiting Integration Tests           ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  console.log('\n📋 Configuration:');
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  JWT Token: ${JWT_TOKEN ? '✅ Set' : '⚠️  Not set'}`);
  console.log(`  API Key: ${API_KEY ? '✅ Set' : '⚠️  Not set'}`);
  console.log(`  Max Enforcement Requests: ${MAX_ENFORCEMENT_REQUESTS}`);

  const results = {
    scopeCoverage: false,
    healthExcluded: false,
    enforcement: false,
  };

  try {
    results.scopeCoverage = await testScopeCoverage();
    results.healthExcluded = await testHealthExcluded();
    results.enforcement = await testEnforcement();
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }

  console.log(
    '\n╔════════════════════════════════════════════════════════════╗'
  );
  console.log('║                     Final Results                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  console.log(
    `\n${results.scopeCoverage ? '✅' : '❌'} Scope Coverage (/api, /manual)`
  );
  console.log(`${results.healthExcluded ? '✅' : '❌'} Health Exclusion`);
  console.log(`${results.enforcement ? '✅' : '❌'} Enforcement (429)`);

  const allPassed = Object.values(results).every((r) => r === true);

  if (allPassed) {
    console.log('\n🎉 All tests PASSED!');
    process.exit(0);
  }

  console.log('\n❌ Some tests FAILED');
  process.exit(1);
}

if (require.main === module) {
  runTests().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
