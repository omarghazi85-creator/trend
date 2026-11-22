import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const php = readFileSync(new URL('../atn-lightview.php', import.meta.url), 'utf8');

test('unsafe archived detail permalinks return 404 without touching stored pages', () => {
  assert.match(php, /function atn_lightview_archive_detail_blocked\(\$post\)/);
  assert.match(php, /\(int\) \$post->post_parent === 61269/);
  assert.match(php, /!atn_lightview_archive_title_allowed\(get_the_title\(\$post\)\)/);
  assert.match(php, /if \(!is_singular\('page'\) \|\| is_preview\(\)\) \{ return; \}/);
  assert.match(php, /current_user_can\('edit_post', \$post->ID\)/);
  assert.match(php, /\$wp_query->set_404\(\)/);
  assert.match(php, /status_header\(404\)/);
  assert.match(php, /header\('X-Robots-Tag: noindex'/);
  assert.doesNotMatch(php, /wp_schedule_event\s*\(/);
});

test('PHP blocks excluded archive child only, preserves legitimate countries and other pages', t => {
  const version = spawnSync('php', ['-v'], {encoding:'utf8'});
  if (version.error) { t.skip('PHP CLI not present'); return; }
  const policy = php.match(/function atn_lightview_archive_title_allowed\(\$title\) \{[\s\S]*?\n\}/);
  const detail = php.match(/function atn_lightview_archive_detail_blocked\(\$post\) \{[\s\S]*?\n\}/);
  assert.ok(policy && detail, 'extract pure filter and archive scope guard');
  const stub = `class WP_Post {
    public $post_type; public $post_parent; public $post_title;
    public function __construct($type,$parent,$title) {
      $this->post_type=$type; $this->post_parent=$parent; $this->post_title=$title;
    }
  }
  function get_the_title($post){return $post->post_title;}
  function wp_strip_all_tags($title){return strip_tags($title);}
  `;
  const script = stub + policy[0] + '\n' + detail[0] + '\n' +
    'echo json_encode(array_map("atn_lightview_archive_detail_blocked",array(' +
    'new WP_Post("page",61269,"ميا خليفة | سجل الرواج"),' +
    'new WP_Post("page",61269,"سجل الرواج | OnlyFans"),' +
    'new WP_Post("page",61269,"porn%68ub | سجل الرواج"),' +
    'new WP_Post("page",61269,"only%252566ans | سجل الرواج"),' +
    'new WP_Post("page",61269,"only&amp;#37;66ans | سجل الرواج"),' +
    'new WP_Post("page",61269,"نمو 25% في مصر | سجل الرواج"),' +
    'new WP_Post("page",61269,"كلمات البحث الرائجة في السودان"),' +
    'new WP_Post("page",61269,"كلمات البحث الرائجة في الصومال"),' +
    'new WP_Post("page",61269,"كلمات البحث الرائجة في جيبوتي"),' +
    'new WP_Post("page",61269,"كلمات البحث الرائجة في جزر القمر"),' +
    'new WP_Post("page",61258,"ميا خليفة"),' +
    'new WP_Post("post",61269,"ميا خليفة"),' +
    'null)));';
  const result = spawnSync('php',['-r',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),[true,true,true,true,true,false,false,false,false,false,false,false,false]);
});
