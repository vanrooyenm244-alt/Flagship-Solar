/** Server-only TimeTree sessions. Never return cookies or credentials to clients. */
function ttSessionCookie_(){
  var props=PropertiesService.getScriptProperties();
  var email=props.getProperty('TIMETREE_EMAIL'),password=props.getProperty('TIMETREE_PASSWORD');
  if(!email||!password)throw Error('TimeTree read credentials are not configured');
  var key=ttDigest_(email+'\n'+password);
  function saved(){try{var s=JSON.parse(props.getProperty('TIMETREE_SESSION_JSON')||'null');return s&&s.key===key&&s.cookie?s.cookie:'';}catch(ignore){return '';}}
  var cookie=saved();if(cookie)return cookie;
  // User lock is distinct from the scheduled sync's script lock.
  var lock=LockService.getUserLock();lock.waitLock(15000);
  try{
    cookie=saved();if(cookie)return cookie;
    if(props.getProperty('TIMETREE_AUTH_FAILURE_KEY')===key&&Number(props.getProperty('TIMETREE_AUTH_RETRY_AFTER'))>Date.now())throw Error('TimeTree sign-in is paused after a failed attempt; existing bookings retained');
    try{
      var login=ttFetch_('/auth/email/signin','',{uid:email,password:password,uuid:Utilities.getUuid().replace(/-/g,'')});
      cookie=ttCookie_(login.headers);if(!cookie)throw Error('TimeTree did not issue a session');
      props.setProperty('TIMETREE_SESSION_JSON',JSON.stringify({key:key,cookie:cookie}));
      props.setProperty('TIMETREE_AUTH_FAILURES','0');props.setProperty('TIMETREE_AUTH_RETRY_AFTER','0');
      return cookie;
    }catch(err){
      var failures=props.getProperty('TIMETREE_AUTH_FAILURE_KEY')===key?Math.min(6,Number(props.getProperty('TIMETREE_AUTH_FAILURES')||0)+1):1;
      props.setProperty('TIMETREE_AUTH_FAILURE_KEY',key);
      props.setProperty('TIMETREE_AUTH_FAILURES',String(failures));
      props.setProperty('TIMETREE_AUTH_RETRY_AFTER',String(Date.now()+Math.min(21600000,900000*Math.pow(2,failures-1))));
      throw Error('TimeTree sign-in failed; automatic retries paused: '+String(err.message||err));
    }
  }finally{lock.releaseLock();}
}
function ttSessionFetch_(path){
  var cookie=ttSessionCookie_();
  try{return ttFetch_(path,cookie);}catch(err){
    // A bad request or a permission error is not proof of an expired session.
    if(err.httpStatus!==401)throw err;
    var props=PropertiesService.getScriptProperties();
    var lock=LockService.getUserLock();lock.waitLock(15000);
    try{var s=JSON.parse(props.getProperty('TIMETREE_SESSION_JSON')||'null');if(s&&s.cookie===cookie)props.setProperty('TIMETREE_SESSION_JSON','');}
    finally{lock.releaseLock();}
    try{return ttFetch_(path,ttSessionCookie_());}catch(retryError){
      if(retryError.httpStatus===401){
        var latest=JSON.parse(props.getProperty('TIMETREE_SESSION_JSON')||'null');
        props.setProperty('TIMETREE_SESSION_JSON','');
        if(latest)props.setProperty('TIMETREE_AUTH_FAILURE_KEY',latest.key);
        props.setProperty('TIMETREE_AUTH_RETRY_AFTER',String(Date.now()+900000));
      }
      throw retryError;
    } // Renew at most once per read.
  }
}
