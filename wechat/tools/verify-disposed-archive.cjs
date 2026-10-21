const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const {createItemListPage}=require('../miniprogram/utils/item-list-page'),{inScope,select}=require('../miniprogram/utils/collection'),{decorate}=require('../miniprogram/utils/view'),{avatarState}=require('../miniprogram/utils/profile');
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/disposed-archive-20261011'),scratch=path.resolve(__dirname,'../.qa-disposed');
const read=f=>fs.readFileSync(path.join(root,f),'utf8'),base=pathToFileURL(root).href;
function css(f){return read(f).replace(/@import\s+["']([^"']+)["'];/g,(_,s)=>css(path.posix.join(path.posix.dirname(f),s)))}
function markup(f){return read(f).replace(/<include src="([^"]+)"\s*\/>/g,(_,s)=>markup(path.posix.join(path.posix.dirname(f),s)))}
function html(f){return markup(f).replace(/<(view|block|image|input)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/\b(view|block|picker|scroll-view)(?=[\s>])/g,'div').replace(/\btext(?=[\s>])/g,'span').replace(/\bimage(?=[\s>])/g,'img')}
function styles(name){return (css('app.wxss')+'\n'+css('pages/'+name+'/index.wxss')).replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w-])image\b/g,'img').replace(/url\(\/assets\//g,'url('+base+'/assets/')}
const rows=[
 {id:1,name:'陪我旅行的相机',category:'数码',icon_type:'digital',status:'active',holding_days:365,daily_net_cost:'1.28'},
 {id:2,name:'周末的帆布包',category:'日用',icon_type:'daily',status:'idle',holding_days:128,daily_net_cost:'0.32'},
 {id:3,name:'旧时的拍立得',category:'数码',icon_type:'digital',status:'disposed',holding_days:730,daily_net_cost:'0.82',is_pinned:true},
 {id:4,name:'曾经的小书桌',category:'家居',icon_type:'home',status:'disposed',holding_days:126,daily_net_cost:'-0.16'},
 {id:5,name:'跑过四季的单车',category:'出行',icon_type:'mobility',status:'disposed',holding_days:400,daily_net_cost:null},
 {id:6,name:'一本慢慢读完的书',category:'阅读',icon_type:'books',status:'disposed',holding_days:50,daily_net_cost:'0.00'}
].map(decorate);
function data(name,patch={}){if(name==='me'){const user={username:'微信用户1',avatar_key:'cat'};return {user,...avatarState(user),loading:false,error:'',statsLoading:false,statsError:'',heldItems:'2',heldAmount:'1,280.00',accountDays:'128',statsCompatible:true,ageCompatible:true,...patch}}
 const items=inScope(rows,name==='disposed'?'disposed':'held');return {...createItemListPage(name==='disposed'?'disposed':'held').data,items,shown:select(items,'','',''),categories:['全部分类',...new Set(items.map(i=>i.category))],loading:false,...patch}}
const cases=[];for(const name of ['items','disposed','me'])for(const width of [320,390,430,768])cases.push({name,width,label:name+'-'+width});
for(const width of [320,390])cases.push({name:'disposed',width,font:1.3,label:'archive-large-font-'+width});
cases.push({name:'disposed',width:320,font:1.3,label:'archive-long-large',patch:{items:[rows[2]],shown:[{...rows[2],name:'保存每一段旅程回忆的超长名称物品'.repeat(3),dailyNet:'¥999999999.99',holding_days:10000}]}});
cases.push({name:'disposed',width:390,label:'archive-empty',patch:{items:[],shown:[]}});
cases.push({name:'disposed',width:390,label:'archive-photo-retry',patch:{photoStates:{3:'error'}}});
cases.push({name:'disposed',width:390,label:'archive-decor-fallback',patch:{decorError:true}});
for(const name of ['items','disposed'])cases.push({name,width:320,label:name+'-filter',patch:{filterOpen:true,draftCategories:['全部分类','数码','家居','出行','阅读']}});
(async()=>{fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});const file=path.join(scratch,'preview.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><body></body>');
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']});const checks=[];
 try{const page=await browser.newPage();await page.goto(pathToFileURL(file).href);const previous=fs.readFileSync(path.resolve(__dirname,'verify-white-secondary.cjs'),'utf8');await page.evaluate(previous.slice(previous.indexOf(' window.render='),previous.indexOf('\n })\n for(const width')));await require('./white-nav-preview.cjs')(page,root);
 for(const c of cases){await page.setViewportSize({width:c.width,height:844});await page.evaluate(args=>render(...args),[html('pages/'+c.name+'/index.wxml'),styles(c.name),data(c.name,c.patch),base]);
 await page.evaluate(({base,name,filter})=>{const bar=document.createElement('div');bar.className='native-bar';bar.textContent=name==='me'?'我的':name==='disposed'?'‹　　　　 已处置档案':'猫爪物帐';bar.style.justifyContent='center';document.body.prepend(bar);if(name!=='disposed'&&!filter)window.mountWhiteNav(name==='me'?1:0,base)}, {base,name:c.name,filter:!!c.patch?.filterOpen});
 await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))));
 if(c.font)await page.evaluate(scale=>{const targets=[...document.querySelectorAll('.page div,.page span,.page button')].map(n=>[n,getComputedStyle(n).fontSize]);for(const[n,size]of targets)n.style.fontSize=parseFloat(size)*scale+'px'},c.font);
 const check=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,pageWidth:document.querySelector('.page').getBoundingClientRect().width,failedImages:[...document.images].filter(i=>!i.naturalWidth).length,cards:[...document.querySelectorAll('.item-card')].map(n=>({id:n.id,height:n.getBoundingClientRect().height,overflow:n.scrollWidth>n.clientWidth+1})),statusColor:document.querySelector('.status-disposed')?getComputedStyle(document.querySelector('.status-disposed')).backgroundColor:null,archiveReturn:!!document.querySelector('.archive-return'),sheet:document.querySelector('.sheet-apply')?.getBoundingClientRect().toJSON(),menu:[...document.querySelectorAll('#menu-discover,#menu-disposed,#menu-trash')].map(n=>n.id),brokenFrame:getComputedStyle(document.querySelector('.corner-tl')||document.body).backgroundImage}));checks.push({label:c.label,...check});
 if(check.overflow||check.pageWidth>480||check.failedImages||check.cards.some(i=>i.overflow)||check.sheet?.bottom>844)throw Error(JSON.stringify(checks.at(-1)));
 if(c.name==='disposed'&&check.statusColor&&check.statusColor!=='rgb(234, 240, 246)')throw Error('Archive tag incorrect');
 if(c.name==='me'&&check.menu.join(',')!=='menu-discover,menu-disposed,menu-trash')throw Error('Menu order');
 if(c.label==='archive-empty'&&!check.archiveReturn)throw Error('Missing empty action');
 await page.screenshot({path:path.join(out,c.label+'.png'),fullPage:true});
 if(c.label==='disposed-390'){await page.screenshot({path:path.join(out,'archive-first-screen.png')});await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await page.screenshot({path:path.join(out,'archive-scrolled.png')})}
 if(c.label==='items-390')await page.screenshot({path:path.join(out,'held-first-screen.png')});
 }
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({passed:true,fixtureOnly:true,checks},null,2));console.log(JSON.stringify({passed:true,cases:checks.length}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
