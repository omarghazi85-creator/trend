import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const plugin = readFileSync(new URL('../atn-lightview.php', import.meta.url), 'utf8');
const script = plugin.match(/<script id="atn-title-internal-routing">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'Native title enhancement script is present');
const fixture = readFileSync(new URL('./fixtures/native-trend-cards.html', import.meta.url), 'utf8');
const archiveFixture = readFileSync(new URL('./fixtures/archive-summary.html', import.meta.url), 'utf8');
const origin = 'https://arabiatrend.com';
const base = origin + '/arab-trends-now/';
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'");

// Parse real rendered card markup, preserving the hierarchy and attributes.
// This small test DOM supports ordinary descendant/child selectors only; it
// deliberately does not invent the old heuristic headings or shared anchors.
class Element {
  tagName: string;
  attrs = new Map<string, string>();
  children: Element[] = [];
  parentElement: Element | null = null;
  nodeType = 1;
  constructor(tag: string, attrs = '') {
    this.tagName = tag.toUpperCase();
    for (const m of attrs.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g)) {
      this.attrs.set(m[1], decode(m[2] ?? m[3] ?? m[4] ?? ''));
    }
  }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  hasAttribute(name: string) { return this.attrs.has(name); }
  setAttribute(name: string, value: unknown) { this.attrs.set(name, String(value)); }
  removeAttribute(name: string) { this.attrs.delete(name); }
  get href() { return new URL(this.getAttribute('href') ?? '', base).href; }
  set href(value: string) { this.setAttribute('href', value); }
  append(child: Element) { child.parentElement = this; this.children.push(child); }
  matches(selector: string): boolean {
    return selector.split(',').some(part => matchesChain(this, part.trim()));
  }
  closest(selector: string): Element | null {
    for (let node: Element | null = this; node; node = node.parentElement) {
      if (node.matches(selector)) return node;
    }
    return null;
  }
  querySelectorAll(selector: string): Element[] {
    const matches: Element[] = [];
    const walk = (node: Element) => {
      for (const child of node.children) {
        if (child.matches(selector)) matches.push(child);
        walk(child);
      }
    };
    walk(this);
    return matches;
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
}
function matchesSimple(node: Element, selector: string): boolean {
  let matches = true;
  selector = selector.replace(/:not\(([^)]+)\)/g, (_, excluded) => {
    if (matchesSimple(node, excluded)) matches = false;
    return '';
  });
  selector = selector.replace(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g, (_, name, value) => {
    if (!node.hasAttribute(name) || (value !== undefined && node.getAttribute(name) !== value)) matches = false;
    return '';
  });
  for (const cls of selector.matchAll(/\.([\w-]+)/g)) {
    if (!(node.getAttribute('class') ?? '').split(/\s+/).includes(cls[1])) matches = false;
  }
  const tag = selector.match(/^[\w-]+/);
  return matches && (!tag || tag[0].toUpperCase() === node.tagName);
}
function matchesChain(node: Element, selector: string): boolean {
  const tokens = selector.replace(/\s*>\s*/g, ' > ').split(/\s+/);
  if (!matchesSimple(node, tokens.pop() ?? '')) return false;
  let ancestor = node.parentElement;
  while (tokens.length) {
    const token = tokens.pop()!;
    if (token === '>') {
      const parentSelector = tokens.pop()!;
      if (!ancestor || !matchesSimple(ancestor, parentSelector)) return false;
      ancestor = ancestor.parentElement;
    } else {
      while (ancestor && !matchesSimple(ancestor, token)) ancestor = ancestor.parentElement;
      if (!ancestor) return false;
      ancestor = ancestor.parentElement;
    }
  }
  return true;
}
function parse(markup: string) {
  const root = new Element('document');
  const stack = [root];
  const voidTags = new Set(['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR']);
  for (const match of markup.matchAll(/<(\/?)([a-z][\w-]*)([^>]*?)>/gi)) {
    const [, closing, tag, attrs] = match;
    if (closing) {
      while (stack.length > 1) { if (stack.pop()!.tagName === tag.toUpperCase()) break; }
    } else {
      const node = new Element(tag, attrs.replace(/\/$/, ''));
      stack.at(-1)!.append(node);
      if (!voidTags.has(node.tagName) && !attrs.endsWith('/')) stack.push(node);
    }
  }
  return root;
}
function setup(markup = fixture, readyState = 'complete') {
  const document = parse(markup) as Element & { readyState: string; addEventListener: Function };
  document.readyState = readyState;
  const listeners: { type: string; handler: Function; options: unknown }[] = [];
  document.addEventListener = (type: string, handler: Function, options: unknown) => listeners.push({ type, handler, options });
  const observers: { callback: Function; target?: Element; options?: any }[] = [];
  const navigations: string[] = [];
  class Observer {
    record: { callback: Function; target?: Element; options?: any };
    constructor(callback: Function) { this.record = { callback }; observers.push(this.record); }
    observe(target: Element, options: any) { Object.assign(this.record, { target, options }); }
  }
  const location = { origin, href: base, assign: (url: string) => navigations.push(url) };
  const run = () => runInNewContext(script!, { document, location, window: { location }, URL, MutationObserver: Observer });
  const mutate = (node: Element) => observers.forEach(({ callback }) => callback([{ addedNodes: [node] }]));
  return { document, listeners, observers, navigations, run, mutate };
}
const titleOf = (card: Element) => card.querySelector('.atn-card-content > h3 > a[href]')!;
const cardsOf = (document: Element) => document.querySelectorAll('article.atn-card');
const hrefs = (card: Element) => card.querySelectorAll('a[href]').map(a => a.getAttribute('href'));

test('real native search, music and video titles reuse their existing detail links; external controls are unchanged', () => {
  const env = setup();
  const cards = cardsOf(env.document);
  assert.equal(cards.length, 3);
  assert.ok(cards[0].matches('.atn-card-search'));
  assert.ok(cards[1].matches('.atn-card-music'));
  assert.ok(cards[2].matches('.atn-card-video'));
  const before = cards.map(card => card.querySelectorAll('a[href]').filter(a => a !== titleOf(card)).map(a => Object.fromEntries(a.attrs)));
  const native = cards.map(card => card.querySelector('.atni-follow')!.getAttribute('data-atni-url'));
  assert.equal(titleOf(cards[1]).getAttribute('target'), '_blank');
  env.run();
  cards.forEach((card, index) => {
    const title = titleOf(card);
    assert.equal(title.href, native[index]);
    assert.equal(title.getAttribute('target'), null);
    assert.equal(title.getAttribute('rel'), null);
    assert.equal(title.getAttribute('data-atn-source-href'), null);
    assert.deepEqual(card.querySelectorAll('a[href]').filter(a => a !== title).map(a => Object.fromEntries(a.attrs)), before[index]);
  });
  assert.deepEqual(env.navigations, []);
  assert.equal(env.listeners.some(l => l.type === 'click' || l.type === 'keydown'), false);
});

test('uses the existing native details action when follow metadata is missing', () => {
  const env = setup();
  const video = cardsOf(env.document)[2];
  const expected = video.querySelector('.atn-card-actions a[href]')!.href;
  video.querySelector('.atni-follow')!.removeAttribute('data-atni-url');
  env.run();
  assert.equal(titleOf(video).href, expected);
});

test('rejects offsite, credential-bearing, malformed and unrelated destinations without rewriting the media title', () => {
  const id = 'f'.repeat(64);
  const bad = [
    'https://evil.example/arab-trends-now?atn_topic=' + id,
    'https://arabiatrend.com.evil.example/arab-trends-now?atn_topic=' + id,
    'https://name:password@arabiatrend.com/arab-trends-now?atn_topic=' + id,
    'https://arabiatrend.com/arab-trends-now?atn_topic=short',
    'https://arabiatrend.com/other?atn_topic=' + id,
    'https://arabiatrend.com/arab-trends-now?atn_topic=' + id + '&redirect=https://evil.example',
    'https://arabiatrend.com/arab-trends-now?atn_topic=' + id + '&atn_topic=' + id,
    'https://arabiatrend.com/arab-trends-now?atn_topic=' + id + '#source',
    'https://arabiatrend.com/trend-archive/topic-short',
    'javascript:alert(1)',
  ];
  for (const value of bad) {
    const env = setup();
    const video = cardsOf(env.document)[2];
    video.querySelector('.atni-follow')!.setAttribute('data-atni-url', value);
    video.querySelector('.atn-card-actions a[href]')!.setAttribute('href', value);
    const original = Object.fromEntries(titleOf(video).attrs);
    env.run();
    assert.deepEqual(Object.fromEntries(titleOf(video).attrs), original, value);
  }
});

test('enhances cards inserted later, preserving their thumbnail and allowing repeated enhancement', () => {
  const env = setup();
  env.run();
  assert.equal(env.observers.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(env.observers[0].options)), { childList: true, subtree: true });
  const added = cardsOf(parse(fixture))[2];
  const expected = added.querySelector('.atni-follow')!.getAttribute('data-atni-url');
  const external = added.querySelector('.atn-thumb')!.href;
  env.document.querySelector('.atn-grid')!.append(added);
  env.mutate(added);
  assert.equal(titleOf(added).href, expected);
  assert.equal(added.querySelector('.atn-thumb')!.href, external);
  const enhanced = hrefs(added);
  env.mutate(titleOf(added));
  assert.deepEqual(hrefs(added), enhanced);
  assert.deepEqual(env.navigations, []);
});

test('does not touch native detail-page content outside the dashboard', () => {
  const env = setup(fixture.replace('atn atn-dashboard', 'atn atn-detail'));
  const original = cardsOf(env.document).map(hrefs);
  env.run();
  assert.deepEqual(cardsOf(env.document).map(hrefs), original);
  assert.equal(env.observers.length, 0);
});

test('waits for the DOM when necessary without intercepting user navigation', () => {
  const env = setup(fixture, 'loading');
  const video = cardsOf(env.document)[2];
  const original = titleOf(video).href;
  env.run();
  assert.equal(titleOf(video).href, original);
  assert.deepEqual(env.listeners.map(l => l.type), ['DOMContentLoaded']);
  env.listeners[0].handler();
  assert.equal(titleOf(video).href, video.querySelector('.atni-follow')!.getAttribute('data-atni-url'));
});

test('uses the same enhancement for archived and later-added summary cards without inventing destinations', () => {
  const env = setup(archiveFixture);
  const archiveCards = env.document.querySelectorAll('article.atna-item');
  assert.equal(archiveCards.length, 14);
  const originalMedia = archiveCards.map(card => card.querySelector('.atn-thumb')!.href);
  const originalTitles = archiveCards.map(card => card.querySelector('h3 a')?.href ?? null);
  env.run();
  assert.equal(env.observers.length, 1);
  assert.deepEqual(archiveCards.map(card => card.querySelector('.atn-thumb')!.href), originalMedia);
  assert.deepEqual(archiveCards.map(card => card.querySelector('h3 a')?.href ?? null), originalTitles);
  const added = parse(archiveFixture).querySelector('article.atna-item')!;
  const expected = added.querySelector('h3 a')!.href;
  added.querySelector('h3 a')!.setAttribute('target', '_blank');
  env.document.querySelector('.atna-grid')!.append(added);
  env.mutate(added);
  assert.equal(added.querySelector('h3 a')!.href, expected);
  assert.equal(added.querySelector('h3 a')!.getAttribute('target'), null);
  assert.deepEqual(env.navigations, []);
});

test('retires URL-supplied snapshots with an encoded search value and no copied summary or source phrase', (t) => {
  assert.match(plugin, /add_filter\('do_shortcode_tag', 'atn_lightview_restore_native_titles', 100, 2\)/);
  assert.match(plugin, /wp_safe_redirect\(atn_lightview_legacy_detail_destination\(\), 302, 'ArabiaTrend'\)/);
  assert.match(plugin, /'query' => rawurlencode\(\$title\), 'atn_period' => '30'/);
  assert.doesNotMatch(plugin, /atn_snapshot|فتح المحتوى الأصلي لدى المصدر الخارجي|window\.location\.assign|stopImmediatePropagation/);
  const legacyFunction = plugin.match(/function atn_lightview_legacy_detail_destination\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(legacyFunction);
  // Execute the real PHP destination function when PHP is available (CI).
  // For a query-free base and new string values, add_query_arg preserves
  // already-encoded values; callers must encode query delimiters themselves.
  const php = `
    function wp_unslash($s) { return stripslashes($s); }
    function sanitize_text_field($s) { return trim(strip_tags($s)); }
    function wp_html_excerpt($s, $limit, $suffix) { return substr($s, 0, $limit); }
    function home_url($path) { return 'https://arabiatrend.com' . $path; }
    function add_query_arg($args, $base) {
        $pairs = array();
        foreach ($args as $key => $value) { $pairs[] = $key . '=' . $value; }
        return $base . '?' . implode('&', $pairs);
    }
    ${legacyFunction}
    $result = array();
    foreach (json_decode(stream_get_contents(STDIN), true) as $title) {
        $_GET = array('atn_title' => $title);
        $result[] = atn_lightview_legacy_detail_destination();
    }
    echo json_encode($result);
  `;
  const samples = ['R&D', 'C++', '#topic', 'A & B + C #1'];
  const result = spawnSync('php', ['-r', php], { input: JSON.stringify(samples), encoding: 'utf8' });
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
    t.diagnostic('PHP CLI unavailable locally; source encoding guard passed. Runtime delimiter cases execute in CI with PHP.');
    return;
  }
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const destinations = JSON.parse(result.stdout) as string[];
  assert.equal(destinations.length, samples.length);
  destinations.forEach((destination, index) => {
    const url = new URL(destination);
    assert.equal(url.origin, origin);
    assert.equal(url.pathname, '/arab-trends-now/');
    assert.equal(url.searchParams.get('query'), samples[index]);
    assert.equal(url.searchParams.get('atn_period'), '30');
    assert.deepEqual([...url.searchParams.keys()], ['query', 'atn_period']);
    assert.equal(url.hash, '');
  });
});



test('country archive titles reuse verified native internal actions for all 22 countries without changing original media links', () => {
  const countries = 'sa ae eg kw qa bh om jo lb iq sy sd ps ye ly tn dz ma mr so dj km'.split(' ');
  for (const code of countries) {
    const env = setup();
    const card = cardsOf(env.document)[2];
    const expected = origin + '/trend-archive/' + code + '-search-2026-11-21';
    card.querySelector('.atni-follow')!.setAttribute('data-atni-url', expected);
    const thumb = card.querySelector('.atn-thumb')!.href;
    const otherLinks = card.querySelectorAll('a[href]').filter(a => a !== titleOf(card)).map(a => Object.fromEntries(a.attrs));
    env.run();
    assert.equal(titleOf(card).href, expected, code);
    assert.equal(titleOf(card).getAttribute('target'), null, code);
    assert.equal(card.querySelector('.atn-thumb')!.href, thumb, code);
    assert.deepEqual(card.querySelectorAll('a[href]').filter(a => a !== titleOf(card)).map(a => Object.fromEntries(a.attrs)), otherLinks, code);
  }
});

test('accepts safe root-relative native country details without changing original media controls', () => {
  const env = setup();
  const card = cardsOf(env.document)[2];
  const url = '/trend-archive/sd-search-2026-11-21';
  card.querySelector('.atni-follow')!.setAttribute('data-atni-url', url);
  const thumbnail = card.querySelector('.atn-thumb')!.href;
  env.run();
  assert.equal(titleOf(card).href, origin + url);
  assert.equal(card.querySelector('.atn-thumb')!.href, thumbnail);
});

test('rejects spoofed, undated and invalid country archive actions without rewriting a title', () => {
  const bad = [
    'https://evil.example/trend-archive/sd-search-2026-11-21',
    'https://arabiatrend.com.evil.example/trend-archive/so-search-2026-11-21',
    'https://user:pass@arabiatrend.com/trend-archive/dj-search-2026-11-21',
    origin + '/trend-archive/us-search-2026-11-21',
    origin + '/trend-archive/sd-search-2026-02-30',
    origin + '/trend-archive/km-search-today',
    origin + '/trend-archive/so-search-2026-11-21?redirect=https://evil.example',
    origin + '/trend-archive/dj-week-2026-11-21#external',
    'javascript:alert(1)'
  ];
  for (const url of bad) {
    const env = setup();
    const card = cardsOf(env.document)[2];
    card.querySelector('.atni-follow')!.setAttribute('data-atni-url', url);
    card.querySelector('.atn-card-actions a[href]')!.setAttribute('href', url);
    const original = Object.fromEntries(titleOf(card).attrs);
    env.run();
    assert.deepEqual(Object.fromEntries(titleOf(card).attrs), original, url);
  }
});

test('server-side PHP title routing recognizes only existing canonical country and topic detail links', (t) => {
  const named = ['atn_lightview_country_codes', 'atn_lightview_archive_link_allowed', 'atn_lightview_native_topic_url'];
  const extracted = named.map(name => {
    const match = plugin.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'));
    assert.ok(match, name + ' exists');
    return match[0];
  });
  const php = [
    "function home_url($path) { return 'https://arabiatrend.com' . $path; }",
    'function wp_parse_url($url) { return parse_url($url); }',
    ...extracted,
    '$urls = json_decode(stream_get_contents(STDIN), true);',
    '$result = array();',
    'foreach ($urls as $url) { $result[] = atn_lightview_native_topic_url($url); }',
    'echo json_encode($result);'
  ].join('\n');
  const good = [
    origin + '/trend-archive/sd-search-2026-11-21',
    origin + '/trend-archive/so-music-2026-11-21/',
    origin + '/trend-archive/dj-week-2026-11-21',
    origin + '/trend-archive/km-search-2026-11-21',
    origin + '/trend-archive/sa-search-2026-11-21',
    origin + '/trend-archive/eg-search-2026-11-21',
    origin + '/trend-archive/topic-' + 'f'.repeat(24),
    origin + '/arab-trends-now?atn_topic=' + 'f'.repeat(64),
    '/trend-archive/sd-search-2026-11-21',
    '/trend-archive/so-music-2026-11-21'
  ];
  const bad = [
    origin + '/trend-archive/us-search-2026-11-21',
    origin + '/trend-archive/so-search-2026-02-30',
    origin + '/trend-archive/sd-search-2026-11-21?source=external',
    origin + '/trend-archive/km-week-2026-11-21#source',
    'https://evil.example/trend-archive/sd-search-2026-11-21',
    origin + '/trend-archive/dj-search-today',
    origin + '/arab-trends-now?atn_topic=' + 'f'.repeat(64) + '&return=external',
    origin + '/arab-trends-now?atn_topic=' + 'f'.repeat(64) + '&atn_topic=' + 'f'.repeat(64),
    origin + '/arab-trends-now?atn_topic=' + 'f'.repeat(64) + '#source',
    '//evil.example/trend-archive/sd-search-2026-11-21'
  ];
  const result = spawnSync('php', ['-r', php], { input: JSON.stringify([...good, ...bad]), encoding: 'utf8' });
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
    t.diagnostic('PHP CLI unavailable here; the canonical country link cases run in CI.');
    return;
  }
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [...good.map(url => url.startsWith('/') ? origin + url : url), ...bad.map(() => '')]);
});
