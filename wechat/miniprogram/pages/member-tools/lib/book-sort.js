// Account-scoped draft ordering. Only the complete list is submitted, once.
const ids=rows=>rows.map(r=>r.id),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const moved=(rows,from,to)=>{const next=rows.slice(),row=next.splice(from,1)[0];next.splice(to,0,row);return next}
module.exports=function({ensure,account,wxApi}){return {
 clearBookSort(){this.stopBookDrag();this._bookSortOriginal=null;this._bookOrderPending=null;this.setData({bookSorting:false,bookSortDirty:false,bookSortPending:false,dragBook:null});wxApi().disableAlertBeforeUnload?.()},
 async startBookSort(){
  if(this.data.busy||this.data.bookSorting||this.data.activeBooks.length<2)return
  if(!this.data.orderSupported){wxApi().showToast({title:'请先更新云函数以使用排序',icon:'none'});return}
  const token=account(),seq=this._seq;if(!await ensure(this)||!this.valid(token,seq)||this.data.bookSorting)return
  this._bookSortOriginal=this.data.activeBooks.map(r=>({...r}));this._bookOrderPending=null
  this.setData({bookSorting:true,bookSortDirty:false,bookSortPending:false,error:''})
 },
 markBookSort(rows){const dirty=!same(ids(rows),ids(this._bookSortOriginal||[]));this.setData({activeBooks:rows,bookSortDirty:dirty});if(dirty)wxApi().enableAlertBeforeUnload?.({message:'账本顺序尚未保存，请先完成或取消排序。'});else wxApi().disableAlertBeforeUnload?.()},
 cancelBookSort(){if(this.data.busy||this.data.bookSortPending)return;const rows=this._bookSortOriginal;this.clearBookSort();if(rows)this.setData({activeBooks:rows,error:''})},
 bookSortStep(e){if(!this.data.bookSorting||this.data.busy||this.data.bookSortPending||this._bookDrag)return;const from=Number(e.currentTarget.dataset.index),to=from+Number(e.currentTarget.dataset.step);if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=this.data.activeBooks.length||to>=this.data.activeBooks.length)return;this.markBookSort(moved(this.data.activeBooks,from,to))},
 async reviewBookOrder(){
  if(this.data.busy)return;if(this.data.bookSortPending)return this.finishBookSort()
  const token=account(),seq=this._seq;this.setData({busy:true})
  try{const r=await this.request('/member/books');if(!this.valid(token,seq))return
   if(!Number.isSafeInteger(r.order_revision))throw Error('请先更新云函数以使用排序')
   const rows=this.decorateBooks(r.books).filter(b=>!b.archived),byId=new Map(rows.map(b=>[b.id,b])),draft=this.data.activeBooks.filter(b=>byId.has(b.id)).map(b=>byId.get(b.id)),kept=new Set(ids(draft));draft.push(...rows.filter(b=>!kept.has(b.id)))
   this._bookSortOriginal=rows;this.setData({orderRevision:r.order_revision,error:'云端列表已重新读取，请核对顺序后再点完成。'});this.markBookSort(draft)
  }catch(e){if(this.valid(token,seq))this.setData({error:e.message})}finally{if(this.valid(token,seq))this.setData({busy:false})}
 },
 async finishBookSort(){
  if(!this.data.bookSorting||this.data.busy||this._bookDrag)return
  if(!this.data.bookSortDirty&&!this.data.bookSortPending){this.cancelBookSort();return}
  const pending=this._bookOrderPending||{book_ids:ids(this.data.activeBooks),revision:this.data.orderRevision}
  return this.action(async()=>{
   const finish=r=>{this.clearBookSort();this.acceptBookOrder(r);wxApi().showToast({title:'账本顺序已保存'});this.memberRefresh?.(true)}
   if(this._bookOrderPending){const r=await this.request('/member/books');if(same(ids(r.books.filter(b=>!b.archived)),pending.book_ids)){finish(r);return}}
   this._bookOrderPending=pending;this.setData({bookSortPending:true})
   try{await this.request('/member/books/order',{method:'PUT',revision:pending.revision,data:{book_ids:pending.book_ids}});const r=await this.request('/member/books');finish(r)}
   catch(e){
    if(e.status&&e.status<500){this._bookOrderPending=null;this.setData({bookSortPending:false})}
    else{try{const r=await this.request('/member/books');if(same(ids(r.books.filter(b=>!b.archived)),pending.book_ids)){finish(r);return}}catch(_){} }
    throw Error(e.status===409?'账本列表已变化，草稿已保留；请点重新核对后再保存。':e.status===404||e.status===428?'云函数暂不支持排序，请更新后重试。':this.data.bookSortPending?'保存结果尚未确认，请点核对并重试。':e.message)
   }
  })
 },
 acceptBookOrder(r){const books=this.decorateBooks(r.books),scopeOptions=[{id:'all',name:'全部账本'},...books];this.setData({books,activeBooks:books.filter(b=>!b.archived),archivedBooks:books.filter(b=>b.archived),orderRevision:r.order_revision,orderSupported:Number.isSafeInteger(r.order_revision),scopeOptions,scopeIndex:Math.max(0,scopeOptions.findIndex(b=>b.id===this.data.scope)),destinationBooks:books.filter(b=>!b.archived),error:''})},
 stopBookDrag(){clearInterval(this._bookEdgeTimer);this._bookEdgeTimer=null;this._bookDragEpoch=(this._bookDragEpoch||0)+1;this._bookDrag=null;if(this.data.dragBook)this.setData({dragBook:null,activeBooks:this.data.activeBooks.map(b=>({...b,sortShift:0}))})},
 bookDragStart(e){
  if(!this.data.bookSorting||this.data.busy||this.data.bookSortPending)return
  this.stopBookDrag();const epoch=this._bookDragEpoch,token=account(),seq=this._seq,id=e.currentTarget.dataset.id,y=e.touches?.[0]?.clientY;if(!Number.isFinite(y))return
  const q=wxApi().createSelectorQuery().in(this);q.selectAll('.active-book').fields({rect:true,size:true,dataset:true});q.exec(result=>{
   if(epoch!==this._bookDragEpoch||!this.valid(token,seq)||!this.data.bookSorting)return
   const rects=result[0]||[],from=rects.findIndex(r=>r.dataset.id===id),row=this.data.activeBooks.find(b=>b.id===id);if(from<0||!row)return
   const rect=rects[from];this._bookDrag={id,from,to:from,rects,startY:y,lastY:y,scrollStart:this._bookScrollY||0,scrollDelta:0,rect,token,seq}
   this.setData({dragBook:row,dragBookTop:rect.top,dragBookLeft:rect.left,dragBookWidth:rect.width})
  })
 },
 bookDragMove(e){const d=this._bookDrag,y=e.touches?.[0]?.clientY;if(!d||!Number.isFinite(y))return;d.lastY=y;this.positionBookDrag()
  const height=wxApi().getWindowInfo?.().windowHeight||700,edge=y<80?-1:y>height-80?1:0;d.edge=edge
  if(edge&&!this._bookEdgeTimer)this._bookEdgeTimer=setInterval(()=>{const drag=this._bookDrag;if(!drag||!drag.edge)return;wxApi().pageScrollTo({scrollTop:Math.max(0,(this._bookScrollY||0)+drag.edge*12),duration:0})},40)
  if(!edge){clearInterval(this._bookEdgeTimer);this._bookEdgeTimer=null}
 },
 onPageScroll(e){this._bookScrollY=e.scrollTop;if(this._bookDrag){this._bookDrag.scrollDelta=e.scrollTop-this._bookDrag.scrollStart;this.positionBookDrag()}},
 positionBookDrag(){const d=this._bookDrag;if(!d)return;if(!this.valid(d.token,d.seq)){this.stopBookDrag();return}
  const origin=d.rect.top+d.rect.height/2,center=origin+d.lastY-d.startY+d.scrollDelta;let to=d.from
  if(center>origin){for(let i=d.from+1;i<d.rects.length;i++)if(center>d.rects[i].top+d.rects[i].height/2)to=i}
  else{for(let i=d.from-1;i>=0;i--)if(center<d.rects[i].top+d.rects[i].height/2)to=i}
  d.to=to;const gap=d.rects.length>1?Math.max(0,d.rects[1].top-d.rects[0].top-d.rects[0].height):12,shift=d.rect.height+gap
  this.setData({dragBookTop:d.rect.top+d.lastY-d.startY,activeBooks:this.data.activeBooks.map((b,i)=>({...b,sortShift:i>d.from&&i<=to?-shift:i<d.from&&i>=to?shift:0}))})
 },
 bookDragEnd(){const d=this._bookDrag;if(!d){this.stopBookDrag();return}const rows=moved(this.data.activeBooks,d.from,d.to).map(b=>({...b,sortShift:0}));this.stopBookDrag();this.markBookSort(rows)},
 bookDragCancel(){this.stopBookDrag()}
}}
