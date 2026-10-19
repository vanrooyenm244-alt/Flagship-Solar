(function(){'use strict';var screen=document.getElementById('screenStock');if(!screen)return;
var host=document.createElement('section');host.className='sheet';host.style.marginTop='14px';host.innerHTML='<div class="sheet-head"><h2>Issue stock to Kleinmond</h2></div><p class="hint">A stock issue subtracts from Store, GWM or NP200 and records the movement centrally. Kleinmond is not a counting location.</p><div class="setrow"><label>Source</label><select id="kmSource"><option value="Store">Store</option><option value="GWM">GWM</option><option value="NP200">NP200</option></select></div><div class="setrow"><label>Stock item</label><select id="kmItem"><option value="">Choose a stocked item</option></select></div><div class="setrow"><label>Quantity</label><input id="kmQuantity" type="number" min="1" step="1" inputmode="numeric"></div><div class="setrow"><label>Job / delivery reference</label><input id="kmReference" maxlength="120" placeholder="Job number or delivery reference"></div><button id="kmSubmit" class="btn" type="button">Issue to Kleinmond</button><div id="kmStatus" role="status" aria-live="polite" style="margin:12px 0"></div><h3>Recent issues</h3><div id="kmHistory" class="hint">Load Stock to view movement history.</div>';
screen.appendChild(host);
var source=host.querySelector('#kmSource'),item=host.querySelector('#kmItem'),qty=host.querySelector('#kmQuantity'),ref=host.querySelector('#kmReference'),send=host.querySelector('#kmSubmit'),status=host.querySelector('#kmStatus'),history=host.querySelector('#kmHistory');
var pendingId=null;
function escapeHtml(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function allowed(){return typeof hasPermission_==='function'&&hasPermission_('stock.manage')}
function refreshItems(){
 var enabled=ST&&ST.company==='Flagship Solar';host.style.display=enabled?'':'none';if(!enabled)return;
 send.style.display=allowed()?'':'none';
 var selected=item.value;item.innerHTML='<option value="">Choose a stocked item</option>';
 (ST.items||[]).filter(function(x){return Number(x[source.value])>0}).forEach(function(x){var o=document.createElement('option');o.value=x.item;o.textContent=x.item+' ('+x[source.value]+' available)';item.appendChild(o)});
 item.value=selected;
}
function refreshHistory(){
 if(!allowed()){history.textContent='Movement history available to authorized users.';return}
 apiGet({action:'stockIssueHistory'}).then(function(r){if(!r.ok)throw Error(r.error||'Cannot load history');var a=r.movements||[];history.innerHTML=a.length?a.filter(function(x){return x.destination==='Kleinmond'}).map(function(x){return '<div class="strow"><b>'+escapeHtml(x.item)+'</b> · '+escapeHtml(x.quantity)+'<div class="hint">'+escapeHtml(x.source)+' → Kleinmond · '+escapeHtml(x.reference)+' · '+escapeHtml(x.user)+' · '+escapeHtml(x.status)+'</div></div>'}).join(''):'No Kleinmond issues yet.'}).catch(function(e){history.textContent='Movement history unavailable: '+String(e.message||e)})}
source.addEventListener('change',refreshItems);
send.addEventListener('click',function(){
 if(!allowed()){status.textContent='Permission denied';return}
 if(ST.company!=='Flagship Solar'){status.textContent='Select Flagship Solar stock';return}
 var n=Number(qty.value),selected=(ST.items||[]).find(function(x){return x.item===item.value});
 if(!selected||!Number.isInteger(n)||n<1||n>Number(selected[source.value])||!ref.value.trim()){status.textContent='Choose an available item, a valid quantity and a job reference.';return}
 if(!pendingId)pendingId='km-'+Date.now()+'-'+Math.random().toString(36).slice(2,12);
 if(!confirm('Issue '+n+' × '+selected.item+' from '+source.value+' to Kleinmond?'))return;
 send.disabled=true;status.textContent='Recording movement…';
 api({action:'stockIssueKleinmond',source:source.value,destination:'Kleinmond',item:selected.item,quantity:n,reference:ref.value.trim(),requestId:pendingId}).then(function(r){
 if(!r.ok||r.status!=='APPLIED')throw Error(r.error||'Movement not acknowledged');
 status.textContent='Issued successfully. Remaining at '+source.value+': '+r.remaining;
 pendingId=null;qty.value='';ref.value='';loadStock();refreshHistory();
 }).catch(function(e){status.textContent='Not confirmed: '+String(e.message||e)+'. Do not change the details before retrying.'}).finally(function(){send.disabled=false});
});
var observer=new MutationObserver(function(){if(!screen.classList.contains('hidden')){refreshItems();}});observer.observe(screen,{attributes:true,attributeFilter:['class']});
document.getElementById('stCompany').addEventListener('change',function(){setTimeout(refreshItems,100)});
document.getElementById('stPlaces').addEventListener('click',function(){setTimeout(refreshItems,100)});
refreshItems();
})();