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
