'use strict'
const {createFiles}=require('../../../local-core/wx-files')
const archive=/^catpaw-backup-[a-z0-9-]+\.zip(?:\.partial)?$/
const workspace=/^export-\d+-[a-z0-9]+$/
let tail=Promise.resolve()
// Serialize generation, sharing and cleanup: a file being shared is never swept.
function run(fn){const task=tail.then(fn);tail=task.catch(()=>{});return task}
async function sweep(io,{keep=null,zips=true}={}){
 let removed=0
 for(const name of await io.list()){
  if(zips&&archive.test(name)&&name!==keep){await io.remove(name);removed++;continue}
  if(!workspace.test(name))continue
  const files=await io.list(name)
  for(const file of files)if(/^(?:snapshot|[a-z_]+-\d+)\.json$/.test(file)){await io.remove(name+'/'+file);removed++}
  if(io.rmdir&&!(await io.list(name)).length)await io.rmdir(name)
 }
 return removed
}
function location(file,wxApi=wx){
 if(!/^catpaw-data-[a-z0-9-]+$/.test(file?.folder||'')||!/^catpaw-backup-[a-z0-9-]+\.zip$/.test(file?.name||''))throw Error('临时备份引用无效')
 const io=createFiles(wxApi,file.folder)
 if(file.path!==io.path(file.name))throw Error('临时备份路径不匹配')
 return io
}
async function discard(file,wxApi){const io=location(file,wxApi);await io.remove(file.name)}
module.exports={run,sweep,location,discard}
