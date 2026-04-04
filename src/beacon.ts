/**
 * Client-side beacon script served as a JavaScript string.
 * Injected via page:fragments (trusted) or manually via <script> tag.
 *
 * Features:
 * - Honors DNT (Do Not Track)
 * - Sends pageview event on load via navigator.sendBeacon
 * - UTM parameter capture from URL query string
 * - Template/collection metadata from <meta> tags
 * - Custom events API: window.emAnalytics.track(name, props)
 * - Active attention time tracking (visible + focused, 60s inactivity timeout)
 * - Scroll depth milestones (25%, 50%, 75%, 100%) relative to content
 * - Smart read detection: scroll depth + attention time >= estimated read time
 * - Engaged view: 10s+ attention time with interaction
 * - Recirculation: detects internal link navigation (capture phase)
 * - Detects custom scroll containers
 * - No cookies, no localStorage, no fingerprinting
 *
 * Target: <2KB gzipped
 */
export function generateBeaconScript(trackUrl: string): string {
	return `(function(){
if(navigator.doNotTrack==="1")return;
var u="${trackUrl}";
var p=location.pathname;
var r=document.referrer;
var at=0,la=0,ia=0,sm=0,rd=0,eg=0,rc=0,sent=0,fc=1,ert=0,el=null;
function b(d){try{navigator.sendBeacon(u,JSON.stringify(d))}catch(e){}}
function gm(n){var m=document.querySelector('meta[name="'+n+'"]');return m?m.getAttribute("content")||"":""}
function gu(){var s=new URLSearchParams(location.search);return{us:s.get("utm_source")||"",um:s.get("utm_medium")||"",uc:s.get("utm_campaign")||"",ut:s.get("utm_term")||"",ux:s.get("utm_content")||""}}
var tpl=gm("em:template");
var col=gm("em:collection");
var utm=gu();
var pv={t:"pageview",p:p,r:r};
if(tpl)pv.tpl=tpl;
if(col)pv.col=col;
if(utm.us)pv.us=utm.us;
if(utm.um)pv.um=utm.um;
if(utm.uc)pv.uc=utm.uc;
if(utm.ut)pv.ut=utm.ut;
if(utm.ux)pv.ux=utm.ux;
b(pv);
function act(){la=Date.now();ia=1}
function findPost(){return document.querySelector(".article-content,.post-content,.entry-content,[role=article] .content,article .content,article main,.blog-post,article")}
function scrollParent(n){
while(n&&n!==document.body){
var s=getComputedStyle(n);
if(/(auto|scroll)/.test(s.overflow+s.overflowY))return n;
n=n.parentElement;
}
return null;
}
function setup(){
el=findPost();
if(el){ert=Math.max(5,Math.round(el.scrollHeight/600))}
else{ert=Math.max(10,Math.round((document.documentElement.scrollHeight-window.innerHeight)/400))}
var sp=el?scrollParent(el.parentElement):null;
if(sp){sp.addEventListener("scroll",onScroll,{passive:true});sp.addEventListener("scroll",act,{passive:true})}
}
if(document.readyState==="complete")setup();
else window.addEventListener("load",setup);
["mousemove","keypress","touchstart","scroll"].forEach(function(e){document.addEventListener(e,act,{passive:true})});
window.addEventListener("focus",function(){fc=1;act()});
window.addEventListener("blur",function(){fc=0});
function postPct(){
if(!el){var h=document.documentElement.scrollHeight-window.innerHeight;return h>0?window.scrollY/h:1}
var rc=el.getBoundingClientRect();
if(rc.height<=0)return 0;
if(rc.height<=window.innerHeight)return rc.top<window.innerHeight&&rc.bottom>0?1:0;
var scrolled=Math.max(0,window.innerHeight-rc.top);
return Math.min(1,Math.max(0,scrolled/rc.height));
}
function checkScroll(){
var pct=postPct();
if(pct>=0.25&&!(sm&1)){sm|=1;b({t:"scroll",p:p,d:25})}
if(pct>=0.5&&!(sm&2)){sm|=2;b({t:"scroll",p:p,d:50})}
if(pct>=0.75&&!(sm&4)){sm|=4;b({t:"scroll",p:p,d:75})}
if(pct>=0.97&&!(sm&8)){sm|=8;b({t:"scroll",p:p,d:100})}
act();
}
var st;
function onScroll(){clearTimeout(st);st=setTimeout(checkScroll,150)}
window.addEventListener("scroll",onScroll,{passive:true});
var iv=setInterval(function(){
if(!document.hidden&&fc&&(Date.now()-la<60000))at++;
if(at>=10&&ia&&!eg){eg=1;b({t:"engaged",p:p})}
if(sm&2&&ert>0&&at>=Math.max(5,Math.round(ert*0.3))&&!rd){rd=1;b({t:"read",p:p})}
},1000);
document.addEventListener("click",function(e){
var n=e.target;
while(n&&n!==document.body){
if(n.tagName==="A"&&n.hostname===location.hostname&&!rc){rc=1;b({t:"recirc",p:p});return}
n=n.parentElement;
}
},true);
document.addEventListener("submit",function(e){
var f=e.target;
if(!f||f.tagName!=="FORM")return;
var id=f.getAttribute("id")||f.getAttribute("name")||f.getAttribute("action")||p;
window.emAnalytics.track("form_submit",{form:id,method:(f.getAttribute("method")||"get").toLowerCase()});
},true);
function leave(){if(sent)return;sent=1;clearInterval(iv);if(at>0&&at<=1800)b({t:"ping",p:p,s:at})}
document.addEventListener("pagehide",leave);
window.addEventListener("beforeunload",leave);
window.emAnalytics={track:function(n,pr){
if(!n||typeof n!=="string")return;
var d={t:"custom",p:p,n:n.slice(0,100)};
if(pr&&typeof pr==="object"){try{d.pr=JSON.stringify(pr)}catch(e){}}
b(d);
}};
})();`;
}
