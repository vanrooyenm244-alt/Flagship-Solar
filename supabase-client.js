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
    var h = { apikey: key, Authorization: 'Bearer ' + (session && session.access_token || key) };
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
    var card = row.data || {};
    card.id = row.client_id || card.id;
    card.status = row.status || card.status || 'DRAFT';
    card.updated = new Date(row.updated_at || Date.now()).getTime();
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
memberships: function () {
  if (!session || !session.user) return Promise.resolve([]);
  return rest('company_memberships', 'user_id=eq.' + encodeURIComponent(session.user.id) + '&active=eq.true&select=company_id,role:roles(name),companies(name,slug)', { method: 'GET' });
},

listPrices: function () {
  return rest(
    'price_items',
    'select=*&active=eq.true&order=category.asc,description.asc',
    { method: 'GET' }
  );
},

listJobCards: function () {
  return rest('job_cards', 'select=*&order=updated_at.desc', { method: 'GET' }).then(function (rows) {
    return rows.map(toLegacyCard);
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
      return request('/rest/v1/job_cards?on_conflict=client_id&select=representation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(payload)
      }).then(function (rows) { return rows && rows[0] ? toLegacyCard(rows[0]) : card; });
    },
    uploadJobCardPhoto: function (jobCardId, file, contentType) {
      if (!session || !session.user) return Promise.reject(new Error('Sign in to upload photos.'));
      var name = 'job-cards/' + encodeURIComponent(jobCardId) + '/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.jpg';
      return request('/storage/v1/object/job-card-photos/' + name, {
        method: 'POST', headers: { 'Content-Type': contentType || 'image/jpeg', 'x-upsert': 'false' }, body: file
      }).then(function () { return { bucket: 'job-card-photos', path: name }; });
    }
  };
})(window);
