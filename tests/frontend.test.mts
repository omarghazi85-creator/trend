import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function element(tag='div'){
  const listeners=new Map();
  return {
    tagName:tag,children:[],value:'',textContent:'',hidden:false,disabled:false,
    attributes:{},className:'',href:'',rel:'',target:'',
    addEventListener(name,fn){listeners.set(name,fn);},
    dispatch(name,event={}){const fn=listeners.get(name);assert.ok(fn,'handler '+name);return fn(event);},
    append(...nodes){this.children.push(...nodes);},
    replaceChildren(...nodes){this.children=[...nodes];},
    setAttribute(name,value){this.attributes[name]=value;},
  };
}
function setup(pages){
  const ids=['countries','countrySelect','query','results','status','typeSelect','loadMore','searchBtn'];
  const nodes=Object.fromEntries(ids.map(id=>[id,element()]));
  const requests=[];
  const fetch=async(url)=>{
    requests.push(url);
    const page=Number(new URL(url,'https://preview.example').searchParams.get('page'));
    const body=pages[page-1];
    if(!body)return {ok:false,json:async()=>({})};
    return {ok:true,json:async()=>body};
  };
  runInNewContext(script,{
    document:{getElementById:id=>nodes[id],createElement:element},
    fetch,AbortController,setTimeout,clearTimeout,Set,Boolean,Array,String,
  });
  return {nodes,requests};
}
const page=(number,items,hasMore)=>({
  scope:'latest_archived_pages_only',page:number,items,has_more:hasMore,
});
const item=(slug,title,country,kind='search')=>({
  link:'https://arabiatrend.com/trend-archive/'+slug,title,country,kind,date:/^[a-z]{2}-(?:search|music|week)-(\d{4}-\d{2}-\d{2})(?:-[a-z0-9]+)*$/u.exec(slug)?.[1]??'2026-11-16'
});
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

test('loads another batch once, removes duplicates, then hides button',async()=>{
  const first=item('sa-search-2026-11-16','السعودية اليوم','السعودية');
  const second=item('ma-search-2026-11-16','المغرب اليوم','المغرب');
  const {nodes,requests}=setup([page(1,[first],true),page(2,[first,second],false)]);
  await flush();
  assert.equal(nodes.results.children.length,1);
  assert.equal(nodes.loadMore.hidden,false);
  await nodes.loadMore.dispatch('click');
  await flush();
  assert.deepEqual(requests,['/.netlify/functions/archive?page=1','/.netlify/functions/archive?page=2']);
  assert.equal(nodes.results.children.length,2);
  assert.equal(nodes.loadMore.hidden,true);
  nodes.countrySelect.value='المغرب';
  nodes.countrySelect.dispatch('change');
  assert.equal(nodes.results.children.length,1);
  assert.equal(nodes.results.children[0].children[1].textContent,'المغرب اليوم');
});

test('invalid archive response does not display untrusted or mismatched data',async()=>{
  const {nodes}=setup([page(3,[item('sa-search','عنوان','السعودية')],false)]);
  await flush();
  assert.equal(nodes.results.children.length,0);
  assert.match(nodes.status.textContent,/تعذر تحميل/);
  assert.equal(nodes.loadMore.hidden,false);
  assert.equal(nodes.loadMore.disabled,false);
});

test('invalid link is excluded and title search is case-normalized',async()=>{
  const safe=item('eg-search-2026','Cairo Trends','مصر');
  const unsafe={...safe,link:'https://example.org/trend-archive/eg-search'};
  const {nodes}=setup([page(1,[unsafe,safe],false)]);
  await flush();
  assert.equal(nodes.results.children.length,1);
  nodes.query.value='cairo';
  nodes.searchBtn.dispatch('click');
  assert.equal(nodes.results.children.length,1);
  nodes.query.value='absent';
  nodes.searchBtn.dispatch('click');
  assert.equal(nodes.results.children.length,0);
});

test('Arabic search ignores diacritics and common alef/ya variants',async()=>{
  const {nodes}=setup([page(1,[item('eg-search-2026','أخبار الرِياض ومُنتدى الهدى','مصر')],false)]);
  await flush();
  nodes.query.value='اخبار الرياض';
  nodes.searchBtn.dispatch('click');
  assert.equal(nodes.results.children.length,1);
  nodes.query.value='الهدي';
  nodes.searchBtn.dispatch('click');
  assert.equal(nodes.results.children.length,1);
});

test('external archive interface offers all 22 Arab countries without requiring published records',async()=>{
 const {nodes}=setup([page(1,[],false)]);
 await flush();
 assert.equal(nodes.countries.children.length,22);
 const countries=nodes.countries.children.map(b=>b.textContent);
 for(const name of ['السعودية','مصر','السودان','الصومال','جيبوتي','جزر القمر'])assert.ok(countries.includes(name));
 assert.match(nodes.status.textContent,/لا توجد نتائج/);
});

test('cross-page archive dedup preserves canonical details for six countries and rejects altered destinations',async()=>{
 const entries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 const originals=entries.map(([code,name],i)=>{
  const row=item(code+'-search-2026-11-26','حصيلة '+name,name);
  return i%2===0?{...row,link:row.link+'/'}:row;
 });
 const duplicates=originals.map(row=>({...row,link:row.link.endsWith('/')?row.link.slice(0,-1):row.link+'/'}));
 const malformed=originals.flatMap(row=>['?redirect=external','#section','/nested','/../other','%2f','\n'].map(suffix=>({...row,link:row.link.replace(/\/$/u,'')+suffix})));
 const {nodes,requests}=setup([page(1,[...malformed,...originals],true),page(2,duplicates,false)]);
 await flush();
 assert.deepEqual(nodes.results.children.map(n=>n.href),originals.map(row=>row.link));
 await nodes.loadMore.dispatch('click');
 await flush();
 assert.deepEqual(nodes.results.children.map(n=>n.href),originals.map(row=>row.link));
 assert.equal(requests.length,2);
 for(const row of originals){
  nodes.countrySelect.value=row.country;
  nodes.countrySelect.dispatch('change');
  assert.equal(nodes.results.children.length,1,row.country);
  assert.equal(nodes.results.children[0].href,row.link);
 }
});

test('country and kind must match archive routes before cross-page deduplication',async()=>{
 const entries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 const valid=entries.flatMap(([code,name])=>[
  item(code+'-search-2026-11-26','بحث '+name,name),
  item(code+'-music-2026-11-26','موسيقى '+name,name,'music'),
  item(code+'-week-2026-11-26','أسبوع '+name,name,'weekly')
 ]);
 const topic=item('topic-ab12','ملف موضوع','','topic');
 const invalid=valid.flatMap(row=>[
  {...row,country:row.country==='مصر'?'السودان':'مصر'},
  {...row,kind:row.kind==='search'?'weekly':'search'},
  {...row,title:' '}
 ]);
 invalid.push({...topic,country:'جيبوتي'}, {...topic,kind:'search'},item('xx-search-2026-11-26','عنوان','مصر'));
 const {nodes,requests}=setup([page(1,invalid,true),page(2,[...valid,topic],false)]);
 await flush();
 assert.equal(nodes.results.children.length,0);
 await nodes.loadMore.dispatch('click');
 await flush();
 assert.equal(requests.length,2);
 assert.deepEqual(nodes.results.children.map(n=>n.href),[...valid,topic].map(row=>row.link));
 for(const [,name] of entries){
  nodes.countrySelect.value=name;
  nodes.countrySelect.dispatch('change');
  assert.deepEqual(nodes.results.children.map(n=>n.href),valid.filter(row=>row.country===name).map(row=>row.link));
  nodes.typeSelect.value='weekly';
  nodes.typeSelect.dispatch('change');
  assert.equal(nodes.results.children.length,1);
  assert.match(nodes.results.children[0].href,/-week-/);
  nodes.typeSelect.value='';
  nodes.typeSelect.dispatch('change');
 }
});

test('archive search and card metadata use validated country even when title omits it',async()=>{
 const entries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 const rows=entries.map(([code,name])=>item(code+'-search-2026-11-26','حصيلة اليوم',name));
 const topic=item('topic-ab12','ملف موضوع','','topic');
 const {nodes,requests}=setup([page(1,[...rows,topic],false)]);
 await flush();
 assert.equal(nodes.results.children[6].children[0].textContent,'ملف موضوع');
 for(const row of rows){
  nodes.query.value=row.country;
  nodes.searchBtn.dispatch('click');
  assert.equal(nodes.results.children.length,1,row.country);
  assert.equal(nodes.results.children[0].href,row.link);
  assert.equal(nodes.results.children[0].children[0].textContent,row.country+' · كلمات البحث');
  assert.equal(nodes.results.children[0].children[1].textContent,row.title);
 }
 nodes.query.value='مصر';
 nodes.countrySelect.value='السعودية';
 nodes.countrySelect.dispatch('change');
 assert.equal(nodes.results.children.length,0);
 nodes.countrySelect.value='';
 nodes.countrySelect.dispatch('change');
 assert.equal(nodes.results.children[0].href,rows[1].link);
 nodes.typeSelect.value='weekly';
 nodes.typeSelect.dispatch('change');
 assert.equal(nodes.results.children.length,0);
 assert.equal(requests.length,1);
});

test('combined title and country search tolerates reordered words and whitespace without new requests',async()=>{
 const entries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 // The proxy strips bidi controls from titles; search still tolerates all copied controls.
 const rows=entries.map(([code,name])=>item(code+'-search-2026-11-26','أخبار الرياضة',name));
 const other=item('km-week-2026-11-26','حصيلة الاقتصاد','جزر القمر','weekly');
 const topic=item('topic-ab12','أخبار الرياضة','','topic');
 const {nodes,requests}=setup([page(1,[...rows,other,topic],false)]);
 await flush();
 for(const row of rows){
  for(const query of [row.country+'   اخبار الرياضة','الرياضة '+row.country+' اخبار']){
   nodes.query.value=query;
   nodes.searchBtn.dispatch('click');
   assert.deepEqual(nodes.results.children.map(n=>n.href),[row.link]);
  }
 }
 nodes.query.value='جزر القمر الرياضة مجهول';
 nodes.searchBtn.dispatch('click');
 assert.equal(nodes.results.children.length,0);
 nodes.query.value='جزر القمر الرياضة';
 nodes.typeSelect.value='weekly';
 nodes.typeSelect.dispatch('change');
 assert.equal(nodes.results.children.length,0);
 nodes.typeSelect.value='';
 nodes.countrySelect.value='مصر';
 nodes.countrySelect.dispatch('change');
 assert.equal(nodes.results.children.length,0);
 nodes.countrySelect.value='';
 nodes.countrySelect.dispatch('change');
 assert.equal(nodes.results.children[0].href,rows[5].link);
 nodes.query.value='   ';
 nodes.searchBtn.dispatch('click');
 assert.equal(nodes.results.children.length,8);
 assert.equal(requests.length,1);
});

test('natural country and category queries tolerate punctuation without fetching again',async()=>{
 const entries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 const rows=entries.flatMap(([code,name])=>[
  item(code+'-search-2026-11-26','أخبار الرياضة',name),
  item(code+'-week-2026-11-26','أخبار الرياضة',name,'weekly')
 ]);
 const topic=item('topic-ab12','في المدينة','','topic');
 const {nodes,requests}=setup([page(1,[...rows,topic],false)]);
 await flush();
 for(const [code,name] of entries){
  for(const query of ['أخبار الرياضة في '+name+'؟','كلمات البحث، '+name+' - الرياضة']){
   nodes.query.value=query;
   nodes.searchBtn.dispatch('click');
   const expected=rows.filter(row=>row.country===name&&(query.includes('البحث')?row.kind==='search':true));
   assert.deepEqual(nodes.results.children.map(n=>n.href),expected.map(row=>row.link));
  }
  nodes.query.value='حصيلة أسبوعية: '+name;
  nodes.searchBtn.dispatch('click');
  assert.deepEqual(nodes.results.children.map(n=>n.href),[rows.find(row=>row.country===name&&row.kind==='weekly').link]);
 }
 nodes.query.value='في';
 nodes.searchBtn.dispatch('click');
 assert.deepEqual(nodes.results.children.map(n=>n.href),[topic.link]);
 nodes.query.value='كلمات البحث، السودان';
 nodes.typeSelect.value='weekly';
 nodes.typeSelect.dispatch('change');
 assert.equal(nodes.results.children.length,0);
 assert.equal(requests.length,1);
});

test('copied Arabic titles and country queries ignore invisible Unicode formatting only for search',async()=>{
 const entries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 const controls=['\u061c','\u200c','\u200d','\u200e','\u200f','\u202a','\u202b','\u202c','\u202d','\u202e','\u2066','\u2067','\u2068','\u2069','\ufeff','\u200b','\u00ad','\u2060','\u034f','\u180e','\ufe0f','\u2063','\u{e0001}'];
 const rows=entries.map(([code,name])=>item(code+'-search-2026-11-26','أخ\u200dبار الر\u200cياضة',name));
 const {nodes,requests}=setup([page(1,rows,false)]);
 await flush();
 for(const row of rows){
  for(const mark of controls){
   nodes.query.value='اخبار الرياضة '+row.country.slice(0,1)+mark+row.country.slice(1);
   nodes.searchBtn.dispatch('click');
   assert.deepEqual(nodes.results.children.map(n=>n.href),[row.link]);
   assert.equal(nodes.results.children[0].children[1].textContent,row.title);
  }
 }
 nodes.query.value='اخبار الرياضة السودان مجهول';
 nodes.searchBtn.dispatch('click');
 assert.equal(nodes.results.children.length,0);
 nodes.query.value='اخبار الرياضة السودان';
 nodes.countrySelect.value='مصر';
 nodes.countrySelect.dispatch('change');
 assert.equal(nodes.results.children.length,0);
 assert.equal(requests.length,1);
});

test('failed initial archive stays distinguishable from empty results until a manual retry succeeds',async()=>{
 const rows=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']].map(([code,name])=>item(code+'-search-2026-11-26','حصيلة اليوم',name));
 const pages=[null];
 const {nodes,requests}=setup(pages);
 await flush();
 for(const row of rows){
  nodes.countrySelect.value=row.country;
  nodes.countrySelect.dispatch('change');
  nodes.query.value='حصيلة';
  nodes.searchBtn.dispatch('click');
  assert.match(nodes.status.textContent,/تعذر تحميل أحدث/);
  assert.equal(nodes.results.children.length,0);
 }
 assert.equal(requests.length,1);
 assert.equal(nodes.loadMore.hidden,false);
 pages[0]=page(1,rows,false);
 await nodes.loadMore.dispatch('click');
 assert.equal(nodes.results.children[0].href,rows[5].link);
 assert.doesNotMatch(nodes.status.textContent,/تعذر تحميل/);
 assert.equal(nodes.loadMore.hidden,true);
 assert.deepEqual(requests,['/.netlify/functions/archive?page=1','/.netlify/functions/archive?page=1']);
});

test('malformed pagination flag does not advance or admit rows; filters retain retry status and original links',async()=>{
 const first=item('sd-search-2026-11-26','حصيلة اليوم','السودان');
 const second=item('so-search-2026-11-26','حصيلة اليوم','الصومال');
 const pages=[page(1,[first],true),page(2,[second],'false')];
 const {nodes,requests}=setup(pages);
 await flush();
 await nodes.loadMore.dispatch('click');
 assert.deepEqual(nodes.results.children.map(n=>n.href),[first.link]);
 nodes.query.value='السودان';
 nodes.searchBtn.dispatch('click');
 assert.match(nodes.status.textContent,/تعذر تحميل الدفعة التالية/);
 assert.equal(nodes.results.children[0].href,first.link);
 assert.equal(nodes.loadMore.hidden,false);
 assert.equal(requests.length,2);
 pages[1]=page(2,[second],false);
 await nodes.loadMore.dispatch('click');
 nodes.query.value='';
 nodes.searchBtn.dispatch('click');
 assert.deepEqual(nodes.results.children.map(n=>n.href),[first.link,second.link]);
 assert.doesNotMatch(nodes.status.textContent,/تعذر تحميل/);
 assert.equal(nodes.loadMore.hidden,true);
 assert.deepEqual(requests,['/.netlify/functions/archive?page=1','/.netlify/functions/archive?page=2','/.netlify/functions/archive?page=2']);
});

test('invalid or mismatched archive dates cannot reserve a detail link',async()=>{
 const entries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 const valid=entries.flatMap(([code,name])=>[['search','search'],['music','music'],['week','weekly']].map(([route,kind])=>({...item(code+'-'+route+'-2026-11-26','حصيلة '+name,name,kind),date:'2026-11-26'})));
 const invalid=valid.flatMap(row=>[undefined,null,123,{},'2026-02-30','2026-11-25','2026-11-26\n','2026-11-26T00:00:00Z'].map(date=>({...row,date})));
 const legacy=item('sd-search-2026','حصيلة سابقة','السودان');
 const topic=item('topic-ab12','ملف موضوع','','topic');
 const {nodes,requests}=setup([page(1,invalid.slice(0,100),true),page(2,invalid.slice(100),true),page(3,[...valid,legacy,topic],false)]);
 await flush();
 assert.equal(nodes.results.children.length,0);
 await nodes.loadMore.dispatch('click');
 assert.equal(nodes.results.children.length,0);
 await nodes.loadMore.dispatch('click');
 assert.deepEqual(nodes.results.children.map(n=>n.href),[...valid,legacy,topic].map(row=>row.link));
 assert.deepEqual(nodes.results.children.map(n=>n.children[2].textContent),[...valid,legacy,topic].map(row=>row.date));
 for(const [,name] of entries){nodes.countrySelect.value=name;nodes.countrySelect.dispatch('change');assert.deepEqual(nodes.results.children.map(n=>n.href),[...valid,legacy].filter(row=>row.country===name).map(row=>row.link));}
 assert.equal(requests.length,3);
});

test('invisible-only archive titles cannot reserve valid detail links',async()=>{
 const entries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 const rows=entries.map(([code,name])=>item(code+'-search-2026-11-26','أخ\u200dبار '+name,name));
 const invalid=rows.flatMap(row=>['\u200b','\u200f\u202e','\u064b\u0651','\u00ad\u2060','\u0000',' \u0640 \u200d ','\ufe0f'].map(title=>({...row,title})));
 const {nodes,requests}=setup([page(1,invalid,true),page(2,rows,false)]);
 await flush();
 assert.equal(nodes.results.children.length,0);
 await nodes.loadMore.dispatch('click');
 assert.deepEqual(nodes.results.children.map(n=>n.href),rows.map(row=>row.link));
 assert.deepEqual(nodes.results.children.map(n=>n.children[1].textContent),rows.map(row=>row.title));
 assert.equal(requests.length,2);
});


test('search folds French accents and common Arabic spelling without modifying six country links',async()=>{
 const fixtures=[["sa","السعودية","أخبار الصناعة","اخبار الصناعه"],["eg","مصر","خريطة القاهرة","خريطه القاهره"],["sd","السودان","حركة الأسواق","حركه الاسواق"],["so","الصومال","Cafés et économie","cafes economie"],["dj","جيبوتي","Économie et coopération","economie cooperation"],["km","جزر القمر","Cœur et région","coeur region"]];
 const rows=fixtures.map(([code,country,title])=>item(code+'-search-2026-11-26',title,country));
 const {nodes,requests}=setup([page(1,rows,false)]);
 await flush();
 for(const [index,[code,country,title,query]] of fixtures.entries()){
  nodes.query.value=query+' '+country;
  nodes.searchBtn.dispatch('click');
  assert.deepEqual(nodes.results.children.map(n=>n.href),[rows[index].link],code);
  assert.equal(nodes.results.children[0].children[1].textContent,title,code);
 }
 nodes.query.value='نتيجة غير موجودة';
 nodes.searchBtn.dispatch('click');
 assert.equal(nodes.results.children.length,0);
 assert.deepEqual(requests,['/.netlify/functions/archive?page=1']);
});


test('oversized archive page cannot advance the cursor or replace six country results',async()=>{
 const entries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 const rows=entries.map(([code,name])=>item(code+'-search-2026-11-26','حصيلة '+name,name));
 const next=Array.from({length:100},(_,i)=>{
  const [code,name]=entries[i%entries.length];
  return item(code+'-week-2026-11-25-'+i,'حصيلة أسبوعية '+name,name,'weekly');
 });
 const overflow=item('sd-music-2026-11-25','حصيلة إضافية','السودان','music');
 const pages=[page(1,rows,true),page(2,[...next,overflow],false)];
 const {nodes,requests}=setup(pages);
 await flush();
 await nodes.loadMore.dispatch('click');
 assert.deepEqual(nodes.results.children.map(n=>n.href),rows.map(row=>row.link));
 assert.match(nodes.status.textContent,/تعذر تحميل الدفعة التالية/);
 assert.equal(nodes.loadMore.hidden,false);
 assert.equal(nodes.loadMore.disabled,false);
 pages[1]=page(2,next,false);
 await nodes.loadMore.dispatch('click');
 assert.deepEqual(nodes.results.children.map(n=>n.href),[...rows,...next].map(row=>row.link));
 assert.doesNotMatch(nodes.status.textContent,/تعذر تحميل/);
 assert.equal(nodes.loadMore.hidden,true);
 assert.deepEqual(requests,['/.netlify/functions/archive?page=1','/.netlify/functions/archive?page=2','/.netlify/functions/archive?page=2']);
});

test('oversized and control-bearing titles cannot reserve six country detail links',async()=>{
 const entries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 const rows=entries.map(([code,name])=>item(code+'-search-2026-11-26','أ'.repeat(239)+'🌍',name));
 const invalid=rows.flatMap(row=>['أ'.repeat(241),'🌍'.repeat(241),'حصيلة\u0000 اليوم','حصيلة\u001b اليوم','حصيلة\u0085 اليوم','حصيلة\nاليوم'].map(title=>({...row,title})));
 const {nodes,requests}=setup([page(1,invalid,true),page(2,rows,false)]);
 await flush();
 assert.equal(nodes.results.children.length,0);
 await nodes.loadMore.dispatch('click');
 assert.deepEqual(nodes.results.children.map(n=>n.href),rows.map(row=>row.link));
 assert.deepEqual(nodes.results.children.map(n=>n.children[1].textContent),rows.map(row=>row.title));
 for(const row of rows){
  nodes.countrySelect.value=row.country;
  nodes.countrySelect.dispatch('change');
  assert.deepEqual(nodes.results.children.map(n=>n.href),[row.link]);
 }
 assert.equal(requests.length,2);
});

test('bidi-control titles cannot reserve six country links or change displayed direction',async()=>{
 const entries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 const rows=entries.map(([code,name])=>item(code+'-search-2026-11-26','حصيلة '+name+' 👩‍💻',name));
 const controls=['\u061c','\u200e','\u200f','\u202a','\u202b','\u202c','\u202d','\u202e','\u2066','\u2067','\u2068','\u2069'];
 const invalid=rows.flatMap(row=>controls.map(control=>({...row,title:'حصيلة '+control+row.country})));
 const {nodes,requests}=setup([page(1,invalid,true),page(2,rows,false)]);
 await flush();
 assert.equal(nodes.results.children.length,0);
 await nodes.loadMore.dispatch('click');
 assert.deepEqual(nodes.results.children.map(n=>n.href),rows.map(row=>row.link));
 assert.deepEqual(nodes.results.children.map(n=>n.children[1].textContent),rows.map(row=>row.title));
 for(const row of rows){
  nodes.countrySelect.value=row.country;
  nodes.countrySelect.dispatch('change');
  assert.deepEqual(nodes.results.children.map(n=>n.href),[row.link]);
 }
 assert.equal(requests.length,2);
});


test('search matches extended Arabic combining marks without changing six-country detail links',async()=>{
 const entries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 const marks=['\u0610','\u061a','\u06d6','\u06e7','\u06ed','\u08d4','\u08e3','\u08f0'];
 const rows=entries.flatMap(([code,country])=>marks.map((mark,i)=>
  item(code+'-search-2026-11-26-'+i,'أخ'+mark+'بار الأسواق '+country,country)));
 const {nodes,requests}=setup([page(1,rows,false)]);
 await flush();
 for(const [,country] of entries){
  nodes.query.value='اخبار الاسواق '+country;
  nodes.searchBtn.dispatch('click');
  const expected=rows.filter(row=>row.country===country);
  assert.deepEqual(nodes.results.children.map(n=>n.href),expected.map(row=>row.link));
  assert.deepEqual(nodes.results.children.map(n=>n.children[1].textContent),expected.map(row=>row.title));
 }
 assert.deepEqual(requests,['/.netlify/functions/archive?page=1']);
});


test('Arabic hamza-carrier search preserves six-country original headlines and links',async()=>{
 const entries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 const words=[['مؤشرات','موشرات'],['مسؤولية','مسووليه'],['رئيس','رييس'],['هيئة','هييه'],['مِئَة','ميه']];
 const rows=entries.flatMap(([code,name])=>words.map(([word],i)=>item(code+'-search-2026-11-26-'+i,word+' '+name,name)));
 const {nodes,requests}=setup([page(1,rows,false)]);
 await flush();
 for(const [,name] of entries){
  for(const [word,query] of words){
   const expected=rows.find(row=>row.title===word+' '+name);
   nodes.query.value=query+' '+name;
   nodes.searchBtn.dispatch('click');
   assert.deepEqual(nodes.results.children.map(n=>n.href),[expected.link]);
   assert.deepEqual(nodes.results.children.map(n=>n.children[1].textContent),[expected.title]);
  }
 }
 assert.deepEqual(requests,['/.netlify/functions/archive?page=1']);
});


test('archive-day search matches exact dates in three digit scripts across six countries',async()=>{
 const entries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 const rows=entries.flatMap(([code,name])=>['2026-11-26','2026-11-25'].map(date=>
  item(code+'-search-'+date,'حصيلة الأسواق ٢٠٢٦',name)));
 const {nodes,requests}=setup([page(1,rows,false)]);
 await flush();
 for(const [,name] of entries){
  for(const date of ['2026-11-26','٢٠٢٦/١١/٢٦','۲۰۲۶-۱۱-۲۶']){
   const expected=rows.find(row=>row.country===name&&row.date==='2026-11-26');
   nodes.query.value=name+' '+date;
   nodes.searchBtn.dispatch('click');
   assert.deepEqual(nodes.results.children.map(n=>n.href),[expected.link]);
   assert.deepEqual(nodes.results.children.map(n=>n.children[1].textContent),[expected.title]);
  }
 }
 for(const query of ['2026-11-31','٢٠٢٦/١١/٢٧','2026-11-25 2026-11-26']){
  nodes.query.value=query;
  nodes.searchBtn.dispatch('click');
  assert.equal(nodes.results.children.length,0);
 }
 nodes.query.value='2026';
 nodes.searchBtn.dispatch('click');
 assert.deepEqual(nodes.results.children.map(n=>n.href),rows.map(row=>row.link));
 assert.deepEqual(requests,['/.netlify/functions/archive?page=1']);
});

test('multilingual country aliases preserve original internal archive links without additional requests',async()=>{
 const entries=[
  ['sa','السعودية',['Saudi Arabia','Arabie saoudite']],
  ['eg','مصر',['Egypt','Égypte']],
  ['sd','السودان',['Sudan','Soudan']],
  ['so','الصومال',['Somalia','Somalie','صوماليا','سوماليا']],
  ['dj','جيبوتي',['Djibouti','دجيبوتي','جیبوتی']],
  ['km','جزر القمر',['Comoros','Comores','جزرالقمر']]
 ] as const;
 const rows=entries.map(([code,name])=>{
  const row=item(code+'-search-2026-11-26','مؤشرات الأسواق',name);
  return {...row,link:row.link+'/'};
 });
 const {nodes,requests}=setup([page(1,rows,false)]);
 await flush();
 for(const [i,[,name,aliases]] of entries.entries()){
  for(const query of [name,...aliases,...aliases.map(alias=>alias+' مؤشرات الأسواق')]){
   nodes.query.value=query;
   nodes.searchBtn.dispatch('click');
   assert.deepEqual(nodes.results.children.map(n=>n.href),[rows[i].link],query);
   assert.equal(nodes.results.children[0].children[1].textContent,rows[i].title);
  }
 }
 nodes.query.value='Somalia';
 nodes.countrySelect.value='مصر';
 nodes.countrySelect.dispatch('change');
 assert.equal(nodes.results.children.length,0);
 nodes.countrySelect.value='';
 nodes.countrySelect.dispatch('change');
 nodes.query.value='sud';
 nodes.searchBtn.dispatch('click');
 assert.equal(nodes.results.children.length,0);
 assert.equal(requests.length,1);
});

test('country aliases cover every remaining Arab country without modifying detail URLs',async()=>{
 const entries=[["ae","الإمارات",["United Arab Emirates","Émirats arabes unis","UAE","Emirates","Émirats"]],["kw","الكويت",["Kuwait","Koweït"]],["qa","قطر",["Qatar"]],["bh","البحرين",["Bahrain","Bahreïn"]],["om","عُمان",["Oman"]],["jo","الأردن",["Jordan","Jordanie"]],["lb","لبنان",["Lebanon","Liban"]],["iq","العراق",["Iraq","Irak"]],["sy","سوريا",["Syria","Syrie","سورية"]],["ps","فلسطين",["Palestine"]],["ye","اليمن",["Yemen","Yémen"]],["ly","ليبيا",["Libya","Libye"]],["tn","تونس",["Tunisia","Tunisie"]],["dz","الجزائر",["Algeria","Algérie"]],["ma","المغرب",["Morocco","Maroc"]],["mr","موريتانيا",["Mauritania","Mauritanie"]]] as const;
 const rows=entries.map(([code,name])=>({...item(code+'-search-2026-11-26','مؤشرات الأسواق',name),link:'https://arabiatrend.com/trend-archive/'+code+'-search-2026-11-26/'}));
 const {nodes,requests}=setup([page(1,rows,false)]);
 await flush();
 for(const [i,[,name,aliases]] of entries.entries()){
  for(const query of [name,...aliases,...aliases.map(alias=>alias+' مؤشرات الأسواق')]){
   nodes.query.value=query;
   nodes.searchBtn.dispatch('click');
   assert.deepEqual(nodes.results.children.map(n=>n.href),[rows[i].link],query);
   assert.equal(nodes.results.children[0].children[1].textContent,rows[i].title);
  }
 }
 for(const query of ['united','arab','unis']){
  nodes.query.value=query;
  nodes.searchBtn.dispatch('click');
  assert.equal(nodes.results.children.length,0,query);
 }
 assert.equal(requests.length,1);
});

test('archive day-first dates resolve exact internal detail links for six countries without extra requests',async()=>{
 const entries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 const rows=entries.flatMap(([code,name])=>['2026-11-26','2026-11-25','2026-01-03'].map(date=>
  item(code+'-search-'+date,'حصيلة الأسواق',name)));
 const {nodes,requests}=setup([page(1,rows,false)]);
 await flush();
 for(const [,name] of entries){
  for(const [query,date] of [['26/11/2026','2026-11-26'],['٢٦-١١-٢٠٢٦','2026-11-26'],['۲۶/۱۱/۲۰۲۶','2026-11-26'],['3/1/2026','2026-01-03'],['03-01-2026','2026-01-03'],['2026-11-26','2026-11-26']]){
   const expected=rows.find(row=>row.country===name&&row.date===date);
   nodes.query.value='حصيلة '+name+' '+query;
   nodes.searchBtn.dispatch('click');
   assert.deepEqual(nodes.results.children.map(n=>n.href),[expected.link],query+' '+name);
   assert.equal(nodes.results.children[0].children[1].textContent,expected.title);
  }
 }
 for(const query of ['31/11/2026','26/11/2026 2026-11-25','26/11-2026']){
  nodes.query.value=query;
  nodes.searchBtn.dispatch('click');
  assert.equal(nodes.results.children.length,0,query);
 }
 assert.deepEqual(requests,['/.netlify/functions/archive?page=1']);
});

test('date-only natural Arabic queries ignore the connector without losing literal searches',async()=>{
 const entries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 const rows=entries.flatMap(([code,name])=>['2026-11-26','2026-11-25'].map(date=>
  item(code+'-search-'+date,'حصيلة الأسواق',name)));
 const topic={...item('topic-ab12','في المدينة','','topic'),date:'2026-11-25'};
 const {nodes,requests}=setup([page(1,[...rows,topic],false)]);
 await flush();
 const search=(query,expected)=>{
  nodes.query.value=query;
  nodes.searchBtn.dispatch('click');
  assert.deepEqual(nodes.results.children.map(n=>n.href),expected,query);
 };
 const dayLinks=rows.filter(row=>row.date==='2026-11-26').map(row=>row.link);
 for(const query of ['في 26/11/2026','في ٢٦-١١-٢٠٢٦','في ۲۶/۱۱/۲۰۲۶','في 2026-11-26','26/11/2026 في','26/11/2026']){
  search(query,dayLinks);
 }
 for(const [,name] of entries){
  search(name+' في 26/11/2026',rows.filter(row=>row.country===name&&row.date==='2026-11-26').map(row=>row.link));
 }
 search('في',[topic.link]);
 search('في 26/11/2026 25/11/2026',[]);
 search('في في',[topic.link]);
 assert.deepEqual(requests,['/.netlify/functions/archive?page=1']);
});


test('malformed complete archive dates cannot reserve or display misleading country links',async()=>{
 const countries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 const bad=countries.flatMap(([c,name])=>['2026-1-09','2026-11-9','2026-011-09','2026-11-009-2'].map(s=>item(c+'-search-'+s,'حصيلة '+name,name)));
 const good=countries.flatMap(([c,name])=>['2026-11-09-local-update','2026-11','legacy'].map(s=>item(c+'-search-'+s,'حصيلة '+name,name)));
 const {nodes,requests}=setup([page(1,[...bad,...good],false)]);
 await flush();
 assert.deepEqual(nodes.results.children.map(x=>x.href),good.map(x=>x.link));
 assert.deepEqual(requests,['/.netlify/functions/archive?page=1']);
});

test('official country names match the six priority countries without generic aliases or new requests',async()=>{
 const entries=[["sa","السعودية",["Kingdom of Saudi Arabia","Royaume d’Arabie saoudite","المملكة العربية السعودية"]],["eg","مصر",["Arab Republic of Egypt","République arabe d’Égypte","جمهورية مصر العربية"]],["sd","السودان",["Republic of the Sudan","République du Soudan","جمهورية السودان"]],["so","الصومال",["Federal Republic of Somalia","République fédérale de Somalie","جمهورية الصومال الفيدرالية"]],["dj","جيبوتي",["Republic of Djibouti","République de Djibouti","جمهورية جيبوتي"]],["km","جزر القمر",["Union of the Comoros","Union des Comores","اتحاد جزر القمر"]]];
 const rows=entries.map(([code,name])=>item(code+'-search-2026-11-26','مؤشرات الأسواق',name));
 const {nodes,requests}=setup([page(1,rows,false)]);
 await flush();
 for(const [i,[,name,aliases]] of entries.entries()){
  for(const alias of aliases){
   for(const query of [alias,alias+' مؤشرات الأسواق',alias+' في 26/11/2026']){
    nodes.query.value=query;
    nodes.searchBtn.dispatch('click');
    assert.deepEqual(nodes.results.children.map(n=>n.href),[rows[i].link],query);
   }
  }
 }
 for(const query of ['republic','union','kingdom','république','جمهورية','اتحاد','المملكة','federal']){
  nodes.query.value=query;
  nodes.searchBtn.dispatch('click');
  assert.equal(nodes.results.children.length,0,query);
 }
 nodes.query.value='Union des Comores';
 nodes.countrySelect.value='مصر';
 nodes.countrySelect.dispatch('change');
 assert.equal(nodes.results.children.length,0);
 assert.deepEqual(requests,['/.netlify/functions/archive?page=1']);
});

test('year-first dates with unpadded month and day resolve actual archive dates rather than title numbers',async()=>{
 const entries=[['sa','السعودية'],['eg','مصر'],['sd','السودان'],['so','الصومال'],['dj','جيبوتي'],['km','جزر القمر']];
 const rows=entries.flatMap(([code,name])=>['2026-01-03','2026-01-04','2026-11-26'].map(date=>
  item(code+'-search-'+date,date==='2026-01-04'?'حصيلة 2026 1 3':'حصيلة الأسواق',name)));
 const {nodes,requests}=setup([page(1,rows,false)]);
 await flush();
 const search=(query,expected)=>{
  nodes.query.value=query;
  nodes.searchBtn.dispatch('click');
  assert.deepEqual(nodes.results.children.map(n=>n.href),expected,query);
 };
 for(const [,name] of entries){
  const expected=rows.filter(row=>row.country===name&&row.date==='2026-01-03').map(row=>row.link);
  for(const query of ['2026/1/3','2026-1-3','٢٠٢٦/١/٣','۲۰۲۶-۱-۳','2026/01/3','2026-1-03','2026-01-03','3/1/2026'])search(name+' '+query,expected);
  search(name+' 2026-11-26',rows.filter(row=>row.country===name&&row.date==='2026-11-26').map(row=>row.link));
  search(name+' 2026-1-32',[]);
 }
 search('2026/1/3 2026/1/4',[]);
 assert.deepEqual(requests,['/.netlify/functions/archive?page=1']);
});
