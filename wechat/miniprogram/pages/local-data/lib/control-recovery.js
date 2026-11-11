'use strict'
const runtime=require('../../../local-core/runtime')
const {Store}=require('../../../local-core/store')
const {createFiles}=require('../../../local-core/wx-files')
const repair=require('../../../local-core/repair')
// Used only after the normal control journal cannot be read and the user chooses
// an external backup. A separate rescue workspace never becomes active by itself.
async function access(){
 const original=createFiles(wx,'catpaw-control'),signature=await repair.signature(original)
 let folder=wx.getStorageSync('catpawRescueWorkspace'),control,controlIO
 if(/^catpaw-rescue-[a-z0-9-]+$/.test(folder||''))try{controlIO=createFiles(wx,folder);control=await new Store(controlIO).open();await control.verify()}catch(_){control=null}
 if(!control){folder='catpaw-rescue-'+runtime.nonce();controlIO=createFiles(wx,folder);control=await new Store(controlIO).open();await control.transaction(tx=>tx.set('rescue',[{id:'rescue',createdAt:Date.now()}]));wx.setStorageSync('catpawRescueWorkspace',folder)}
 return {wx,control,controlIO,folder:'catpaw-control',original,signature,recovery:true,controlBroken:true}
}
async function activate(candidate,context){
 if(!candidate.controlBroken||candidate.signature!==context.signature)throw Error('损坏目录已变化，请重新选择备份')
 const store=await new Store(createFiles(wx,candidate.folder)).open();await store.verify()
 await repair.replace(new Store(context.original),{active:[{id:'active',folder:candidate.folder,recovered:true,activatedAt:Date.now()}]},{confirmed:true,expectedSignature:candidate.signature})
 runtime.resetControl();wx.removeStorageSync('catpawRescueWorkspace');const app=typeof getApp==='function'?getApp():null
 if(app){require('../../../utils/member').reset();require('../../../utils/rewards').reset();require('../../../utils/api').clearPhotos();app._localError=null;app.globalData.localMode=true;return app.prepareLocal()}
 return runtime.open()
}
module.exports={access,activate}
