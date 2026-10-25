/* Purchase orders for Flagship. Xero is source of truth; this module never fabricates a PDF. */
(function(){
'use strict';
var bridge=window.FlagshipQuoteBridge;
if(!bridge)return;
var last=null, pending=false, selected=null, contacts=[];
var S='flagship-po-draft-v1';
function el(id){return document.getElementById(id)}
function h(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function alertMsg(msg){el('poMessage').textContent=msg}
function row(item){var e=document.createElement('div');e.className='po-line';e.innerHTML='<input class="po-desc" placeholder="Item / description" value="'+h(item&&item.description)+'"><input class="po-qty" type="number" min="0.001" step="any" value="'+h(item&&item.quantity||1)+'" aria-label="Quantity"><input class="po-price" type="number" min="0" step="0.01" value="'+h(item&&item.unitAmount||0)+'" aria-label="Excl. VAT unit cost"><input class="po-account" placeholder="Purchase account (optional)" value="'+h(item&&item.accountCode)+'"><button type="button" class="po-remove" aria-label="Remove item">×</button>';e.querySelector('button').onclick=function(){e.remove();saveDraft()};e.querySelectorAll('input').forEach(function(x){x.oninput=saveDraft});el('poLines').appendChild(e)}
function lines(){return Array.from(document.querySelectorAll('#poLines .po-line')).map(function(e){return {description:e.querySelector('.po-desc').value.trim(),quantity:Number(e.querySelector('.po-qty').value),unitAmount:Number(e.querySelector('.po-price').value),accountCode:e.querySelector('.po-account').value.trim()}})}
function saveDraft(){try{localStorage.setItem(S,JSON.stringify({supplier:el('poSupplier').value,contactID:selected,job:el('poJob').value,reference:el('poRef').value,deliveryDate:el('poDelivery').value,items:lines()}))}catch(e){}}
function restore(){try{var d=JSON.parse(localStorage.getItem(S)||'{}');selected=d.contactID||null;el('poSupplier').value=d.supplier||'';el('poJob').value=d.job||'';el('poRef').value=d.reference||'';el('poDelivery').value=d.deliveryDate||'';el('poLines').innerHTML='';(d.items&&d.items.length?d.items:[{}]).forEach(row)}catch(e){row({})}}
function setBusy(b){pending=b;el('poCreate').disabled=b;el('poCreate').textContent=b?'Creating in Xero…':'Create in Xero'}
var poModalHistory_=false;
window.addEventListener('popstate',function(){if(!el('poOverlay')||el('poOverlay').hidden)return;poModalHistory_=false;el('poOverlay').hidden=true;el('poOverlay').style.display='none'});
function start(){if(!poModalHistory_){try{history.pushState({purchaseOrderOpen:true},'','#purchase-order');poModalHistory_=true}catch(e){}}el('poOverlay').hidden=false;el('poOverlay').style.display='flex';restore();el('poSupplier').focus()}
function close(){el('poOverlay').hidden=true;el('poOverlay').style.display='none';if(poModalHistory_){poModalHistory_=false;history.back()}}
function uuid(){if(window.crypto&&crypto.randomUUID)return crypto.randomUUID().replace(/-/g,'');return 'po'+Date.now().toString(36)+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2)}
var supplierSearchId=0;
function findSupplier(){
 var q=el('poSupplier').value.trim(),searchId=++supplierSearchId;
 selected=null;saveDraft();el('poResults').innerHTML='';alertMsg('');
 if(q.length<2)return;
 var box=el('poResults'),timer;
 box.textContent='Searching Xero contacts…';
 function current(){return searchId===supplierSearchId&&el('poSupplier').value.trim()===q;}
 var timeout=new Promise(function(resolve,reject){timer=setTimeout(function(){reject(new Error('Contact search timed out. Please try again.'));},25000);});
 Promise.race([Promise.resolve().then(function(){if(typeof bridge.read!=='function')throw new Error('Update the app to enable contact search.');return bridge.read({action:'xeroContacts',q:q});}),timeout]).then(function(r){
  if(!current())return;
  contacts=r.contacts||[];box.innerHTML='';
  contacts.forEach(function(c){
   var b=document.createElement('button');b.type='button';b.textContent=c.name+(c.email?' • '+c.email:'');
   b.onclick=function(){++supplierSearchId;selected=c.contactID;el('poSupplier').value=c.name;box.innerHTML='';alertMsg('Supplier selected: '+c.name);saveDraft();};
   box.appendChild(b);
  });
  if(!contacts.length)box.textContent='No matching Xero contact found in the connected organisation.';
 }).catch(function(e){
  if(!current())return;
  box.textContent=/unknown action/i.test(String(e.message||e))?'Xero contact search is unavailable in the current backend.':'Xero contact search failed: '+String(e.message||e);
 }).finally(function(){clearTimeout(timer);});
}
function create(){if(pending)return;var items=lines(),name=el('poSupplier').value.trim();if(!selected){alertMsg('First tap Find contact in Xero, then select the matching supplier from the results.');return}if(!items.length||items.some(function(i){return !i.description||!(i.quantity>0)||!isFinite(i.unitAmount)||i.unitAmount<0})){alertMsg('Check descriptions, quantities and purchase costs.');return}
var key;try{key=localStorage.getItem(S+'-pending-key')}catch(e){}if(!key){key=uuid();try{localStorage.setItem(S+'-pending-key',key)}catch(e){}}
setBusy(true);alertMsg('Sending purchase order to Xero…');
bridge.request({action:'poCreate',purchaseOrder:{clientKey:key,contactID:selected,supplier:name,job:el('poJob').value,reference:el('poRef').value,deliveryDate:el('poDelivery').value,items:items}}).then(function(r){if(!r.purchaseOrderID)throw Error('Xero did not return a PO ID. Check Xero before retrying.');last=r;el('poPdf').disabled=false;el('poNumber').textContent='Xero PO: '+(r.purchaseOrderNumber||r.purchaseOrderID);alertMsg('Created in Xero. Tap Share Xero PDF to send to WhatsApp.');try{localStorage.removeItem(S+'-pending-key');localStorage.removeItem(S)}catch(e){}}).catch(function(e){if(/^busy, try again\.?$/i.test(String(e.message||e).trim())){alertMsg('The server is busy. This attempt stopped before sending the order to Xero. Wait a moment, then tap Create in Xero again; this draft keeps the same order key.');}else{alertMsg('Could not confirm Xero PO: '+e.message+' Do not start a new order until you check for duplicates in Xero.');}}).finally(function(){setBusy(false)})}
function pdf(){if(!last||!last.purchaseOrderID)return;el('poPdf').disabled=true;alertMsg('Getting original PDF from Xero…');bridge.request({action:'poPdf',purchaseOrderID:last.purchaseOrderID}).then(async function(r){var bin=atob(r.base64),arr=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);var blob=new Blob([arr],{type:'application/pdf'}),file=new File([blob],(last.purchaseOrderNumber||r.filename||'Xero-PO')+'.pdf',{type:'application/pdf'});
if(navigator.canShare&&navigator.canShare({files:[file]})&&navigator.share){try{await navigator.share({files:[file],title:'Purchase order '+(last.purchaseOrderNumber||'')});alertMsg('Xero PDF opened in the share menu. Choose WhatsApp.');return}catch(e){if(e.name==='AbortError'){alertMsg('Sharing cancelled.');return}}}
var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},60000);alertMsg('Xero PDF downloaded. Attach it as a document in WhatsApp (this browser cannot directly share PDF files).');
}).catch(function(e){alertMsg('Xero PDF failed: '+e.message)}).finally(function(){el('poPdf').disabled=false})}
function init(){var home=document.querySelector('#opsInternalModules')||document.querySelector('#screenHome .home');if(!home)return;var b=document.createElement('button');b.className='tile';b.type='button';b.innerHTML='<span class="ic">📦</span><span class="tx"><b>Purchase Orders</b><span>Create in Xero and share the Xero PDF</span></span><span class="go">›</span>';b.onclick=start;home.appendChild(b);
var modal=document.createElement('section');modal.id='poOverlay';modal.hidden=true;modal.style.cssText='display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);align-items:flex-start;justify-content:center;overflow:auto;padding:16px';modal.innerHTML='<div style="background:white;color:#142a3d;border-radius:12px;padding:20px;max-width:680px;width:100%;margin:auto"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">Purchase Order</h2><button type="button" id="poClose">Close ×</button></div><p style="font-size:13px">Xero generates the PO and the PDF. Purchase cost excluding VAT.</p><label>Supplier in Xero<input id="poSupplier" placeholder="Search Xero supplier" autocomplete="off"></label><button type="button" id="poFindContact" style="margin-bottom:10px">Find contact in Xero</button><div id="poResults" class="po-results"></div><label>Job / site<input id="poJob" placeholder="Job reference"></label><label>Reference<input id="poRef" placeholder="PO reference"></label><label>Expected delivery date<input id="poDelivery" type="date"></label><h3>Items</h3><div style="font-size:12px">Description | Qty | Unit cost excl. VAT | Purchase account</div><div id="poLines"></div><button type="button" id="poAdd">+ Add item</button><p id="poNumber"></p><div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:12px"><button type="button" id="poCreate">Create in Xero</button><button type="button" id="poPdf" disabled>Share Xero PDF / WhatsApp</button></div><p id="poMessage" role="status" aria-live="polite"></p></div>';document.body.appendChild(modal);
var style=document.createElement('style');style.textContent='#poOverlay input{display:block;width:100%;box-sizing:border-box;padding:10px;margin:4px 0 11px;border:1px solid #9ca3af;border-radius:6px;font:inherit}#poOverlay label{display:block;font-weight:600;font-size:13px}#poOverlay button{padding:10px;border:1px solid #aaa;border-radius:7px;cursor:pointer}#poCreate,#poPdf{background:#1F4E79;color:white}#poOverlay button:disabled{opacity:.5}#poOverlay .po-line{display:grid;grid-template-columns:2fr .7fr 1fr 1fr auto;gap:5px;align-items:start}#poOverlay .po-line input{min-width:0}#poResults button{display:block;width:100%;text-align:left}@media(max-width:510px){#poOverlay .po-line{grid-template-columns:1fr 1fr}#poOverlay .po-desc{grid-column:1/-1}}';document.head.appendChild(style);
el('poFindContact').onclick=findSupplier;el('poClose').onclick=close;el('poAdd').onclick=function(){row({});saveDraft()};el('poCreate').onclick=create;el('poPdf').onclick=pdf;el('poSupplier').oninput=function(){clearTimeout(window._poTimer);window._poTimer=setTimeout(findSupplier,350)};['poJob','poRef','poDelivery'].forEach(function(id){el(id).oninput=saveDraft});modal.addEventListener('click',function(e){if(e.target===modal)close()});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();