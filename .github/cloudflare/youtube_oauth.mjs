// YouTube OAuth for the existing Zara Gaming Cloud editorial Worker.
// No automatic publishing and no API credentials in source code.
const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
const CALLBACK_URL = 'https://zara-gaming-cloud.z16958420.workers.dev/auth/youtube/callback';
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const OAUTH_COOKIE = 'zara_youtube_oauth_state';
const encoder = new TextEncoder();

const safeHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function page(title, body, status = 200, extra = {}) {
  const content = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} — Zara Gaming Cloud</title><style>body{font:16px system-ui,Arial;background:#070b17;color:#eaf2ff;margin:0}main{max-width:620px;margin:8vh auto;padding:24px}h1{color:#91eafa}p{line-height:1.6}a{color:#85ddff}input{box-sizing:border-box;width:100%;padding:14px;border:1px solid #456; border-radius:9px;background:#101a30;color:white;margin:8px 0 15px}button{padding:12px 22px;border:0;background:#7de6f4;color:#081422;font-weight:700;border-radius:9px;cursor:pointer}.info{background:#1a253c;padding:16px;border-radius:10px}</style><main><h1>${escapeHtml(title)}</h1>${body}<p><a href="/">Back to dashboard</a></p></main></html>`;
  return new Response(content, { status, headers: {...safeHeaders, 'Content-Type':'text/html; charset=utf-8', ...extra} });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {status, headers:{...safeHeaders,'Content-Type':'application/json'}});
}

function bytesToHex(bytes) {
  return [...bytes].map(v => v.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex || '')) throw new Error('Missing encryption configuration');
  return new Uint8Array(hex.match(/../g).map(v => parseInt(v, 16)));
}

function toBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text) {
  if (typeof text !== 'string' || text.length > 10_000 || !/^[a-zA-Z0-9+/=]+$/.test(text)) {
    throw new Error('Invalid encrypted token bytes');
  }
  return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i=0; i<a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

async function digest(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

async function ownerAuthorized(candidate, expected) {
  if (!expected || !candidate || candidate.length > 256) return false;
  const [left, right] = await Promise.all([digest(candidate), digest(expected)]);
  return constantTimeEqual(left, right);
}

function googleReady(env) {
  return !!(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET && env.YOUTUBE_OWNER_SETUP_KEY && env.YOUTUBE_TOKEN_KEY);
}

function cookieFrom(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const prefix = `${name}=`;
  const match = cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

async function encryptRefreshToken(refresh, keyHex) {
  const key = await crypto.subtle.importKey('raw', hexToBytes(keyHex), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name:'AES-GCM',iv}, key, encoder.encode(refresh));
  return {iv:toBase64(iv), encrypted:toBase64(new Uint8Array(ct))};
}

export async function youtubeConnected(env) {
  try {
    const row = await env.DB.prepare("SELECT 1 AS ok FROM youtube_connection WHERE owner='zain' LIMIT 1").first();
    return !!row;
  } catch {
    return false;
  }
}

/** Read the existing owner-granted refresh token only inside this Worker.
 * Never expose the refresh token or access token in API responses or logs.
 */
export async function googleUploadAccessToken(env) {
  if (!googleReady(env)) throw new Error('youtube_oauth_not_configured');
  const record = await env.DB.prepare("SELECT refresh_iv, refresh_cipher FROM youtube_connection WHERE owner='zain'").first();
  if (!record) throw new Error('youtube_owner_not_connected');
  const key = await crypto.subtle.importKey('raw', hexToBytes(env.YOUTUBE_TOKEN_KEY), 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv:fromBase64(record.refresh_iv)}, key, fromBase64(record.refresh_cipher));
  const refresh = new TextDecoder().decode(plain);
  const response = await fetch(GOOGLE_TOKEN, {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:env.YOUTUBE_CLIENT_ID,client_secret:env.YOUTUBE_CLIENT_SECRET,
      refresh_token:refresh,grant_type:'refresh_token'}),
  });
  if (!response.ok) {
    console.error(JSON.stringify({event:'google_refresh_failed',status:response.status}));
    throw new Error('youtube_refresh_failed');
  }
  const token = await response.json();
  if (!token.access_token || !Number.isFinite(token.expires_in) || token.expires_in <= 0) throw new Error('google_access_token_missing');
  return token.access_token;
}

async function startPage(env) {
  if (!googleReady(env)) {
    return page('YouTube connection not ready', '<p class="info">The OAuth connection code is installed, but Google Client ID and Client Secret have not been added to this Worker as secrets yet. No YouTube access has been granted.</p>', 503);
  }
  return page('Connect your YouTube channel', `<p>Only the account owner can start this connection. Your videos will <strong>not</strong> be uploaded automatically at this stage.</p><form method="post" action="/auth/youtube/start"><label for="setup-key">Private setup key</label><input id="setup-key" name="setup_key" type="password" autocomplete="off" required minlength="20"><button type="submit">Continue to Google consent</button></form><p class="info">Google will ask permission to upload YouTube videos. This permission is saved securely for future use, but publishing remains disabled until final review.</p>`);
}

async function startOAuth(request, env) {
  if (!googleReady(env)) return page('Not configured', '<p>Google OAuth credentials are still missing.</p>', 503);
  // Only the canonical Worker host may start OAuth. A private owner key and one-use
  // state cookie protect the flow, including when a browser alters Origin.
  if (new URL(request.url).origin !== new URL(CALLBACK_URL).origin) return page('Request blocked','<p>Open the original connection URL.</p>',403);
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.startsWith('application/x-www-form-urlencoded')) return json({error:'invalid_form'},415);
  if (Number(request.headers.get('Content-Length') || 0) > 4096) return json({error:'form_too_large'},413);
  const form = await request.formData();
  if (!await ownerAuthorized(String(form.get('setup_key') || '').trim(), env.YOUTUBE_OWNER_SETUP_KEY)) {
    return page('Access denied','<p>The private setup key was incorrect.</p>',403);
  }
  const stateBytes = crypto.getRandomValues(new Uint8Array(32));
  const state = bytesToHex(stateBytes);
  const stateHash = bytesToHex(await digest(state));
  const now = Math.floor(Date.now()/1000);
  await env.DB.prepare('INSERT INTO youtube_oauth_states(state_hash, expires_at) VALUES (?, ?)').bind(stateHash, now + 600).run();
  const authUrl = new URL(GOOGLE_AUTH);
  authUrl.searchParams.set('client_id', env.YOUTUBE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', CALLBACK_URL);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', UPLOAD_SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);
  const googleLink = escapeHtml(authUrl.href);
  return page('Continue with Google', `<p>Private Setup Key accepted. Click below to authorize YouTube uploads in Google. This does not publish any video yet.</p><p><a href="${googleLink}" rel="noreferrer" style="display:inline-block;padding:14px 20px;background:#7de6f4;color:#091422;border-radius:9px;text-decoration:none;font-weight:bold">Continue with Google →</a></p><p class="info">If Google doesn't open, use Chrome directly and click the button again. This link expires in 10 minutes.</p>`, 200,
    {'Set-Cookie':`${OAUTH_COOKIE}=${state}; Path=/auth/youtube; Max-Age=600; Secure; HttpOnly; SameSite=Lax`});
}

async function oauthCallback(request, env) {
  if (!googleReady(env)) return page('Not configured','<p>The owner needs to set up Google credentials.</p>',503);
  const url = new URL(request.url);
  const returnedError = url.searchParams.get('error');
  if (returnedError) return page('Google permission not granted','<p>You can try again later.</p>',400,{'Set-Cookie':`${OAUTH_COOKIE}=; Path=/auth/youtube; Max-Age=0; Secure; HttpOnly; SameSite=Lax`});
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const cookie = cookieFrom(request, OAUTH_COOKIE);
  if (!/^[a-f0-9]{64}$/.test(state) || !constantTimeEqual(encoder.encode(state),encoder.encode(cookie)) || !code || code.length > 4096) {
    return page('Connection expired','<p>Open the connection page and try again.</p>',400);
  }
  const stateHash = bytesToHex(await digest(state));
  const now = Math.floor(Date.now()/1000);
  const removed = await env.DB.prepare('DELETE FROM youtube_oauth_states WHERE state_hash=? AND expires_at>=?').bind(stateHash, now).run();
  if (removed.meta.changes !== 1) return page('Connection expired','<p>This link has already been used or expired.</p>',400);

  const response = await fetch(GOOGLE_TOKEN, {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({client_id:env.YOUTUBE_CLIENT_ID,client_secret:env.YOUTUBE_CLIENT_SECRET,code,redirect_uri:CALLBACK_URL,grant_type:'authorization_code'})});
  if (!response.ok) {
    // Read only the standard OAuth error identifier; never expose tokens, secrets or raw descriptions.
    const failure = await response.json().catch(() => ({}));
    const reason = typeof failure.error === 'string' && /^[a-z_]{3,48}$/.test(failure.error)
      ? failure.error : 'token_exchange_failed';
    const guidance = reason === 'invalid_client'
      ? 'The Google Client ID and Client Secret may not match, or the Secret may be disabled. Recheck the Google OAuth Web client and Cloudflare Secret.'
      : reason === 'invalid_grant'
        ? 'The authorization code may be expired, previously used, or associated with a different redirect URI. Start a new connection from the dashboard.'
        : reason === 'redirect_uri_mismatch'
          ? 'The authorized redirect URI must exactly match the Cloudflare callback URL registered in Google Cloud.'
          : 'Google did not accept the token request. Recheck the Google OAuth client settings and retry with a fresh consent.';
    console.error(JSON.stringify({event:'youtube_token_exchange_failed',http_status:response.status,reason}));
    return page('Google connection failed', `<p>Google error code: <strong>${escapeHtml(reason)}</strong></p><p>${guidance}</p>`,502);
  }
  const tokens = await response.json();
  if (!tokens.refresh_token || !String(tokens.scope || '').split(' ').includes(UPLOAD_SCOPE)) {
    return page('Permission incomplete','<p>Google did not return a refresh token with YouTube upload permission. Please try again with consent.</p>',409);
  }
  const sealed = await encryptRefreshToken(tokens.refresh_token, env.YOUTUBE_TOKEN_KEY);
  await env.DB.prepare(`INSERT INTO youtube_connection (owner,refresh_iv,refresh_cipher,scopes,connected_at)
    VALUES ('zain',?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(owner) DO UPDATE SET refresh_iv=excluded.refresh_iv,refresh_cipher=excluded.refresh_cipher,scopes=excluded.scopes,connected_at=CURRENT_TIMESTAMP`).bind(sealed.iv,sealed.encrypted,tokens.scope).run();
  return page('YouTube connected','<p>Your Google permission has been saved in encrypted storage. Video uploads and paid generation are still OFF until production review.</p>',200,{'Set-Cookie':`${OAUTH_COOKIE}=; Path=/auth/youtube; Max-Age=0; Secure; HttpOnly; SameSite=Lax`});
}

export async function routeYouTube(request, env) {
  const path = new URL(request.url).pathname;
  if (path === '/auth/youtube' && request.method === 'GET') return startPage(env);
  if (path === '/auth/youtube/start' && request.method === 'POST') return startOAuth(request, env);
  if (path === '/auth/youtube/callback' && request.method === 'GET') return oauthCallback(request, env);
  if (path.startsWith('/auth/youtube')) return json({error:'not_found'},404);
  return null;
}

