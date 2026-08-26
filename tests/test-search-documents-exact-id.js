const assert = require('assert');

/**
 * Unit tests for paperlessService.searchDocuments mode=id exact lookup.
 * No live Paperless instance required — the HTTP client is mocked.
 */
async function run() {
  const paperlessService = require('../services/paperlessService');
  const originalClient = paperlessService.client;
  const originalConsoleError = console.error;

  try {
    const calls = [];
    const searchParams = [];
    const errorLogs = [];
    console.error = (...args) => {
      errorLogs.push(args.map(String).join(' '));
    };

    // Search results returned for the full-text endpoint; individual assertions
    // reassign this to shape what /documents/ answers with.
    let searchResults = [];
    // Flipped on to simulate an unusable Paperless-ngx search index, which
    // fails the full-text query and its title fallback alike.
    let searchThrows = false;

    paperlessService.client = {
      get: async (url, options) => {
        calls.push(url);
        if (url === '/documents/') {
          searchParams.push(options?.params || {});
          if (searchThrows) {
            throw new Error('search index is broken');
          }
          return { data: { results: searchResults } };
        }
        if (url === '/documents/1431/') {
          return {
            data: {
              id: 1431,
              title: 'Exact ID Document',
              tags: [1],
              correspondent: 9,
              created: '2024-01-15T00:00:00Z',
            },
          };
        }
        if (url === '/documents/40404/') {
          const error = new Error('Not Found');
          error.response = { status: 404 };
          throw error;
        }
        if (url === '/documents/50001/') {
          const error = new Error('Server Error');
          error.response = { status: 500 };
          throw error;
        }
        throw new Error(`Unexpected URL in mock: ${url}`);
      },
    };

    // Exact hit
    calls.length = 0;
    const found = await paperlessService.searchDocuments('1431', 100, 'id');
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0].id, 1431);
    assert.strictEqual(found[0].title, 'Exact ID Document');
    assert.deepStrictEqual(calls, ['/documents/1431/']);

    // Missing document (404 is quiet)
    calls.length = 0;
    errorLogs.length = 0;
    const missing = await paperlessService.searchDocuments('40404', 100, 'id');
    assert.deepStrictEqual(missing, []);
    assert.deepStrictEqual(calls, ['/documents/40404/']);
    assert.strictEqual(errorLogs.length, 0, '404 must not log an error');

    // Non-404 HTTP failure: log and return [] without throwing
    calls.length = 0;
    errorLogs.length = 0;
    const serverError = await paperlessService.searchDocuments(
      '50001',
      100,
      'id'
    );
    assert.deepStrictEqual(serverError, []);
    assert.deepStrictEqual(calls, ['/documents/50001/']);
    assert.ok(
      errorLogs.some((line) => line.includes('50001')),
      'non-404 failures should be logged'
    );

    // Reject non-integer / non-positive / malformed input without calling Paperless
    calls.length = 0;
    const invalidInputs = ['14a', '0', '', '01431', '-1', '12.3', '+1431'];
    for (const input of invalidInputs) {
      const result = await paperlessService.searchDocuments(input, 100, 'id');
      assert.deepStrictEqual(
        result,
        [],
        `expected empty results for invalid id input: ${JSON.stringify(input)}`
      );
    }
    assert.deepStrictEqual(
      calls,
      [],
      'invalid id inputs must not hit Paperless'
    );

    // Leading/trailing whitespace is trimmed before validation (still a valid ID)
    calls.length = 0;
    const trimmed = await paperlessService.searchDocuments(' 1431 ', 100, 'id');
    assert.strictEqual(trimmed.length, 1);
    assert.strictEqual(trimmed[0].id, 1431);
    assert.deepStrictEqual(calls, ['/documents/1431/']);

    // ── Default scope (mode='all') is ID-aware — regression for issue #304 ──
    // Paperless-ngx full-text search reads titles and content but never the
    // document ID, so /manual found nothing when a user typed one.

    // Numeric term: the exact hit leads, the search results follow.
    calls.length = 0;
    searchParams.length = 0;
    searchResults = [
      { id: 900, title: 'Mentions 1431 in its text' },
      { id: 901, title: 'Another hit' },
    ];
    const mixed = await paperlessService.searchDocuments('1431', 100, 'all');
    assert.strictEqual(mixed.length, 3);
    assert.strictEqual(mixed[0].id, 1431, 'the exact ID hit must lead');
    assert.deepStrictEqual(
      mixed.slice(1).map((doc) => doc.id),
      [900, 901],
      'full-text results must follow the exact hit in their original order'
    );
    assert.ok(
      calls.includes('/documents/1431/') && calls.includes('/documents/'),
      'a numeric term must run both the ID lookup and the full-text search'
    );
    assert.strictEqual(
      searchParams[0].query,
      '1431',
      'the full-text search must still receive the term'
    );

    // The exact hit must not also appear as a search result.
    calls.length = 0;
    searchResults = [
      { id: 1431, title: 'Exact ID Document' },
      { id: 902, title: 'Other' },
    ];
    const deduped = await paperlessService.searchDocuments('1431', 100, 'all');
    assert.deepStrictEqual(
      deduped.map((doc) => doc.id),
      [1431, 902],
      'a document matched by both paths must appear exactly once, first'
    );

    // A numeric term with no such document behaves exactly as before.
    calls.length = 0;
    searchResults = [{ id: 903, title: 'Invoice 40404' }];
    const noSuchId = await paperlessService.searchDocuments(
      '40404',
      100,
      'all'
    );
    assert.deepStrictEqual(
      noSuchId.map((doc) => doc.id),
      [903],
      'a missing ID must leave the full-text results untouched'
    );

    // Non-numeric terms must not cost an extra request.
    calls.length = 0;
    searchResults = [{ id: 904, title: 'Rechnung' }];
    const textOnly = await paperlessService.searchDocuments(
      'Rechnung',
      100,
      'all'
    );
    assert.deepStrictEqual(
      textOnly.map((doc) => doc.id),
      [904]
    );
    assert.deepStrictEqual(
      calls,
      ['/documents/'],
      'a non-numeric term must not trigger an ID lookup'
    );

    // The merged list still honours the requested limit.
    calls.length = 0;
    searchResults = [
      { id: 905, title: 'a' },
      { id: 906, title: 'b' },
    ];
    const limited = await paperlessService.searchDocuments('1431', 2, 'all');
    assert.deepStrictEqual(
      limited.map((doc) => doc.id),
      [1431, 905],
      'the exact hit must count towards the limit rather than exceed it'
    );

    // Other explicit scopes stay untouched: no ID lookup, no reordering.
    calls.length = 0;
    searchResults = [{ id: 907, title: '1431' }];
    const titleScope = await paperlessService.searchDocuments(
      '1431',
      100,
      'title'
    );
    assert.deepStrictEqual(
      titleScope.map((doc) => doc.id),
      [907]
    );
    assert.deepStrictEqual(
      calls,
      ['/documents/'],
      'the title scope must not run an ID lookup'
    );

    // A broken Paperless-ngx search index takes the full-text query and its
    // title fallback down together. The ID lookup does not use the index, so
    // its hit must survive rather than be discarded on the way out.
    calls.length = 0;
    errorLogs.length = 0;
    searchThrows = true;
    const indexDown = await paperlessService.searchDocuments(
      '1431',
      100,
      'all'
    );
    assert.deepStrictEqual(
      indexDown.map((doc) => doc.id),
      [1431],
      'an exact ID hit must survive a failing full-text search'
    );
    assert.ok(
      errorLogs.some((line) => line.includes('search index is broken')),
      'the search failure must still be logged'
    );

    // With nothing to fall back on, a failing search is still an empty result.
    calls.length = 0;
    const indexDownNoId = await paperlessService.searchDocuments(
      'Rechnung',
      100,
      'all'
    );
    assert.deepStrictEqual(
      indexDownNoId,
      [],
      'a failing search with no ID candidate still returns nothing'
    );
    searchThrows = false;

    console.log('PASS test-search-documents-exact-id');
  } finally {
    console.error = originalConsoleError;
    paperlessService.client = originalClient;
  }
}

run().catch((error) => {
  console.error('FAIL test-search-documents-exact-id');
  console.error(error);
  process.exit(1);
});
