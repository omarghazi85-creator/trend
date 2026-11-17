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
  link:'https://arabiatrend.com/trend-archive/'+slug,title,country,kind,date:'2026-11-16'
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
  const {nodes}=setup([page(1,[item('eg-search','أخبار الرِياض ومُنتدى الهدى','مصر')],false)]);
  await flush();
  nodes.query.value='اخبار الرياض';
  nodes.searchBtn.dispatch('click');
  assert.equal(nodes.results.children.length,1);
  nodes.query.value='الهدي';
  nodes.searchBtn.dispatch('click');
  assert.equal(nodes.results.children.length,1);
});
