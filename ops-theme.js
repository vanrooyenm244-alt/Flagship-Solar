(function(){'use strict';
var key='hi-ops-theme-v1';
var doc=document.documentElement;
function apply(mode){mode=mode==='light'?'light':'dark';doc.setAttribute('data-ops-theme',mode);try{localStorage.setItem(key,mode)}catch(e){};var b=document.getElementById('opsThemeToggle');if(b){b.textContent=mode==='dark'?'☀ Light':'☾ Dark';b.setAttribute('aria-label','Switch to '+(mode==='dark'?'light':'dark')+' theme')}}
var mode='dark';try{mode=localStorage.getItem(key)||'dark'}catch(e){};
apply(mode);
function mount(){if(document.getElementById('opsThemeToggle'))return;var b=document.createElement('button');b.id='opsThemeToggle';b.type='button';b.className='ops-theme-toggle';b.title='Toggle dark/light interface';b.addEventListener('click',function(){apply(doc.getAttribute('data-ops-theme')==='dark'?'light':'dark')});document.body.appendChild(b);apply(doc.getAttribute('data-ops-theme'))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
