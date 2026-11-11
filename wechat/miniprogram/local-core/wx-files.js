'use strict'
// Only ENOENT means absent. Permission, quota and read failures must reach the recovery UI.
function createFiles(wxApi,folder='catpaw-local-v1'){
 if(!/^[a-z0-9-]+$/.test(folder))throw Error('无效数据目录')
 const fs=wxApi.getFileSystemManager(),root=wxApi.env.USER_DATA_PATH+'/'+folder
 const call=(method,args)=>new Promise((resolve,reject)=>fs[method]({...args,success:resolve,fail:e=>{if(['writeFile','appendFile','copyFile'].includes(method)&&/quota|no space|storage.*limit|file.*limit|exceed.*storage/i.test(e.errMsg||''))reject(Object.assign(Error('本机空间不足，原资料仍保留。请先导出备份，再清理无引用文件或其他设备空间后重试。'),{code:'LOCAL_STORAGE_FULL'}));else reject(e)}}))
 const missing=(e,path)=>/no such file|\bENOENT\b/i.test(e?.errMsg||e?.message||'')||['readFile','unlink'].some(method=>e?.errMsg===method+':fail '+path+' not found')
 const local=name=>{if(typeof name!=='string'||!name||name.includes('..')||!/^[a-zA-Z0-9_./-]+$/.test(name)||name.startsWith('/'))throw Error('无效文件路径');return root+'/'+name}
 let ready
 async function ensure(){if(!ready)ready=call('mkdir',{dirPath:root,recursive:true}).catch(async e=>{try{await call('access',{path:root})}catch(_){ready=null;throw e}});await ready}
 return {
  root,
  path:local,
  async mkdir(name){await ensure();try{await call('mkdir',{dirPath:local(name),recursive:true})}catch(error){const result=await call('stat',{path:local(name)}).catch(()=>{throw error});if(!result.stats?.isDirectory?.())throw error}},
  async remove(name){await ensure();try{await call('unlink',{filePath:local(name)})}catch(e){if(!missing(e,local(name)))throw e}},
  async copyFrom(path,name){await ensure();await call('copyFile',{srcPath:path,destPath:local(name)})},
  async read(name){await ensure();try{return new Uint8Array((await call('readFile',{filePath:local(name)})).data)}catch(e){if(missing(e,local(name)))return null;throw e}},
  async write(name,bytes){await ensure();await call('writeFile',{filePath:local(name),data:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)})},
  async append(name,bytes){await ensure();await call('appendFile',{filePath:local(name),data:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)})},
  async size(name){await ensure();return(await call('stat',{path:local(name)})).stats.size},
  async readRange(name,position,length){await ensure();const {fd}=await call('open',{filePath:local(name),flag:'r'});try{const result=await call('read',{fd,arrayBuffer:new ArrayBuffer(length),position,length,offset:0});return new Uint8Array(result.arrayBuffer,0,result.bytesRead)}finally{await call('close',{fd})}},
  async rename(from,to){await ensure();await call('rename',{oldPath:local(from),newPath:local(to)})},
  async list(name){await ensure();return(await call('readdir',{dirPath:name?local(name):root})).files},
  async rmdir(name){await ensure();await call('rmdir',{dirPath:local(name),recursive:false})},
 }
}
module.exports={createFiles}
