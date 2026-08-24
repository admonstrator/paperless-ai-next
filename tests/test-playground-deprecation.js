/**
 * The Playground is on its way out (issue #307).
 *
 * It came over from the upstream project unchanged and was never maintained
 * here: every run analyzes the whole loaded document set, saved prompts exist
 * only in the visitor's localStorage, and the UI complaints in the issue are
 * real. Rather than redesign a page that is going away, this release takes it
 * out of the navigation and says so on the page; the routes, view and assets
 * follow in a later release.
 *
 * Until then the page has to keep working — someone with the URL bookmarked
 * must land on a working page that tells them what is happening, not on a 404
 * and not on an unchanged page that says nothing.
 *
 * This test goes away with the feature.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, '..', 'views');
const navSource = fs.readFileSync(
  path.join(viewsDir, 'partials', 'nav.ejs'),
  'utf8'
);
const playgroundSource = fs.readFileSync(
  path.join(viewsDir, 'playground.ejs'),
  'utf8'
);
const routeSource = fs.readFileSync(
  path.join(__dirname, '..', 'routes', 'setup.js'),
  'utf8'
);

// ── Gone from both navigation surfaces ───────────────────────────────────────
// nav.ejs declares the destinations once; the rail renders every entry and the
// phone tab bar renders those carrying `tab`. One array, so one assertion.

assert.ok(
  !/href:\s*'\/playground'/.test(navSource),
  'The Playground must not be listed in views/partials/nav.ejs — it is deprecated'
);
assert.ok(
  /href:\s*'\/manual'/.test(navSource) && /href:\s*'\/history'/.test(navSource),
  'Removing the Playground entry must not take its neighbours with it'
);

// ── Still reachable, and honest about it ─────────────────────────────────────

assert.ok(
  /router\.get\('\/playground'/.test(routeSource),
  'The route must stay until the feature is actually removed — a bookmarked URL should not 404'
);

const bannerMatch =
  /<div class="zr-alert zr-alert--warn" role="alert">[\s\S]*?<\/div>\s*<\/div>/.exec(
    playgroundSource
  );
assert.ok(
  bannerMatch,
  'views/playground.ejs must carry a zr-alert--warn deprecation banner'
);
const banner = bannerMatch[0];

assert.ok(
  /deprecated/i.test(banner),
  'The banner must say the page is deprecated'
);
assert.ok(
  /browser only/i.test(banner),
  'The banner must warn that saved prompts live in the browser only, so they can be copied before the page goes'
);
assert.ok(
  /href="\/manual"/.test(banner),
  'The banner must point at Manual processing as the way to try a prompt'
);
assert.ok(
  playgroundSource.indexOf(banner) < playgroundSource.indexOf('analysisPrompt'),
  'The banner must sit above the page content, not below it'
);

// ── The API says so too ──────────────────────────────────────────────────────

const spec = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'OPENAPI', 'openapi.json'), 'utf8')
);

[
  ['/playground', 'get'],
  ['/api/playground/bootstrap', 'get'],
  ['/manual/playground', 'post'],
].forEach(([route, method]) => {
  const operation = spec.paths?.[route]?.[method];
  assert.ok(operation, `${method.toUpperCase()} ${route} must stay documented`);
  assert.strictEqual(
    operation.deprecated,
    true,
    `${method.toUpperCase()} ${route} must be marked deprecated in OPENAPI/openapi.json`
  );
});

console.log('PASS test-playground-deprecation');
