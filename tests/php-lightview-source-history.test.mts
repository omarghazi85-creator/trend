import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const main=readFileSync(new URL('../atn-lightview.php',import.meta.url),'utf8');
const section=readFileSync(new URL('../includes/atn-section.php',import.meta.url),'utf8');

function extract(text:string,name:string):string {
  const start=text.indexOf('function '+name+'(');
  assert.ok(start>=0,'missing PHP function '+name);
  const match=text.slice(start).match(/^[\s\S]*?\n\}/);
  assert.ok(match,'missing complete PHP function '+name);
  return match[0];
}
const functions=[
  extract(main,'atn_lightview_archive_title_allowed'),
  extract(section,'atn_lightview_archive_attribute'),
  extract(section,'atn_lightview_archive_source_url_allowed'),
  extract(section,'atn_lightview_prune_excluded_archive_links')
].join('\n');
const php=spawnSync('php',['-v'],{encoding:'utf8'});
const hasPhp=!php.error&&php.status===0;
function evaluate(text:string,postSlug:string):string {
  const stub=String.raw`
  function wp_strip_all_tags($s){return strip_tags($s);}
  function get_post(){return (object)array('post_name'=>TEST_POST_SLUG);}
  function atn_lightview_is_section($post){return true;}
  `;
  const script="define('TEST_POST_SLUG',"+JSON.stringify(postSlug)+");\n"+
    stub+"\n"+functions+"\necho json_encode(atn_lightview_prune_excluded_archive_links("+
    JSON.stringify(text)+"), JSON_UNESCAPED_UNICODE);";
  const result=spawnSync('php',['-r',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout);
}

test('archived topic history removes forbidden original links and their images, leaves safe sources and table untouched',t=>{
  if(!hasPhp){t.skip('PHP CLI unavailable');return;}
  const html='<section class="atna"><table><tr><td>'+
    '<a href="https://news.example.com/saudi-trends">تغطية عربية مشروعة</a>'+
    '<a href="https://onlyfans.com/creator"><img src="/thumb-blocked.jpg" alt="صورة مخالفة"></a>'+
    '<a href="https://example.com/%25256fnlyfans">مصدر مشفر</a>'+
    '<a href="javascript:alert(1)"><img src="/unsafe.jpg" alt="عنصر غير آمن"></a>'+
    '<a href="data:text/html,hello">رابط بيانات</a>'+
    '<a href="/trend-archive/topic-aaaaaaaaaaaaaaaaaaaaaaaa">تفاصيل داخلية</a>'+
    '</td></tr></table><p>بقية السجل والمنهجية محفوظة</p></section>';
  const out=evaluate(html,'topic-aaaaaaaaaaaaaaaaaaaaaaaa');
  assert.match(out,/https:\/\/news\.example\.com\/saudi-trends/);
  assert.match(out,/href="\/trend-archive\/topic-aaaaaaaaaaaaaaaaaaaaaaaa"/);
  assert.match(out,/بقية السجل والمنهجية محفوظة/);
  assert.doesNotMatch(out,/onlyfans|%25256fnlyfans|thumb-blocked|صورة مخالفة|javascript:|data:text|unsafe\.jpg|عنصر غير آمن|رابط بيانات/i);
  assert.match(out,/<table><tr><td>/);
});
test('archive source filter is limited to topic history pages and avoids new queries or jobs',t=>{
  assert.match(section,/add_filter\('the_content', 'atn_lightview_prune_excluded_archive_links', 91\)/);
  assert.doesNotMatch(extract(section,'atn_lightview_prune_excluded_archive_links'), /WP_Query|wp_schedule_event|wp_update_post|update_post_meta|wp_remote_get/);
  if(!hasPhp){t.skip('PHP CLI unavailable');return;}
  const html='<section class="atna"><a href="https://onlyfans.com/creator">مصدر</a><p>نص محفوظ</p></section>';
  assert.equal(evaluate(html,'sa-search-2026-11-22'),html);
  assert.match(evaluate(html,'topic-bbbbbbbbbbbbbbbbbbbbbbbb'),/نص محفوظ/);
  assert.doesNotMatch(evaluate(html,'topic-bbbbbbbbbbbbbbbbbbbbbbbb'),/onlyfans/);
});
