// Production markup/styles with local fixtures. No account or network writes.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const {welcomeLayout}=require('../miniprogram/pages/login/lib/layout'),{avatarState,AVATAR_LABELS}=require('../miniprogram/utils/profile')
const root=path.resolve(__dirname,'../miniprogram'),out=path.resolve(__dirname,'../docs/images/white-theme/secondary'),scratch=path.resolve(__dirname,'../.qa-white-secondary')
const source=n=>fs.readFileSync(path.join(root,n),'utf8')
const profile={loading:false,loaded:true,error:'',busy:false,focused:false,name:'记录生活的小小收藏家',avatarLabels:['小芽','小猫','书本','太阳','自行车','星星'],...avatarState({avatar_key:'cat'})}
const record={retired:false,kind:'maintenance',loading:false,loadFailed:false,error:'',busy:false,versionConflict:false,recordId:0,focusField:'',today:'2026-10-10',methodIndex:0,methods:['转卖','赠送','丢弃'],form:{maintained_on:'2026-10-10',cost:'80.00',description:'更换电池',disposed_on:'2026-10-10',proceeds:'0.00',notes:''}}
const cases=[['login',{}],['profile',profile],['record',record],['record-disposal',{...record,kind:'disposal'}],['trash',{loading:false,error:'',items:[{id:1,name:'一起旅行的相机',category:'摄影器材',icon:'▣',deletedDay:'2026-10-09',expiresDay:'2026-11-08'}]}],['keepsakes',{loading:false,error:'',entries:[{key:'a',itemId:1,label:'相伴一周年',date:'2026-10-10',name:'一起旅行的相机'}]}],['support',{}]]
async function main(){
 fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});const file=path.join(scratch,'preview.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><body></body>')
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
 const checks=[]
 try{
 const page=await browser.newPage();await page.goto(pathToFileURL(file).href)
 await page.evaluate(()=>{
 window.render=(template,css,scope,base)=>{
 document.querySelectorAll('style').forEach(n=>n.remove());const style=document.createElement('style');style.textContent=css+'\nbody{margin:0;background:#FFFFFF} img{object-fit:contain} button,input,textarea{font-family:inherit;box-sizing:border-box} button{border:0} .native-bar{height:56px;display:flex;align-items:center;padding:0 18px;border-bottom:1px solid #FAFAFA}';document.head.append(style)
 const container=document.createElement('div');container.innerHTML=template
 const val=(s,e)=>new Function('s','with(s){return ('+e+')}')(s),interp=(s,t)=>t.replace(/{{([\s\S]*?)}}/g,(_,e)=>String(val(s,e)))
 function children(parent,s){let matched=false;for(const node of [...parent.childNodes]){
 if(node.nodeType===3){node.textContent=interp(s,node.textContent);continue}if(node.nodeType!==1)continue
 const loop=node.getAttribute('wx:for');if(loop){node.removeAttribute('wx:for');for(const [index,item]of val(s,loop.slice(2,-2)).entries()){const holder=document.createElement('div');holder.append(node.cloneNode(true));children(holder,{...s,index,item});node.before(...holder.childNodes)}node.remove();continue}
 const condition=node.getAttribute('wx:if'),alternative=node.getAttribute('wx:elif'),otherwise=node.hasAttribute('wx:else')
 if(condition!==null){matched=!!val(s,condition.slice(2,-2));if(!matched){node.remove();continue}}
 else if(alternative!==null){const ok=!matched&&!!val(s,alternative.slice(2,-2));matched||=ok;if(!ok){node.remove();continue}}
 else if(otherwise){if(matched){node.remove();continue}matched=true}else matched=false
 for(const attr of [...node.attributes]){if(attr.name.startsWith('wx:'))node.removeAttribute(attr.name);else {let v=interp(s,attr.value);if(attr.name==='src'&&v.startsWith('/assets/'))v=base+v;node.setAttribute(attr.name,v)}}
 if(node.tagName==='PAPER-BACKGROUND'){node.remove();continue}
 if(node.tagName==='PAPER-LABEL'){const art=node.getAttribute('variant');node.innerHTML='<div class="paper-label label-'+art+'"><img class="label-art" src="'+base+'/assets/white-doodle/label-'+art+'.png"><span class="label-text">'+node.getAttribute('text')+'</span></div>'}
 if(node.tagName==='INPUT')node.value=node.getAttribute('value')||''
 if(node.tagName==='TEXTAREA')node.textContent=node.getAttribute('value')||''
 children(node,s)
 }}children(container,scope);document.body.replaceChildren(...container.childNodes);window.scrollTo(0,0)
 }
 })
 for(const width of [320,390,430,768])for(const [label,fixture]of cases){
 const name=label.startsWith('record')?'record':label
 const scope=name==='login'?{busy:false,error:'',logoFailed:false,devLogin:false,...welcomeLayout({windowWidth:width,windowHeight:788})}:fixture
 const template=source('pages/'+name+'/index.wxml').replace(/<(view|block|image|input|textarea|paper-background|paper-label)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/\b(view|block|picker)(?=[\s>])/g,'div').replace(/\btext(?=[\s>])/g,'span').replace(/\bimage(?=[\s>])/g,'img')
 const css=['app.wxss','styles/journal.wxss','pages/editor/components/paper-label/index.wxss','pages/'+name+'/index.wxss'].map(source).join('\n').replace(/@import[^;]+;/g,'').replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w-])image\b/g,'img')
 await page.setViewportSize({width,height:844});await page.evaluate(args=>render(...args),[template,css,scope,pathToFileURL(root).href])
 await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))
 const check=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,pageWidth:document.querySelector('.page').getBoundingClientRect().width,background:getComputedStyle(document.body).backgroundColor,minButton:Math.min(...[...document.querySelectorAll('button')].map(n=>n.getBoundingClientRect().height)),failedImages:[...document.images].filter(i=>!i.naturalWidth).length}))
 checks.push({width,label,...check});if(check.overflow||check.pageWidth>480||check.background!=='rgb(255, 255, 255)'||check.minButton<44||check.failedImages)throw Error(JSON.stringify(checks.at(-1)))
 await page.screenshot({path:path.join(out,label+'-'+width+'.png'),fullPage:true})
 }
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));console.log(JSON.stringify({checks:checks.length,passed:true}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
