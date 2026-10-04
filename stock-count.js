/* Durable count journal. Drafts are isolated by user, company and location. */
(function(g){
  function key(user,company,place){return 'stock-count-v2:'+JSON.stringify([user||'',company,place]);}
  g.StockJournal={
    read:function(user,company,place){var raw=localStorage.getItem(key(user,company,place));return raw?JSON.parse(raw):null;},
    save:function(user,company,place,counts){var copy=JSON.parse(JSON.stringify(counts));localStorage.setItem(key(user,company,place),JSON.stringify({counts:copy,updated:Date.now()}));return copy;},
    send:async function(counts,post,onAck,onProgress){
      var names=Object.keys(counts),done=0,accepted=0,unknown=[],rejected=[];
      onProgress(0,names.length);
      for(var i=0;i<names.length;i+=20){
        var batch={};names.slice(i,i+20).forEach(function(k){batch[k]=counts[k];});
        var j=await post(batch);
        if(!j||!Array.isArray(j.unknown)||!Array.isArray(j.rejected)||typeof j.changed!=='number')throw Error('Invalid stock acknowledgement; unconfirmed counts retained.');
        var ok=Object.keys(batch).filter(function(k){return j.unknown.indexOf(k)<0&&j.rejected.indexOf(k)<0;});
        await onAck(ok,batch,j);
        accepted+=ok.length;unknown=unknown.concat(j.unknown);rejected=rejected.concat(j.rejected);
        done+=Object.keys(batch).length;onProgress(done,names.length);
      }
      return {accepted:accepted,unknown:unknown,rejected:rejected};
    },
    draw:function(el,counts,done,total){
      var names=Object.keys(counts);el.innerHTML='<b>'+names.length+' items counted</b><details><summary>Counted items</summary>'+names.map(function(k){var p=document.createElement('div');p.textContent=k+' — '+counts[k];return p.outerHTML;}).join('')+'</details>'+(total!=null?'<progress max="'+total+'" value="'+done+'" style="width:100%"></progress><div>'+done+' / '+total+' processed ('+Math.round(done/total*100)+'%)</div>':'');
    }
  };
})(window);
