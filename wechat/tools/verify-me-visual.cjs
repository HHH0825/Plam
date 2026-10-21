// Render actual page sources with synthetic data; native screenshots are separate.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright')
const {avatarState}=require('../miniprogram/utils/profile')
const root=path.resolve(__dirname,'../miniprogram'),output=path.resolve(__dirname,'../docs/images/me-refresh'),scratch=path.resolve(__dirname,'../.qa-me-refresh')
const source=name=>fs.readFileSync(path.join(root,name),'utf8')
const template=source('pages/me/index.wxml').replace(/<(image)((?:"[^"]*"|'[^']*'|[^'">])*)\/>/g,'<$1$2></$1>').replace(/\bview(?=[\s>])/g,'div').replace(/\btext(?=[\s>])/g,'span').replace(/\bimage(?=[\s>])/g,'img')
const css=['app.wxss','pages/me/index.wxss'].map(source).join('\n').replace(/(?<![.\w-])page\s*\{/g,'body {').replace(/(?<![.\w-])view\b/g,'div').replace(/(?<![.\w-])text\b(?=[:\s{])/g,'span').replace(/(?<![.\w-])image\b/g,'img')
const user={id:1,username:'小小收藏家',avatar_key:'cat'},fixture={user,...avatarState(user),loading:false,error:''},tabs=JSON.parse(source('app.json')).tabBar
async function main(){
  fs.mkdirSync(output,{recursive:true});fs.mkdirSync(scratch,{recursive:true});const html=path.join(scratch,'preview.html');fs.writeFileSync(html,'<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files']})
  const checks=[]
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(pathToFileURL(html).href)
    await page.evaluate(()=>{
      window.render=(template,css,scope,base,tabs,broken)=>{
        document.querySelectorAll('style').forEach(n=>n.remove());const style=document.createElement('style')
        style.textContent=css+'\nbody{margin:0;padding-bottom:64px} div,span{box-sizing:border-box} img{object-fit:contain} button{font-family:inherit;border:0} .native-bar{height:52px;display:flex;align-items:center;justify-content:center;position:relative;background:#F7F4EF;font-size:15px} .capsule{position:absolute;right:12px;border:1px solid #E7DFD5;border-radius:24px;padding:3px 12px;background:#FFFCF7;font-size:20px} .native-tabs{position:fixed;bottom:0;left:0;right:0;height:64px;z-index:10;display:flex;justify-content:space-around;align-items:center;background:#FFFCF7;border-top:1px solid #E7DFD5} .native-tab{display:flex;flex-direction:column;align-items:center;font-size:12px;color:'+tabs.color+'} .native-tab img{width:28px;height:28px} .native-tab.active{color:'+tabs.selectedColor+'}'
        document.head.append(style);const container=document.createElement('div');container.innerHTML=template
        const value=e=>new Function('scope','with(scope){return ('+e+')}')(scope),interpolate=t=>t.replace(/{{([\s\S]*?)}}/g,(_,e)=>String(value(e)))
        function children(parent){let matched=false;for(const node of [...parent.childNodes]){
          if(node.nodeType===3){node.textContent=interpolate(node.textContent);continue}if(node.nodeType!==1)continue
          const condition=node.getAttribute('wx:if'),alternative=node.getAttribute('wx:elif'),otherwise=node.hasAttribute('wx:else')
          if(condition!==null){matched=!!value(condition.slice(2,-2));if(!matched){node.remove();continue}}
          else if(alternative!==null){const ok=!matched&&!!value(alternative.slice(2,-2));matched||=ok;if(!ok){node.remove();continue}}
          else if(otherwise){if(matched){node.remove();continue}matched=true}else matched=false
          for(const attribute of [...node.attributes]){
            if(attribute.name.startsWith('wx:'))node.removeAttribute(attribute.name)
            else{let v=interpolate(attribute.value);if(attribute.name==='src'&&v.startsWith('/assets/'))v=base+v;node.setAttribute(attribute.name,v)}
          }
          children(node)
        }}
        children(container);const bar=document.createElement('div');bar.className='native-bar';bar.textContent='我的';const capsule=document.createElement('span');capsule.className='capsule';capsule.textContent='••• ｜ ◉';bar.append(capsule)
        document.body.replaceChildren(bar,...container.childNodes)
        if(broken)document.querySelectorAll('.me-wash,.me-hero-art').forEach(i=>i.src=base+'/missing-art.png')
        const nav=document.createElement('div');nav.className='native-tabs';tabs.list.forEach((tab,index)=>{const item=document.createElement('div');item.className='native-tab'+(index===2?' active':'');const image=new Image();image.src=base+'/'+(index===2?tab.selectedIconPath:tab.iconPath);item.append(image,document.createTextNode(tab.text));nav.append(item)});document.body.append(nav);window.scrollTo(0,0)
      }
    })
    async function capture(width,label,patch={},broken=false){
      await page.setViewportSize({width,height:844});await page.evaluate(args=>render(...args),[template,css,{...fixture,...patch},pathToFileURL(root).href,tabs,broken])
      await page.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(resolve=>{i.onload=resolve;i.onerror=resolve}))))
      const metrics=await page.evaluate(()=>{
        const page=document.querySelector('.page').getBoundingClientRect(),copy=document.querySelector('.heading-copy').getBoundingClientRect(),art=document.querySelector('.me-hero-art').getBoundingClientRect()
        return {pageWidth:page.width,overflow:document.documentElement.scrollWidth>innerWidth,menuHeights:[...document.querySelectorAll('.menu')].map(n=>n.getBoundingClientRect().height),minButtonHeight:Math.min(...[...document.querySelectorAll('button')].map(n=>n.getBoundingClientRect().height)),failedImages:[...document.images].filter(i=>!i.naturalWidth).length,heroOverlapsText:copy.right>art.left+1,decorIntercepts:[...document.querySelectorAll('.me-texture,.me-wash,.me-hero-art,.menu-icon')].some(n=>getComputedStyle(n).pointerEvents!=='none'),avatarRadius:getComputedStyle(document.querySelector('.profile-avatar')).borderRadius}
      });checks.push({width,label,...metrics})
      if(metrics.overflow||metrics.pageWidth>480||metrics.minButtonHeight<44||metrics.menuHeights.some(h=>h<72)||metrics.heroOverlapsText||metrics.decorIntercepts||metrics.failedImages!==(broken?2:0)||metrics.avatarRadius!=='50%')throw new Error(JSON.stringify(checks.at(-1)))
      await page.screenshot({path:path.join(output,`${label}-${width}.png`),fullPage:true})
      if(width===390&&label==='default'){await page.screenshot({path:path.join(output,'top.png')})}
      await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
      const footer=await page.evaluate(()=>({logoutBottom:document.querySelector('.logout-button').getBoundingClientRect().bottom,navTop:document.querySelector('.native-tabs').getBoundingClientRect().top}))
      if(footer.logoutBottom>footer.navTop)throw new Error('Logout covered by navigation: '+JSON.stringify(footer))
      if(width===390&&label==='default')await page.screenshot({path:path.join(output,'lower.png')})
    }
    for(const width of [320,390,430,768]){await capture(width,'default');await capture(width,'long-name',{user:{...user,username:'收藏生活记录每一件物品的故事'.repeat(2)}})}
    for(const key of ['sprout','cat','book','sun','bike','star'])await capture(390,'avatar-'+key,avatarState({...user,avatar_key:key}))
    await capture(320,'avatar-failed',{avatarFailed:true});await capture(320,'loading',{user:null,loading:true})
    await capture(320,'read-failed',{user:null,loading:false,error:'网络暂时不可用，请重新读取资料。'})
    await capture(320,'decor-failed',{},true)
    fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify(checks,null,2));console.log(JSON.stringify({passed:true,checks:checks.length,widths:[320,390,430,768]}))
  }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
