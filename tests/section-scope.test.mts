import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const helperPath = fileURLToPath(new URL('../includes/atn-section.php', import.meta.url));
const topic = readFileSync(new URL('./fixtures/archive-topic.html', import.meta.url), 'utf8');
const summary = readFileSync(new URL('./fixtures/archive-summary.html', import.meta.url), 'utf8');
const phpAvailable = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0;

// Run the shipped PHP helper, with only the surrounding WordPress APIs stubbed.
function runPHP(body: string, data: unknown) {
  const stubs = `
    define('ABSPATH', '/');
    $posts = array(); $current = null; $ancestor_reads = array(); $filters = array();
    function get_post($p = null) { global $posts, $current; if ($p === null) { $p = $current; } return is_object($p) ? $p : ($posts[$p] ?? null); }
    function get_post_ancestors($p) { global $posts, $ancestor_reads; $p = get_post($p); $ancestor_reads[$p->ID] = ($ancestor_reads[$p->ID] ?? 0) + 1; $result = array(); while ($p && $p->post_parent && !in_array($p->post_parent, $result, true)) { $result[] = $p->post_parent; $p = $posts[$p->post_parent] ?? null; } return $result; }
    function has_shortcode($s, $tag) { return strpos($s, '[' . $tag . ']') !== false; }
    function add_filter($tag, $callback, $priority = 10) { global $filters; $filters[$tag][] = $callback; }
    function is_singular($type) { $p = get_post(); return $p && $p->post_type === $type; }
    function get_queried_object_id() { $p = get_post(); return $p ? $p->ID : 0; }
    function wp_parse_url($url) { return parse_url($url); }
    function wp_strip_all_tags($s) { return strip_tags($s); }
    function esc_html($s) { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }
    function esc_url($s) { return preg_match('~^https?://~i', $s) ? htmlspecialchars($s, ENT_QUOTES, 'UTF-8') : ''; }
    function page($id, $parent = 0, $content = '', $slug = '', $title = '') { return (object) array('ID' => $id, 'post_type' => 'page', 'post_parent' => $parent, 'post_content' => $content, 'post_name' => $slug, 'post_title' => $title); }
    require $argv[1];
    $input = json_decode(stream_get_contents(STDIN), true);
  `;
  const result = spawnSync('php', ['-r', stubs + body, helperPath], { input: JSON.stringify(data), encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('shared scope includes old and future descendants and shortcode pages, excluding unrelated content', { skip: !phpAvailable && 'PHP CLI unavailable locally; executes in CI' }, () => {
  const result = runPHP(`
    $posts[61258] = page(61258); $posts[61269] = page(61269);
    $posts[61285] = page(61285, 61269); $posts[999991] = page(999991, 61285);
    $posts[999992] = page(999992, 61258); $posts[999993] = page(999993, 0, '[atn_archive_index]');
    $posts[999994] = page(999994, 0, '[arabiatrend_now]'); $posts[999995] = page(999995, 0, '[atn_lightview]');
    $posts[8] = page(8); $posts[9] = page(9, 8); $posts[10] = page(10, 0, '[arabiatrend_now]'); $posts[10]->post_type = 'post';
    $result = array(); foreach (array(61258,61269,61285,999991,999992,999993,999994,999995,8,9,10,0) as $id) { $result[(string) $id] = atn_lightview_is_section($id); }
    atn_lightview_is_section(999991);
    $current = 999991; $result['body'] = $filters['body_class'][0](array('page'));
    $current = 8; $result['unrelatedBody'] = $filters['body_class'][0](array('page'));
    $result['reads'] = $ancestor_reads[999991]; echo json_encode($result);
  `, {});
  for (const id of [61258, 61269, 61285, 999991, 999992, 999993, 999994, 999995]) assert.equal(result[id], true, String(id));
  for (const id of [8, 9, 10, 0]) assert.equal(result[id], false, String(id));
  assert.deepEqual(result.body, ['page', 'atn-trend-section']);
  assert.deepEqual(result.unrelatedBody, ['page']);
  assert.equal(result.reads, 1);
});

test('organizes the existing archived source while preserving historical bytes and native enrichment', { skip: !phpAvailable && 'PHP CLI unavailable locally; executes in CI' }, () => {
  const enrichment = '<section class="atni-context"><h3>قراءة أحدث رصد متاح</h3><p>رصد محفوظ</p></section><section class="atn-coverage"><h3>تغطية مرتبطة من الترند العربي</h3><ul><li><a href="https://arabiatrend.com/44114">مادة مرتبطة</a></li></ul></section>';
  const input = topic + enrichment;
  const result = runPHP(`
    $posts[61269] = page(61269); $posts[61285] = page(61285, 61269, $input['content'], 'topic-33bbc109ca7d7b0ac6f8277e', 'BbY WOW | سجل الرواج'); $current = 61285;
    $once = atn_lightview_archive_sources($input['content']); $twice = atn_lightview_archive_sources($once);
    echo json_encode(array('once' => $once, 'twice' => $twice));
  `, { content: input });
  const table = topic.match(/<div class="atna-table">[\s\S]*?<\/table><\/div>/)![0];
  const thumbnail = topic.match(/<a class="atn-thumb[\s\S]*?<\/a>/)![0];
  const method = topic.match(/<details class="atna-method">[\s\S]*?<\/details>/)![0];
  assert.equal(result.once.includes(table), true, 'History table preserved byte for byte');
  assert.equal(result.once.includes(method), true, 'Methodology preserved byte for byte');
  assert.equal(result.once.endsWith(enrichment), true, 'Original native context and final coverage untouched');
  assert.equal(result.once.split(thumbnail).length - 1, 1, 'Original external thumbnail appears once');
  assert.match(result.once, /<h3>تغطيات مرتبطة بالموضوع<\/h3>/);
  assert.match(result.once, /<small dir="ltr">music\.apple\.com<\/small>/);
  assert.doesNotMatch(result.once, /فتح العمل الأصلي/);
  assert.equal(result.once.indexOf('atn-archive-sources') < result.once.indexOf('atn-coverage'), true);
  assert.equal(result.once.indexOf('atn-archive-sources') < result.once.indexOf('atna-table'), true);
  assert.match(result.once, /<strong>BbY WOW<\/strong>/);
  assert.equal(result.twice, result.once, 'Transformation is idempotent');
});

test('leaves summaries, unrelated pages, missing sources and invalid or mismatched destinations untouched', { skip: !phpAvailable && 'PHP CLI unavailable locally; executes in CI' }, () => {
  const url = 'https://music.apple.com/dz/album/bby-wow/6796864741?i=6796864754';
  const cases = [
    { id: 20, parent: 0, slug: 'topic-33bbc109ca7d7b0ac6f8277e', content: topic },
    { id: 21, parent: 61269, slug: 'qa-music-2026-11-17', content: summary },
    { id: 22, parent: 61269, slug: 'topic-33bbc109ca7d7b0ac6f8277e', content: topic.replace(/<p><a[^>]*>فتح العمل الأصلي ↗<\/a><\/p>/, '') },
    { id: 23, parent: 61269, slug: 'topic-33bbc109ca7d7b0ac6f8277e', content: topic.replaceAll(url, 'javascript:alert(1)') },
    { id: 24, parent: 61269, slug: 'topic-33bbc109ca7d7b0ac6f8277e', content: topic.replace(url, 'https://example.com/different') },
  ];
  const result = runPHP(`
    $posts[61269] = page(61269); $result = array();
    foreach ($input as $case) { $current = $case['id']; $posts[$current] = page($current, $case['parent'], $case['content'], $case['slug'], 'BbY WOW | سجل الرواج'); $result[] = atn_lightview_archive_sources($case['content']); }
    echo json_encode($result);
  `, cases);
  assert.deepEqual(result, cases.map(c => c.content));
});
