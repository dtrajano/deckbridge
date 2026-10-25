import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownToHtml } from '../src/markdown';

test('renders common Agent responses as safe markdown', () => {
  const html = markdownToHtml('# Plan\n\n- **Step one**\n- `npm test`\n\n```ts\nconst ok = true;\n```');
  assert.match(html, /<h1>Plan<\/h1>/);
  assert.match(html, /<strong>Step one<\/strong>/);
  assert.match(html, /<pre><code class="language-ts">const ok = true;<\/code><\/pre>/);
});

test('escapes raw HTML and only links http(s) targets', () => {
  const html = markdownToHtml('<script>alert(1)</script> [safe](https://example.com) [bad](javascript:alert(1))');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.doesNotMatch(html, /javascript:/);
});
