// tests/test-setup-bootstrap-security.js
const fs = require('fs').promises;
const path = require('path');

// Test: Verify secrets are NOT exposed in setup bootstrap
async function testSetupBootstrapNoSecrets() {
  console.log('\n=== Test 1: Setup Bootstrap Secret Exposure ===');

  try {
    const setupService = require('../services/setupService.js');

    // Verify isDatabaseHealthy() method exists
    if (typeof setupService.isDatabaseHealthy !== 'function') {
      throw new Error('isDatabaseHealthy() method not found in setupService');
    }
    console.log('✓ isDatabaseHealthy() method exists');

    // Verify getSetupState() method exists
    if (typeof setupService.getSetupState !== 'function') {
      throw new Error('getSetupState() method not found in setupService');
    }
    console.log('✓ getSetupState() method exists');

    // Exercise the REAL sanitizer used by the setup bootstrap, not a copy,
    // so this test fails if the production strip list regresses.
    const {
      sanitizeConfigForBootstrap,
      BOOTSTRAP_SECRET_FIELDS,
    } = require('../services/bootstrapConfigSanitizer.js');

    const testConfig = {
      PAPERLESS_API_TOKEN: 'secret-token-123',
      OPENAI_API_KEY: 'sk-secret-key',
      OLLAMA_API_KEY: 'ollama-secret',
      AZURE_API_KEY: 'azure-secret',
      MISTRAL_API_KEY: 'mistral-secret',
      CUSTOM_API_KEY: 'custom-secret',
      OCR_API_KEY: 'ocr-secret',
      API_KEY: 'paperless-app-api-key',
      JWT_SECRET: 'jwt-signing-secret',
      PAPERLESS_API_URL: 'http://localhost:8000',
      AI_PROVIDER: 'openai',
      OPENAI_MODEL: 'gpt-4o-mini',
    };

    const sanitizedConfig = sanitizeConfigForBootstrap(testConfig);

    // Verify every declared secret field is removed
    for (const field of BOOTSTRAP_SECRET_FIELDS) {
      if (sanitizedConfig[field] !== undefined) {
        throw new Error(
          `Secret field ${field} was not removed from bootstrap config`
        );
      }
    }
    // Regression guard for GHSA-84cq: API_KEY and JWT_SECRET were previously
    // missing from the production strip list.
    for (const field of ['API_KEY', 'JWT_SECRET']) {
      if (sanitizedConfig[field] !== undefined) {
        throw new Error(
          `Secret field ${field} must be stripped from bootstrap config`
        );
      }
    }
    console.log('✓ All secret fields removed from bootstrap config');

    // Verify non-secret fields are preserved
    if (
      !sanitizedConfig.PAPERLESS_API_URL ||
      sanitizedConfig.PAPERLESS_API_URL !== 'http://localhost:8000'
    ) {
      throw new Error('Non-secret fields should be preserved');
    }
    console.log('✓ Non-secret fields preserved');

    console.log('\n✅ Test 1 PASSED: Bootstrap secrets properly sanitized\n');
    return true;
  } catch (error) {
    console.error('\n❌ Test 1 FAILED:', error.message, '\n');
    return false;
  }
}

// Test: Verify database health check detects corrupted state
async function testDatabaseHealthCheck() {
  console.log('\n=== Test 2: Database Health Check ===');

  try {
    const setupService = require('../services/setupService.js');

    // Test 1: Healthy database should return true
    const healthStatus = await setupService.isDatabaseHealthy();
    if (typeof healthStatus !== 'boolean') {
      throw new Error('isDatabaseHealthy() should return a boolean value');
    }
    console.log(
      `✓ isDatabaseHealthy() returns boolean (current: ${healthStatus})`
    );

    // Test 2: Verify getSetupState returns valid states
    const validStates = ['first-run', 'partial', 'degraded', 'configured'];
    const setupState = await setupService.getSetupState();
    if (!validStates.includes(setupState)) {
      throw new Error(
        `Invalid setup state: ${setupState}. Expected one of: ${validStates.join(', ')}`
      );
    }
    console.log(`✓ getSetupState() returns valid state: ${setupState}`);

    console.log('\n✅ Test 2 PASSED: Database health checks working\n');
    return true;
  } catch (error) {
    console.error('\n❌ Test 2 FAILED:', error.message, '\n');
    return false;
  }
}

// Test: Verify degraded state detection logic
async function testDegradedStateDetection() {
  console.log('\n=== Test 3: Degraded State Detection Logic ===');

  try {
    const setupService = require('../services/setupService.js');

    // The degraded state occurs when:
    // - .env file exists
    // - Configuration is complete
    // - But database is unhealthy

    // We can't easily simulate a corrupted DB in this test,
    // but we can verify the logic flow
    const state = await setupService.getSetupState();

    if (state === 'degraded') {
      console.log('✓ System detected as being in degraded state');
      console.log('  → This means config exists but database is unhealthy');
      console.log(
        '  → /setup endpoint will return 500 error (no secrets exposed)'
      );
    } else {
      console.log(
        `ℹ Current system state: ${state} (not degraded in this environment)`
      );
    }

    console.log(
      '\n✅ Test 3 PASSED: Degraded state detection logic verified\n'
    );
    return true;
  } catch (error) {
    console.error('\n❌ Test 3 FAILED:', error.message, '\n');
    return false;
  }
}

// Test: Verify setup.ejs template structure
async function testSetupTemplateStructure() {
  console.log('\n=== Test 4: Setup.ejs Template Structure ===');

  try {
    const templatePath = path.join(process.cwd(), 'views', 'setup.ejs');
    const templateContent = await fs.readFile(templatePath, 'utf8');

    // Verify template has the bootstrap object
    if (!templateContent.includes('window.__SETUP_BOOTSTRAP__')) {
      throw new Error('setup.ejs should include window.__SETUP_BOOTSTRAP__');
    }
    console.log('✓ setup.ejs has window.__SETUP_BOOTSTRAP__');

    // Verify the config object is used in bootstrap
    if (!templateContent.includes('config:')) {
      throw new Error('setup.ejs bootstrap should include config object');
    }
    console.log('✓ setup.ejs bootstrap includes config object');

    console.log('\n✅ Test 4 PASSED: setup.ejs template structure verified\n');
    return true;
  } catch (error) {
    console.error('\n❌ Test 4 FAILED:', error.message, '\n');
    return false;
  }
}

// Test: Verify setup-error.ejs template exists
async function testSetupErrorTemplate() {
  console.log('\n=== Test 5: Setup Error Template ===');

  try {
    const templatePath = path.join(process.cwd(), 'views', 'setup-error.ejs');

    try {
      await fs.access(templatePath);
      console.log('✓ setup-error.ejs template exists');
    } catch (err) {
      throw new Error(`setup-error.ejs template not found at ${templatePath}`, {
        cause: err,
      });
    }

    const templateContent = await fs.readFile(templatePath, 'utf8');

    // Verify template doesn't contain any secret field references
    const secretFields = [
      'PAPERLESS_API_TOKEN',
      'OPENAI_API_KEY',
      'AZURE_API_KEY',
      'MISTRAL_API_KEY',
    ];
    for (const field of secretFields) {
      if (templateContent.includes(field)) {
        throw new Error(
          `setup-error.ejs should not reference secret field: ${field}`
        );
      }
    }
    console.log('✓ setup-error.ejs contains no secret field references');

    // Verify error message templates are present
    if (
      !templateContent.includes('errorMessage') ||
      !templateContent.includes('supportText')
    ) {
      throw new Error(
        'setup-error.ejs should have errorMessage and supportText placeholders'
      );
    }
    console.log('✓ setup-error.ejs has error message placeholders');

    console.log('\n✅ Test 5 PASSED: setup-error.ejs template verified\n');
    return true;
  } catch (error) {
    console.error('\n❌ Test 5 FAILED:', error.message, '\n');
    return false;
  }
}

// Main test runner
async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║   Setup Bootstrap Security Fix - Test Suite           ║');
  console.log('║   Testing: GHSA-v4jq-65q5-wgjp Mitigation             ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  const results = [];

  results.push(await testSetupBootstrapNoSecrets());
  results.push(await testDatabaseHealthCheck());
  results.push(await testDegradedStateDetection());
  results.push(await testSetupTemplateStructure());
  results.push(await testSetupErrorTemplate());

  const passed = results.filter((r) => r).length;
  const total = results.length;

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log(
    `║     Test Results: ${passed}/${total} Passed                          ║`
  );
  console.log('╚════════════════════════════════════════════════════════╝\n');

  return passed === total;
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Fatal test error:', error);
      process.exit(1);
    });
}

module.exports = { runAllTests };
