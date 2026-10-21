// Offline preview uses the actual custom-tab-bar markup and component styles.
const fs=require('node:fs'),path=require('node:path')
module.exports=async function install(page,root){
  const template=fs.readFileSync(path.join(root,'custom-tab-bar/index.wxml'),'utf8')
    .replace(/<image([^>]+)\/>/g,'<img$1>').replace(/\bview(?=[\s>])/g,'div').replace(/\btext(?=[\s>])/g,'span')
  const css=fs.readFileSync(path.join(root,'custom-tab-bar/index.wxss'),'utf8').replace(/(?<![.\w-])button(?=[\s:{])/g,'.tab-bar button').replace(/(?<![.\w-])image\b/g,'img').replace(/\bview\b/g,'div')
  await page.evaluate(({template,css})=>{
    window.mountWhiteNav=(selected,base,hidden=false,menuOpen=false,iconErrors={})=>{
      if(hidden)return
      const selectedRoute=typeof selected==='string'?selected:(selected===1?'pages/me/index':'pages/items/index')
      const scope={selectedRoute,selected,hidden,menuOpen,iconErrors,glassFallback:false,glassNoBlur:false}
      const value=e=>new Function('s','with(s){return ('+e+')}')(scope)
      const interp=t=>t.replace(/{{([\s\S]*?)}}/g,(_,e)=>String(value(e)??''))
      const node=document.createElement('div')
      node.innerHTML=template
      function children(parent){let matched=false;for(const n of [...parent.children]){
        const cond=n.getAttribute('wx:if'),alt=n.hasAttribute('wx:else');if(cond!==null){matched=!!value(cond.slice(2,-2));if(!matched){n.remove();continue}}else if(alt){if(matched){n.remove();continue}matched=true}else matched=false
        for(const a of [...n.attributes]){if(a.name.startsWith('wx:'))n.removeAttribute(a.name);else n.setAttribute(a.name,interp(a.value))}
        for(const child of n.childNodes)if(child.nodeType===3)child.textContent=interp(child.textContent)
        if(n.tagName==='PAGE-CONTAINER'){if(!menuOpen){n.remove();continue}n.classList.add('preview-sheet')}
        children(n)
      }}children(node)
      for(const img of node.querySelectorAll('img'))if(img.getAttribute('src')?.startsWith('/assets/'))img.src=base+img.getAttribute('src')
      const style=document.createElement('style');style.textContent=css+'\n.preview-sheet{display:block;position:fixed;z-index:130;bottom:0;left:0;right:0}.preview-menu-mask{position:fixed;inset:0;z-index:129;background:rgba(41,41,41,.28)}';document.head.append(style)
      if(menuOpen){const mask=document.createElement('div');mask.className='preview-menu-mask';document.body.append(mask)}
      document.body.append(...node.childNodes)
    }
  },{template,css})
}
