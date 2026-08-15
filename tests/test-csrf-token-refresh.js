/**
 * A tab whose CSRF token went stale must repair itself.
 *
 * The server mints a token per page render, and the cookie it pairs with
 * belongs to the browser rather than the tab. A second tab, a navigation, or
 * the restart after saving settings therefore leaves every older tab holding a
 * token the server no longer accepts — and the tab found out by failing its
 * next action with "Invalid CSRF token", which reads like a security problem
 * rather than an expired ticket.
 *
 * public/js/csrf.js is executed here rather than grepped: what has to hold is
 * that the second attempt actually carries the new token, and that a 403 which
 * has nothing to do with CSRF is left alone.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failed = 0;
const check = async (label, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${label}: ${error.message}`);
  }
};

const source = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'csrf.js'),
  'utf8'
);

/**
 * @param {object} options
 * @param {string} options.token what the meta tag starts out holding
 * @param {function} options.respond (url, config, attempt) => fake Response
 */
function loadCsrf({ token = 'stale-token', respond }) {
  const calls = [];
  let metaContent = token;

  const sandbox = {
    Headers,
    ReadableStream,
    console,
    document: {
      querySelector(selector) {
        if (selector !== 'meta[name="csrf-token"]') return null;
        return {
          getAttribute: () => metaContent,
          setAttribute: (_name, value) => {
            metaContent = value;
          },
        };
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.fetch = async (url, config = {}) => {
    calls.push({ url, config });
    return respond(url, config, calls.length);
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  return {
    fetch: (...args) => sandbox.window.fetch(...args),
    calls,
    meta: () => metaContent,
  };
}

const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  clone: () => ({ text: async () => JSON.stringify(body) }),
  text: async () => JSON.stringify(body),
});

const headerOf = (config, name) =>
  config.headers instanceof Headers
    ? config.headers.get(name)
    : config.headers?.[name];

(async () => {
  console.log('\n=== CSRF token refresh ===');

  await check(
    'a stale token is replaced and the request repeated',
    async () => {
      const app = loadCsrf({
        respond: (url, config, attempt) => {
          if (url === '/api/csrf-token')
            return json(200, { csrfToken: 'fresh' });
          if (attempt === 1) return json(403, { error: 'Invalid CSRF token' });
          return json(200, { success: true });
        },
      });

      const response = await app.fetch('/api/history/1/rescan', {
        method: 'POST',
      });

      assert.strictEqual(
        response.status,
        200,
        'the retry should have succeeded'
      );
      assert.strictEqual(app.calls.length, 3, 'expected try, refresh, retry');
      assert.strictEqual(
        headerOf(app.calls[0].config, 'X-CSRF-Token'),
        'stale-token'
      );
      assert.strictEqual(app.calls[1].url, '/api/csrf-token');
      assert.strictEqual(
        headerOf(app.calls[2].config, 'X-CSRF-Token'),
        'fresh'
      );
      // Written back so everything else on the page uses it from here on.
      assert.strictEqual(app.meta(), 'fresh');
    }
  );

  await check('a 403 that is not about CSRF is left alone', async () => {
    const app = loadCsrf({
      respond: () => json(403, { error: 'Not authorised for this document' }),
    });

    const response = await app.fetch('/api/ignored/add', { method: 'POST' });

    assert.strictEqual(response.status, 403);
    assert.strictEqual(app.calls.length, 1, 'must not retry or refresh');
  });

  await check('a successful request is passed straight through', async () => {
    const app = loadCsrf({ respond: () => json(200, { success: true }) });
    await app.fetch('/api/history/1/rescan', { method: 'POST' });
    assert.strictEqual(app.calls.length, 1);
  });

  await check('reads are untouched — no token, no retry', async () => {
    const app = loadCsrf({ respond: () => json(403, { error: 'csrf' }) });
    await app.fetch('/api/history');
    assert.strictEqual(app.calls.length, 1);
    assert.strictEqual(
      headerOf(app.calls[0].config, 'X-CSRF-Token'),
      undefined,
      'a GET carries no token'
    );
  });

  await check('an unreachable server keeps the original answer', async () => {
    const app = loadCsrf({
      respond: (url, config, attempt) => {
        if (url === '/api/csrf-token') throw new Error('connection refused');
        if (attempt === 1) return json(403, { error: 'Invalid CSRF token' });
        return json(200, {});
      },
    });

    const response = await app.fetch('/api/x', { method: 'POST' });
    assert.strictEqual(
      response.status,
      403,
      'the caller should see the real failure, not the refresh failure'
    );
  });

  await check('an unchanged token is not retried in a loop', async () => {
    const app = loadCsrf({
      respond: (url) => {
        if (url === '/api/csrf-token') {
          return json(200, { csrfToken: 'stale-token' });
        }
        return json(403, { error: 'Invalid CSRF token' });
      },
    });

    const response = await app.fetch('/api/x', { method: 'POST' });
    assert.strictEqual(response.status, 403);
    assert.strictEqual(app.calls.length, 2, 'one try, one refresh, no repeat');
  });

  await check('an existing Headers object survives the retry', async () => {
    const app = loadCsrf({
      respond: (url, config, attempt) => {
        if (url === '/api/csrf-token') return json(200, { csrfToken: 'fresh' });
        return attempt === 1
          ? json(403, { error: 'Invalid CSRF token' })
          : json(200, {});
      },
    });

    const headers = new Headers({ 'Content-Type': 'application/json' });
    await app.fetch('/api/x', { method: 'POST', headers, body: '{}' });

    const retry = app.calls[2].config;
    assert.strictEqual(headerOf(retry, 'X-CSRF-Token'), 'fresh');
    assert.strictEqual(
      headerOf(retry, 'Content-Type'),
      'application/json',
      'the caller’s own headers must not be dropped'
    );
  });

  /* --- the endpoint the client leans on --------------------------------- */

  await check('the server offers the token endpoint', () => {
    const server = fs.readFileSync(
      path.join(__dirname, '..', 'server.js'),
      'utf8'
    );
    assert.ok(
      server.includes("app.get('/api/csrf-token'"),
      'GET /api/csrf-token is missing — the retry has nothing to call'
    );
    assert.ok(
      /\/api\/csrf-token:/.test(server),
      'the endpoint needs its @swagger block, or the spec drifts'
    );
  });

  if (failed > 0) {
    console.error(`\n${failed} CSRF refresh case(s) failed`);
    process.exit(1);
  }
  console.log('\nAll CSRF refresh cases passed');
})();
