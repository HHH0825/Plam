function(action,value){
 const a=getApp(),p=getCurrentPages().slice(-1)[0];
 if(action==='setup'){
  if(a._cashRedesignQA)throw Error('Fixture already active');
  const q={globalData:a.globalData,requireSession:a.requireSession,http:wx.cloud.callHTTPFunction,get:wx.getStorageSync,set:wx.setStorageSync,remove:wx.removeStorageSync,preview:wx.previewImage,storage:new Map(),calls:[],...value};
  a._cashRedesignQA=q;a.globalData={...a.globalData,token:'isolated-cash-redesign',expiresAt:Math.floor(Date.now()/1000)+3600,user:{id:991200,username:'微信用户1',avatar_key:'cat'}};a.requireSession=()=>true;
  wx.getStorageSync=k=>q.storage.get(k)||'';wx.setStorageSync=(k,v)=>q.storage.set(k,v);wx.removeStorageSync=k=>q.storage.delete(k);wx.previewImage=o=>{o.success?.({});o.complete?.({})};
  wx.cloud.callHTTPFunction=function(spec){const route=spec.path.split('?')[0].replace('/api/mp',''),method=(spec.method||'GET').toUpperCase();q.calls.push({route,method});let statusCode=200,data=[];
   if(method!=='GET'){statusCode=403;data={error:'隔离验证禁止业务写入'};}
   else if(route==='/auth/me')data={user:a.globalData.user,account_age_days:9,capabilities:{cash_ledger:1,storage_locations:true,item_cover_icons:true}};
   else if(route==='/ledger/settings')data={enabled:true};
   else if(route==='/ledger/statistics')data=q.ledger;
   else if(route==='/ledger/entries'){const date=spec.path.match(/[?&]date=([^&]+)/)?.[1]||null;data={date,entries:q.entries.filter(r=>!date||r.occurred_on===date),summary:q.ledger.summary,filtered_summary:q.ledger.summary,day_summaries:Object.fromEntries(q.ledger.days.map(r=>[r.date,r])),next_offset:null};}
   else if(route==='/stats')data=q.items;
   else if(route==='/insights')data=q.insights;
   else if(route==='/items')data=[];
   const response={statusCode:200,data:JSON.stringify({palm_http:1,statusCode,data}),header:{}};setTimeout(()=>{spec.success?.(response);spec.complete?.(response)},0);return Promise.resolve(response);
  };return true;
 }
 const q=a._cashRedesignQA;
 if(action==='restore'){if(q){if(p.route==='pages/ledger-report/index')p.invalidate();wx.getStorageSync=q.get;wx.setStorageSync=q.set;wx.removeStorageSync=q.remove;wx.cloud.callHTTPFunction=q.http;wx.previewImage=q.preview;a.globalData=q.globalData;a.requireSession=q.requireSession;delete a._ledgerDestination;delete a._cashRedesignQA;if(['pages/me/index','pages/ledger/index','pages/statistics/index'].includes(p.route))p.onShow();}return true;}
 if(!q)throw Error('No cash redesign fixture');
 if(action==='wait-route')return new Promise((resolve,reject)=>{const start=Date.now();function poll(){const current=getCurrentPages().slice(-1)[0];if(current?.route===value)return setTimeout(()=>resolve(true),200);if(Date.now()-start>4000)return reject(Error('Route did not settle: '+current?.route));setTimeout(poll,50)}poll()});
 if(action==='settle')return new Promise((resolve,reject)=>{const start=Date.now();function poll(){if(!p.data.loading&&!p.data.cashLoading&&!p.data.statsLoading&&!p.data.dayLoading&&!p.data.imageBusy)return setTimeout(()=>resolve(true),200);if(Date.now()-start>6000)return reject(Error('Page did not settle'));setTimeout(poll,50)}poll()});
 if(action==='reload'){p.onShow();return true;}
 if(action==='state')return{route:p.route,month:p.data.month,view:p.data.view,cash:p.data.cash,cashError:p.data.cashError,summary:p.data.summary,analysis:p.data.cashAnalysis?{gross:p.data.cashAnalysis.summary.grossDisplay,expense:p.data.cashAnalysis.summary.expenseDisplay,net:p.data.cashAnalysis.summary.netDisplay,rows:p.data.cashAnalysis.rows.map(r=>({name:r.name,display:r.display})),topDate:p.data.cashAnalysis.topDate}:null,analysisError:p.data.cashAnalysisError,error:p.data.error,expanded:p.data.categoriesExpanded,showAmounts:p.data.showAmounts,imageBusy:p.data.imageBusy,imageError:p.data.imageError,amountDialog:p.data.amountDialog,writes:q.calls.filter(r=>r.method!=='GET').length};
 if(action==='bottom'){wx.pageScrollTo({scrollTop:99999,duration:0});return true;}
 if(action==='mask'){p.toggleAmounts({detail:{value:false}});return true;}
 if(action==='export')return p.preview().then(()=>{if(!p.data.imagePath)throw Error(p.data.imageError||'No report image');return{base64:wx.getFileSystemManager().readFileSync(p.data.imagePath,'base64'),masked:!p.data.showAmounts}});
 if(action==='amount'){p.amountInfo();return true;}
 if(action==='close-amount'){p.closeAmount();return true;}
 if(action==='ring-debug')return new Promise(resolve=>{const started=Date.now();function poll(){const c=p.selectComponent('.cash-report-ring')||p.selectComponent('.cash-analysis-ring');if(!c)return resolve({missing:true});if(!c.data.imagePath&&!c.data.renderError&&Date.now()-started<3000)return setTimeout(poll,50);if(!c.data.imagePath)return resolve({missing:true,error:c.data.renderError});c.createSelectorQuery().select('.cash-donut-renderer').fields({node:true}).select('.cash-donut-image').boundingClientRect().exec(r=>{const node=r[0]?.node;if(!node)return resolve({missing:true});let colored=0;const pixels=node.getContext('2d').getImageData(0,0,node.width,node.height).data;for(let i=0;i<pixels.length;i+=16)if(pixels[i+3]>128)colored++;resolve({ordinaryImage:true,width:r[1]?.width,height:r[1]?.height,canvasWidth:node.width,canvasHeight:node.height,coloredPixels:colored,error:c.data.renderError,window:wx.getWindowInfo()})});}poll()});
 if(action==='geometry')return new Promise(resolve=>{const query=wx.createSelectorQuery().in(p),selectors=p.route==='pages/me/index'?['.overview-shell','.overview-card','.me-cash-title','.me-cash-grid']:p.route==='pages/ledger-report/index'?['.cash-report-paper','.cash-report-actions']:p.route==='pages/statistics/index'?['.cash-analysis-card','.cash-discoveries','.cash-report-entry']:['.ledger-journal-panel','.ledger-panel-month','.ledger-main-region','.ledger-summary-bottom'];selectors.forEach(s=>query.select(s).boundingClientRect());query.exec(rects=>resolve({selectors,rects,window:wx.getWindowInfo()}))});
 return true;
}
