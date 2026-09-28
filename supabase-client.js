/* Flagship Ops Supabase adapter.  It deliberately uses the REST API rather
 * than embedding a service key or making the PWA dependent on a build step. */
(function (global) {
  'use strict';

  var cfg = global.FLAGSHIP_SUPABASE_CONFIG || {};
  var base = String(cfg.url || '').replace(/\/$/, '');
  var key = cfg.anonKey || '';
  var enabled = /^https:\/\/.+\.supabase\.co$/i.test(base) && key && key.indexOf('YOUR_') === -1;
  var session = null;

  function headers(extra) {
    var h = { apikey: key };
    // Publishable keys identify the app; only JWTs belong in Authorization.
    var token = session && session.access_token;
    if (token) h.Authorization = 'Bearer ' + token;
    else if (key.indexOf('sb_publishable_') !== 0) h.Authorization = 'Bearer ' + key;
    Object.keys(extra || {}).forEach(function (name) { h[name] = extra[name]; });
    return h;
  }
  function request(path, options) {
    if (!enabled) return Promise.reject(new Error('Supabase has not been configured.'));
    options = options || {};
    options.headers = headers(options.headers);
    return fetch(base + path, options).then(function (response) {
      if (response.status === 204) return null;
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) throw new Error(body.message || body.error_description || body.hint || 'Supabase request failed (' + response.status + ')');
        return body;
      });
    });
  }
  function auth(path, body) {
    return request('/auth/v1/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  function rest(table, query, options) {
    return request('/rest/v1/' + table + (query ? '?' + query : ''), options);
  }
  function profileFor(user) {
    return rest('profiles', 'id=eq.' + encodeURIComponent(user.id) + '&select=id,full_name,preferred_language', { method: 'GET' })
      .then(function (rows) { return rows[0] || { id: user.id, full_name: user.email, preferred_language: 'en' }; });
  }
  function toLegacyCard(row) {
    var card = JSON.parse(JSON.stringify(row.data || {}));
    card.id = row.client_id || card.id;
    card.status = row.status || card.status || 'DRAFT';
    card.updated = card.updated || new Date(row.updated_at || Date.now()).getTime();
    card.company_id = row.company_id;
    card.remote_id = row.id;
    return card;
  }

  global.FlagshipSupabase = {
    enabled: function () { return !!enabled; },
    configured: function () { return !!enabled; },
    getSession: function () { return session; },
    signIn: function (email, password) {
      return auth('token?grant_type=password', { email: email, password: password }).then(function (s) {
        session = s;
        return profileFor(s.user).then(function (profile) { return { session: s, user: s.user, profile: profile }; });
      });
    },
    signUp: function (email, password, fullName) {
      return auth('signup', { email: email, password: password, data: { full_name: fullName } });
    },
    restore: function (saved) {
      if (!enabled || !saved || !saved.access_token) return Promise.resolve(null);
      session = saved;
      return request('/auth/v1/user', { method: 'GET' }).then(function (user) {
        return profileFor(user).then(function (profile) { return { session: session, user: user, profile: profile }; });
      }).catch(function () { session = null; return null; });
    },
    signOut: function () {
      var end = enabled && session ? request('/auth/v1/logout', { method: 'POST' }).catch(function () {}) : Promise.resolve();
      session = null;
      return end;
    },
permissionsForMembership: function (membershipId) {
  if (!session || !session.user || !membershipId) return Promise.resolve([]);
  return Promise.all([
    rest('company_memberships','id=eq.'+encodeURIComponent(membershipId)+'&select=id,company_id,role_id,role:roles(name)',{method:'GET'}),
    rest('role_permissions','select=permission_key,role_id',{method:'GET'}),
    rest('membership_permissions','membership_id=eq.'+encodeURIComponent(membershipId)+'&select=permission_key,allowed',{method:'GET'})
  ]).then(function(parts){var membership=(parts[0]||[])[0];if(!membership)return [];var map={};(parts[1]||[]).forEach(function(x){if(x.role_id===membership.role_id)map[x.permission_key]=true;});(parts[2]||[]).forEach(function(x){map[x.permission_key]=!!x.allowed;});return Object.keys(map).filter(function(k){return map[k];}).sort();});
},
setMembershipPermission: function (membershipId, permissionKey, allowed) {
  if (!session || !session.user) return Promise.reject(new Error('Sign in before changing permissions.'));
  return request('/rest/v1/membership_permissions?on_conflict=membership_id,permission_key',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({membership_id:membershipId,permission_key:permissionKey,allowed:!!allowed})});
},
listPermissionCatalogue: function () { return rest('permissions','select=key,description&order=key.asc',{method:'GET'}); },
memberships: function () {
  if (!session || !session.user) return Promise.resolve([]);
  return rest('company_memberships', 'user_id=eq.' + encodeURIComponent(session.user.id) + '&active=eq.true&select=id,company_id,role_id,role:roles(name),companies(name,slug)', { method: 'GET' });
},

listCompanyMemberships: function (companyId) { if (!session || !session.user || !companyId) return Promise.resolve([]); return rest('company_memberships','company_id=eq.'+encodeURIComponent(companyId)+'&select=id,user_id,active,role_id,role:roles(name),profile:profiles(full_name)',{method:'GET'}); },


listCalendarEvents: function (companyId) {
  if (!session || !session.user || !companyId) return Promise.resolve([]);
  return rest('calendar_events','company_id=eq.'+encodeURIComponent(companyId)+'&select=*&order=starts_at.asc',{method:'GET'});
},
saveCalendarEvent: function (event, companyId) {
  if (!session || !session.user) return Promise.reject(new Error('Sign in to Supabase before scheduling.'));
  if (!companyId) return Promise.reject(new Error('Company is required before scheduling.'));
  if (!event || !event.id || !event.customer || !event.date) return Promise.reject(new Error('Calendar event ID, customer and date are required.'));
  var start=event.date+'T'+(event.startTime||'00:00')+':00';
  var end=event.endTime ? event.date+'T'+event.endTime+':00' : null;
  var payload={id:event.id,company_id:companyId,title:event.customer+(event.site?' — '+event.site:''),starts_at:start,ends_at:end,created_by:session.user.id};
  return request('/rest/v1/calendar_events?on_conflict=id&select=*',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(payload)})
    .then(function(rows){if(!rows||!rows[0]||rows[0].id!==event.id)throw new Error('Missing Calendar acknowledgement.');return rows[0];});
},

listPrices: function () {
  return rest(
    'price_items',
    'select=*&active=eq.true&order=category.asc,description.asc',
    { method: 'GET' }
  ).then(function (rows) {
    return (rows || []).map(function (p) {
      return {
        id: p.id, company_id: p.company_id, category: p.category || '', supplier: p.supplier || '',
        code: p.code || '', description: p.description || '', descriptionEn: p.description_en || '',
        unit: p.unit || 'each', type: p.price_type || 'Cost', cost: Number(p.cost || 0),
        markup: p.markup == null ? '' : Number(p.markup), install: Number(p.install || 0),
        spec: p.spec || '', active: p.active !== false
      };
    });
  });
},

    listJobCards: function () {
      return rest('job_cards', 'select=*&order=updated_at.desc', { method: 'GET' }).then(function (rows) { return rows.map(toLegacyCard); });
    },
    saveJobCard: function (card) {
      if (!session || !session.user) return Promise.reject(new Error('Sign in to Supabase before saving job cards.'));
      var payload = {
        client_id: card.id,
        company_id: card.company_id || null,
        status: card.status || 'DRAFT',
        data: card,
        updated_at: new Date().toISOString()
      };
      return request('/rest/v1/job_cards?on_conflict=client_id&select=*', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(payload)
      }).then(function (rows) { if(!rows||!rows[0]||rows[0].client_id!==card.id)throw new Error('Missing Job Card acknowledgement.');return toLegacyCard(rows[0]); });
    },
    uploadJobCardPhoto: function (jobCardId, file, contentType) {
      if (!session || !session.user) return Promise.reject(new Error('Sign in to upload photos.'));
      var ext=(contentType||file.type||'image/jpeg').split('/')[1]||'jpg';if(ext==='jpeg')ext='jpg';
      var name = encodeURIComponent(session.user.id) + '/job-cards/' + encodeURIComponent(jobCardId) + '/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
      return request('/storage/v1/object/job-card-photos/' + name, {
        method: 'POST', headers: { 'Content-Type': contentType || file.type || 'image/jpeg', 'x-upsert': 'false' }, body: file
      }).then(function () { return { bucket: 'job-card-photos', path: name }; });
    },
    signedJobCardPhotoUrl: function (path, expiresIn) {
      if (!session || !session.user || !path) return Promise.reject(new Error('Sign in to view photos.'));
      return request('/storage/v1/object/sign/job-card-photos/' + path, {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:expiresIn||3600})
      }).then(function(x){var u=x&&x.signedURL;if(!u)throw new Error('Missing signed photo URL.');return u.indexOf('http')===0?u:base+'/storage/v1'+u;});
    }
  };
})(window);
