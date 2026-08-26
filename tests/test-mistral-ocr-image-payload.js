/**
 * Mistral's /v1/ocr takes two document shapes, and they are not
 * interchangeable: `{ type: 'document_url', document_url }` for PDFs and
 * office formats, `{ type: 'image_url', image_url }` for PNG and JPEG.
 *
 * Both callers sent everything as `document_url`.
 *
 * For the OCR connection test that was fatal rather than occasional: the probe
 * builds a PNG (`buildOcrValidationImageDataUrl` returns a
 * `data:image/png;base64,…` URL) and declared it a document, so the request was
 * rejected on every correctly configured Mistral instance — a valid API key and
 * mistral-ocr-latest still produced "OCR connection test failed."
 *
 * The mis-shaped payload predates the v2026.08.04 release: 554b10c
 * (2026-06-05) for the probe, 7ddfef4 (2026-04-19) for the OCR service.
 *
 * The error the user sees was misleading on top of that.
 * buildVersionedApiUrlCandidates yields the bare host after the versioned one,
 * and `GET https://api.mistral.ai/models` — without /v1 — answers 404 whatever
 * the key is. That 404 is logged last, so it read as the cause while the real
 * failure sat in the line above it. The log now names the candidate it tried.
 *
 * Both request builders are read out of their source file rather than copied,
 * so this test cannot keep passing after the real ones change.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── The connection-test probe sends its PNG as an image ──────────────────────

async function testValidationProbe() {
  const setupService = require('../services/setupService');

  const captured = [];
  const originalPost = require('axios').post;
  require('axios').post = async (url, body) => {
    captured.push({ url, body });
    return {
      status: 200,
      data: { pages: [{ markdown: 'OCR-TEST-182730173401' }] },
    };
  };

  try {
    const token = setupService.getOcrValidationToken();
    const imageDataUrl = setupService.buildOcrValidationImageDataUrl(token);
    assert.ok(
      imageDataUrl.startsWith('data:image/png;base64,'),
      'the probe is a PNG — if that ever changes, the document type below has to change with it'
    );

    const output = await setupService.runMistralOcrValidationRequest({
      apiUrl: 'https://api.mistral.ai/v1',
      apiKey: 'test-key',
      model: 'mistral-ocr-latest',
      imageDataUrl,
    });

    assert.strictEqual(captured.length, 1, 'exactly one OCR request');
    const { url, body } = captured[0];
    assert.strictEqual(url, 'https://api.mistral.ai/v1/ocr');
    assert.deepStrictEqual(
      body.document,
      { type: 'image_url', image_url: imageDataUrl },
      'a PNG must be declared as image_url — document_url is for PDFs and office formats, and Mistral rejects the mismatch'
    );
    assert.strictEqual(body.model, 'mistral-ocr-latest');
    assert.ok(
      setupService.isExpectedOcrTokenPresent(output, token),
      'the probe must still read its token back out of the response'
    );
  } finally {
    require('axios').post = originalPost;
  }
}

// ── The OCR service picks the shape from the mime type ───────────────────────

function testOcrServiceDocumentShape() {
  const mistralOcrService = require('../services/mistralOcrService');

  const cases = [
    ['application/pdf', 'document_url'],
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'document_url',
    ],
    ['image/png', 'image_url'],
    ['image/jpeg', 'image_url'],
    ['IMAGE/PNG', 'image_url'],
    // A missing mime type keeps the PDF default rather than guessing.
    ['', 'document_url'],
    [undefined, 'document_url'],
  ];

  cases.forEach(([mimeType, expectedType]) => {
    const dataUrl = `data:${mimeType || 'application/pdf'};base64,AAAA`;
    const document = mistralOcrService.buildMistralOcrDocument(
      dataUrl,
      mimeType
    );
    assert.strictEqual(
      document.type,
      expectedType,
      `${JSON.stringify(mimeType)} should be sent as ${expectedType}`
    );
    assert.strictEqual(
      document[expectedType],
      dataUrl,
      `${expectedType} must carry the data URL under its own field name`
    );
    assert.strictEqual(
      Object.keys(document).length,
      2,
      'the document carries exactly the type and its one companion field'
    );
  });
}

// ── The validation log names the candidate it tried ──────────────────────────

function testValidationErrorNamesTheCandidate() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'setupService.js'),
    'utf8'
  );

  assert.ok(
    /Mistral OCR validation error \(\$\{apiUrl\}\)/.test(source),
    'the Mistral validation error must name the URL it tried — the bare-host candidate 404s by construction and otherwise masks the real failure'
  );
}

async function run() {
  await testValidationProbe();
  testOcrServiceDocumentShape();
  testValidationErrorNamesTheCandidate();
  console.log('PASS test-mistral-ocr-image-payload');
}

run().catch((error) => {
  console.error('FAIL test-mistral-ocr-image-payload');
  console.error(error);
  process.exit(1);
});
