/* Builds the public legal site (privacy policy + terms + app-ads.txt) that
 * AdMob, Google Play and the App Store link to, straight from the in-app
 * screens' own text so the two can never drift apart.
 *
 * Usage (from apps/mobile): node scripts/build-legal-site.js
 * Output: ../../site/ — deploy that folder as a static site.
 */
const fs = require('fs');
const path = require('path');

// eslint-disable-next-line no-undef -- a plain Node script, not app code
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '../../site');

// The screens keep their text as plain string literals (`const LAST_UPDATED`
// and `const SECTIONS = [...]`), so evaluating just those two declarations
// is enough — no TypeScript/JSX tooling needed.
function readLegalScreen(file) {
  const src = fs.readFileSync(path.join(ROOT, 'app', file), 'utf8');
  const updated = src.match(/const LAST_UPDATED = '([^']+)';/)[1];
  const body = src.match(/const SECTIONS: [^=]+= (\[[\s\S]*?\n\]);/)[1];
  const sections = new Function(`return ${body};`)();
  return { updated, sections };
}

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Bare domains and e-mail addresses in the text become links.
const linkify = (s) =>
  escape(s)
    .replace(/\b([\w.-]+@[\w-]+\.[\w.]+[a-z])/g, '<a href="mailto:$1">$1</a>')
    .replace(/\b((?:policies\.google\.com|revenuecat\.com|pexels\.com|sentry\.io)(?:\/[\w/.-]*[\w/])?)/g, '<a href="https://$1">$1</a>');

function page({ title, intro, updated, sections, other }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="icon" type="image/png" href="logo.png">
<style>
  :root { --text: #1f2937; --muted: #6b7280; --line: #e5e7eb; --accent: #6558D9; --bg: #ffffff; }
  @media (prefers-color-scheme: dark) {
    :root { --text: #e5e7eb; --muted: #9ca3af; --line: #374151; --accent: #9d93f0; --bg: #111118; }
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    max-width: 720px; margin: 0 auto; padding: 32px 16px 80px;
    line-height: 1.6; color: var(--text); background: var(--bg);
  }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand img { width: 56px; height: 56px; border-radius: 14px; flex-shrink: 0; }
  h1 { font-size: 28px; margin: 0; }
  .updated { color: var(--muted); font-size: 14px; margin: 8px 0 28px; }
  h2 { font-size: 20px; margin-top: 32px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
  a { color: var(--accent); }
  nav { margin-top: 48px; font-size: 14px; color: var(--muted); }
</style>
</head>
<body>
<div class="brand">
  <img src="logo.png" alt="PuraEvents logo" width="56" height="56">
  <h1>${title}</h1>
</div>
<p class="updated">Last updated: ${updated}</p>
<p>${intro}</p>
${sections.map((s) => `<h2>${escape(s.heading)}</h2>\n<p>${linkify(s.body)}</p>`).join('\n')}
<nav>${other}</nav>
</body>
</html>
`;
}

fs.mkdirSync(OUT, { recursive: true });

const privacy = readLegalScreen('privacy.tsx');
fs.writeFileSync(
  path.join(OUT, 'index.html'),
  page({
    title: 'PuraEvents Privacy Policy',
    intro: 'This Privacy Policy explains what information PuraEvents (&ldquo;the app&rdquo;, &ldquo;we&rdquo;) handles and how.',
    ...privacy,
    other: '<a href="terms.html">Terms of Use</a>',
  })
);

const terms = readLegalScreen('terms.tsx');
fs.writeFileSync(
  path.join(OUT, 'terms.html'),
  page({
    title: 'PuraEvents Terms of Use',
    intro: 'These Terms of Use govern your use of PuraEvents (&ldquo;the app&rdquo;).',
    ...terms,
    other: '<a href="./">Privacy Policy</a>',
  })
);

// AdMob app-ads.txt — the same publisher line PuraPDF+'s site serves.
fs.writeFileSync(path.join(OUT, 'app-ads.txt'), 'google.com, pub-6967597025156397, DIRECT, f08c47fec0942fa0\n');
fs.copyFileSync(path.join(ROOT, 'assets/images/app-logo.png'), path.join(OUT, 'logo.png'));

console.log(`Wrote ${OUT}: index.html, terms.html, app-ads.txt, logo.png`);
