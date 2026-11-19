import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const plugin=readFileSync(new URL('../atn-lightview.php',import.meta.url),'utf8');
const script=plugin.match(/<script id="atn-title-internal-routing">([\s\S]*?)<\/script>/)?.[1];
if(!script)throw new Error('Title routing script was not found');

function setup(){
 const handlers=new Map();
 const imageAnchor={href:'https://www.dailymotion.com/video/x91a1',closest(query){return query==='a[href]'?this:null}};
 const img={closest(query){return query==='a[href]'?imageAnchor:null}};
 const titleAnchor={
  href:'https://www.dailymotion.com/video/x91a1',
  attrs:{},
  setAttribute(k,v){this.attrs[k]=v;},
  getAttribute(k){return this.attrs[k]||null;}
 };
 const card={
  tagName:'DIV',parentElement:{tagName:'MAIN'},
  textContent:'لبنان الفيديوهات الرائجة مسلسل النبي يوسف حلقة 11 آخر رصد 18-11-2026 تفاصيل الرصد متابعة الموضوع',
  innerText:'لبنان الفيديوهات الرائجة مسلسل النبي يوسف حلقة 11 آخر رصد 18-11-2026 تفاصيل الرصد متابعة الموضوع',
  querySelectorAll(q){
   if(q==='h3')return [heading];
   if(q==='a[href] img')return [img];
   return [];
  }
 };
 const heading={
  tagName:'H3',parentElement:card,textContent:'مسلسل النبي يوسف حلقة 11',attrs:{},
  style:{},hasAttribute(n){return Object.hasOwn(this.attrs,n);},
  setAttribute(n,v){this.attrs[n]=v;},
  querySelector(q){return q==='a[href]'?titleAnchor:null;},
  closest(q){return q==='h3'?this:null;}
 };
 const destinations=[];
 const document={
  readyState:'complete',
  querySelectorAll(q){return q==='h3'?[heading]:[];},
  addEventListener(name,handler,capture){handlers.set(name,{handler,capture});}
 };
 const location={hostname:'arabiatrend.com',origin:'https://arabiatrend.com',href:'https://arabiatrend.com/arab-trends-now',assign(url){destinations.push(url)}};
 runInNewContext(script,{document,window:{location,addEventListener(){}},location,URL,Set,Array,String});
 return {heading,card,titleAnchor,imageAnchor,handlers,destinations};
}

test('topic heading becomes an internal link while media thumbnail stays external',()=>{
 const {titleAnchor,imageAnchor}=setup();
 assert.match(titleAnchor.href,/^https:\/\/arabiatrend\.com\/trend-detail\//);
 assert.ok(titleAnchor.href.includes('atn_title='));
 assert.equal(imageAnchor.href,'https://www.dailymotion.com/video/x91a1');
 assert.equal(titleAnchor.attrs['data-atn-source-href'],imageAnchor.href);
});

test('title click navigates internally; thumbnail click remains untouched',()=>{
 const {heading,handlers,destinations,imageAnchor}=setup();
 const click=handlers.get('click');
 assert.equal(click?.capture,true);
 let prevented=0,stopped=0;
 click.handler({target:heading,type:'click',preventDefault(){prevented++;},stopImmediatePropagation(){stopped++;}});
 assert.equal(destinations.length,1);
 assert.ok(destinations[0].startsWith('https://arabiatrend.com/trend-detail/'));
 assert.equal(prevented,1);
 assert.equal(stopped,1);
 click.handler({target:{closest(){return null;}},type:'click',preventDefault(){throw new Error('thumbnail event must not be prevented');}});
 assert.equal(destinations.length,1);
 assert.equal(imageAnchor.href,'https://www.dailymotion.com/video/x91a1');
});

test('internal page markup exists with noindex SEO protection',()=>{
 assert.match(plugin,/add_shortcode\('atn_trend_detail'/);
 assert.match(plugin,/rank_math\/frontend\/robots/);
 assert.match(plugin,/is_page\(86386\)/);
});
