/* Xero purchase item import. The catalog stays in this browser. */
(function(root){
'use strict';
var accounts=[['310','c.o.s Plumbing (Geyser & Heatpump)'],['311','c.o.s Electrical Equipment'],['312','c.o.s Solar Equipment'],['313','UniForms / PPE'],['314','Consumables - Plumbing'],['315','Consumables - Electrical']];
function rows(text){
 var out=[],row=[],cell='',quote=false;
 text=String(text||'').replace(/^\uFEFF/,'');
 for(var i=0;i<text.length;i++){
  var c=text[i];
  if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else quote=!quote;}
  else if(!quote&&(c===','||c==='\n'||c==='\r')){
   row.push(cell);cell='';
   if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(function(v){return v!=='';}))out.push(row);row=[];}
  }else cell+=c;
 }
 if(quote)throw Error('Unclosed CSV quote.');
 row.push(cell);if(row.some(function(v){return v!=='';}))out.push(row);
 return out;
}
function price(value){
 if(value===null||value===undefined||String(value).trim()==='')return null;
 var n=Number(String(value).replace(/,/g,'').trim());
 if(!Number.isFinite(n)||n<0)throw Error('Invalid purchase price in inventory.');
 return n;
}
function parse(text){
 var data=rows(text);if(data.length<2)throw Error('The inventory CSV has no item rows.');
 var headers=data.shift().map(function(v){return v.replace(/^\*/,'').trim();});
 ['ItemCode','PurchasesAccount','PurchasesUnitPrice'].forEach(function(h){if(headers.indexOf(h)<0)throw Error('Missing Xero CSV column: '+h);});
 var seen={};
 return data.map(function(r){
  function get(k){var i=headers.indexOf(k);return i<0?'':String(r[i]||'').trim();}
  var code=get('ItemCode');if(!code)return null;
  if(seen[code.toLowerCase()])throw Error('Duplicate inventory item code: '+code);
  seen[code.toLowerCase()]=true;
  return {code:code,name:get('ItemName'),purchaseDescription:get('PurchasesDescription'),purchaseUnitPrice:price(get('PurchasesUnitPrice')),purchaseAccountCode:get('PurchasesAccount'),purchaseTaxLabel:get('PurchasesTaxRate'),active:get('Status').toLowerCase()!=='archived',source:'csv'};
 }).filter(function(x){return x&&x.active;});
}
function apply(item,line){
 var next=Object.assign({},line,{itemCode:item.code,accountCode:item.purchaseAccountCode||''});
 if(!String(next.description||'').trim())next.description=item.purchaseDescription||item.name||item.code;
 if(next.unitAmount===null||next.unitAmount===undefined||String(next.unitAmount).trim()==='')next.unitAmount=item.purchaseUnitPrice;
 return next;
}
var api={parse:parse,apply:apply,accounts:accounts};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.FlagshipPOInventory=api;
})(typeof window!=='undefined'?window:globalThis);
