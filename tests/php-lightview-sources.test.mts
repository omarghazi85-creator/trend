import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const main=readFileSync(new URL('../atn-lightview.php',import.meta.url),'utf8');
const src=readFileSync(new URL('../includes/atn-section.php',import.meta.url),'utf8');
function extract(text:string,name:string):string {
 const head='function '+name+'(';
 const start=text.indexOf(head);
 assert.ok(start>=0,'expected PHP function '+name);
 const rest=text.slice(start);
 const match=rest.match(/^[\s\S]*?\n\}/);
 assert.ok(match,'complete PHP function '+name);
 return match[0];
}
const version=spawnSync('php',['-v'],{encoding:'utf8'});
const hasPhp=!version.error&&version.status===0;
function runPhp(body:string) {
 const code=`
 function wp_strip_all_tags($s){return strip_tags($s);}
 function get_post(){return (object)array('post_name'=>'topic-aaaaaaaaaaaaaaaaaaaaaaaa','post_title'=>'عنوان محلي | سجل الرواج');}
 function atn_lightview_is_section($p){return true;}
 function wp_parse_url($s){return parse_url($s);}
 function esc_url($s){return $s;}
 function esc_html($s){return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');}
 `+[extract(main,'atn_lightview_archive_title_allowed'),
      extract(src,'atn_lightview_archive_attribute'),
      extract(src,'atn_lightview_archive_source_url_allowed'),
      extract(src,'atn_lightview_archive_sources')].join('\n')+'\n'+body;
 const r=spawnSync('php',['-r',code],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 return JSON.parse(r.stdout);
}
test('PHP original-source URL guard blocks excluded media, even if the URL is multiply encoded',t=>{
 if(!hasPhp){t.skip('PHP unavailable');return;}
 const urls=[
  'https://example.com/clean-original','https://example.com/Essex-county',
  'https://onlyfans.com/creator','https://example.com/%6fnlyfans',
  'https://example.com/%25256fnlyfans','https://pornhub.com/video',
  'https://example.com/?q=sex%20video'
 ];
 const allowed=runPhp('echo json_encode(array_map("atn_lightview_archive_source_url_allowed",'+JSON.stringify(urls)+'));');
 assert.deepEqual(allowed,[true,true,false,false,false,false,false]);
});
test('historic archive preserves legitimate originals, hides excluded duplicate source controls without database writes',t=>{
 if(!hasPhp){t.skip('PHP unavailable');return;}
 const page=(url:string)=>'<section class="atna"><nav>ملخص</nav><p><a class="atn-thumb" href="'+url+'"><img src="/thumb.jpg" alt="صورة"></a></p><h2>تاريخ الرواج</h2><div class="atna-table"><table><tr><td>جدول محفوظ</td></tr></table></div><p><a href="'+url+'">فتح العمل الأصلي ↗</a></p><p>المنهجية الأصلية</p></section>';
 const urls=['https://example.com/sports','https://onlyfans.com/creator','https://example.com/%25256fnlyfans'];
 const contents=runPhp('echo json_encode(array_map("atn_lightview_archive_sources",'+JSON.stringify(urls.map(page))+'),JSON_UNESCAPED_UNICODE);');
 assert.equal(contents.length,3);
 assert.match(contents[0],/data-atn-archive-source="1"/);
 assert.match(contents[0],/https:\/\/example.com\/sports/);
 assert.doesNotMatch(contents[1],/onlyfans|atn-thumb|فتح العمل الأصلي/i);
 assert.doesNotMatch(contents[2],/onlyfans|%25256fnlyfans|atn-thumb|فتح العمل الأصلي/i);
 for(const html of contents){assert.match(html,/جدول محفوظ/);assert.match(html,/المنهجية الأصلية/);}
 assert.doesNotMatch(src,/wp_schedule_event\s*\(/);
 assert.doesNotMatch(src,/update_post_meta\s*\(|wp_update_post\s*\(/);
});
