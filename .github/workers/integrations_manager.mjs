// Zara Gaming Cloud: low-cost integration registry and owner-only editorial ideas.
// No external AI is called unless an administrator separately configures a
// self-hosted, HTTPS OpenAI-compatible router and explicitly opts in.
// Uploaded third-party demonstration clips are never used as game assets.

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
const MAX_DAILY_REQUESTS = 3;
const MAX_DAILY_RESERVED_TOKENS = 2400;
const TOKENS_PER_REQUEST = 800;
const VALID_TOPICS = new Set(['danger-zones', 'locations', 'weapons', 'hidden-secrets', 'vehicles', 'fights', 'exploration', 'funny-moments']);
const VALID_GAMES = new Set(['Minecraft', 'Fortnite', 'Roblox', 'Counter-Strike 2', 'ARC Raiders', 'GTA V', 'GTA VI']);

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: HEADERS });
}

async function sameSecret(provided, expected) {
  if (!expected || typeof provided !== 'string') return false;
  const data = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', data.encode(provided)),
    crypto.subtle.digest('SHA-256', data.encode(expected)),
  ]);
  // WebCrypto's timingSafeEqual is not implemented in every JS test runtime.
  // Both SHA-256 buffers have fixed length; no data-dependent early exit.
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

async function readSmallJSON(request) {
  if (!request.body) throw new Error('empty_body');
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 4096) throw new Error('body_too_large');
      chunks.push(value);
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(result));
  } finally {
    reader.releaseLock();
  }
}

function fixedOutline(game, topic, count, format) {
  const shortNames = {
    'danger-zones': 'DANGER ZONES',
    locations: 'PLACES',
    weapons: 'WEAPONS',
    'hidden-secrets': 'HIDDEN SECRETS',
    vehicles: 'VEHICLES',
    fights: 'FIGHT SCENES',
    exploration: 'EXPLORATION SPOTS',
    'funny-moments': 'FUNNY MOMENTS',
  };
  return {
    title: `TOP ${count} ${shortNames[topic]} IN ${game.toUpperCase()}`,
    format,
    entries: Array.from({ length: count }, (_, i) => ({
      rank: count - i,
      label: `VERIFY ${shortNames[topic]} #${count - i}`,
      edit: i % 2 ? 'neon-sweep' : 'cinematic-pulse',
      footage: 'Rights-cleared gameplay clip required; no clip selected',
      fact_checked: false,
    })),
    music: 'original-generated-synthwave',
    voiceover: false,
    may_publish: false,
  };
}

async function reserveBudget(db, requestId) {
  const day = new Date().toISOString().slice(0, 10);
  const insert = await db.prepare(`INSERT OR IGNORE INTO zara_api_requests
      (request_id, day, provider, reserved_tokens, state) VALUES (?, ?, 'freellmapi', ?, 'pending')`)
    .bind(requestId, day, TOKENS_PER_REQUEST).run();
  if (insert.meta?.changes !== 1) return { ok: false, code: 'duplicate_request' };
  await db.prepare(`INSERT OR IGNORE INTO zara_api_daily_budget
      (day, request_count, reserved_tokens, completed_count, failure_count) VALUES (?, 0, 0, 0, 0)`)
    .bind(day).run();
  const update = await db.prepare(`UPDATE zara_api_daily_budget
      SET request_count=request_count+1, reserved_tokens=reserved_tokens+?
      WHERE day=? AND request_count<? AND reserved_tokens+?<=?`)
    .bind(TOKENS_PER_REQUEST, day, MAX_DAILY_REQUESTS, TOKENS_PER_REQUEST, MAX_DAILY_RESERVED_TOKENS).run();
  if (update.meta?.changes !== 1) {
    await db.prepare('UPDATE zara_api_requests SET state=? WHERE request_id=?')
      .bind('rejected_budget', requestId).run();
    return { ok: false, code: 'daily_api_budget_reached' };
  }
  return { ok: true, day };
}

async function recordResult(db, requestId, day, success, tokens) {
  await db.batch([
    db.prepare('UPDATE zara_api_requests SET state=?, actual_tokens=? WHERE request_id=?')
      .bind(success ? 'completed' : 'failed', tokens, requestId),
    db.prepare(`UPDATE zara_api_daily_budget
      SET completed_count=completed_count+?, failure_count=failure_count+?
      WHERE day=?`).bind(success ? 1 : 0, success ? 0 : 1, day),
  ]);
}

function routerAvailable(env) {
  return env.ZARA_LLM_ROUTER_ENABLED === 'true' &&
    /^https:\/\/[a-z0-9.-]+(?::443)?\/?$/i.test(env.ZARA_LLM_ROUTER_BASE_URL || '') &&
    !!env.ZARA_LLM_ROUTER_API_KEY;
}

async function tryRouter(env, info) {
  const base = env.ZARA_LLM_ROUTER_BASE_URL.replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Authorization': `Bearer ${env.ZARA_LLM_ROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'auto', stream: false, max_tokens: 300, temperature: 0.5,
        messages: [
          { role: 'system', content: 'You suggest factual gaming ranking topics. Never fabricate a real location, weapon, or cheat code. Respond with brief creative editing tips only, without claims of verification.' },
          { role: 'user', content: `Game ${info.game}; topic ${info.topic}; ${info.count} ranks; ${info.format}. Give 3 cinematic edit suggestions. No voice.` },
        ],
      }),
    });
    if (!response.ok) throw new Error(`router_http_${response.status}`);
    const body = await response.text();
    if (body.length > 20_000) throw new Error('router_output_too_large');
    const parsed = JSON.parse(body);
    const suggestion = parsed?.choices?.[0]?.message?.content;
    if (typeof suggestion !== 'string' || suggestion.length > 1800) throw new Error('router_bad_output');
    return { suggestion, actual_tokens: Number.isSafeInteger(parsed?.usage?.total_tokens) ? parsed.usage.total_tokens : null };
  } finally {
    clearTimeout(timer);
  }
}

async function status(env) {
  const day = new Date().toISOString().slice(0, 10);
  const usage = await env.DB.prepare(`SELECT request_count, reserved_tokens, completed_count, failure_count
    FROM zara_api_daily_budget WHERE day=?`).bind(day).first();
  return json({
    project: 'Zara Gaming Cloud',
    source_reviews: [
      { id: 'motion-prompt-library', role: 'editing inspiration', status: 'reference_only', note: 'Prompt examples are not an FFmpeg API; no external animation assets copied.' },
      { id: 'freellmapi', role: 'optional self-hosted LLM router', status: routerAvailable(env) ? 'configured_optional' : 'awaiting_owner_https_endpoint_and_credentials', note: 'Aggregated advertised token capacity is not a grant of tokens. Personal experimentation only.' },
      { id: 'unspecified-10b-plugin', role: 'claimed free-token model failover', status: 'unverified_not_installed', note: 'No verified repository, publisher, API or terms found in the video.' },
    ],
    editing: { engine: 'FFmpeg via GitHub Actions', available_presets: ['cinematic-pulse', 'neon-sweep', 'clean'], gameplay_rights_check: 'required', automatic_publication: false },
    api_budget: {
      day_utc: day, daily_max_requests: MAX_DAILY_REQUESTS,
      daily_reserved_token_limit: MAX_DAILY_RESERVED_TOKENS,
      request_token_reservation: TOKENS_PER_REQUEST,
      used_requests: usage?.request_count || 0,
      reserved_tokens: usage?.reserved_tokens || 0,
      successful_calls: usage?.completed_count || 0,
      failed_calls: usage?.failure_count || 0,
      external_api_calls_enabled: routerAvailable(env),
    },
    storage: 'Cloudflare R2 not enabled on this account; review artifacts via GitHub Actions only',
    uploading: 'public automation disabled, consent and rights review required',
  });
}

async function ideas(request, env) {
  if (!(await sameSecret(request.headers.get('X-Zara-Owner-Key') || '', env.YOUTUBE_OWNER_SETUP_KEY))) {
    return json({ error: 'owner_authentication_required' }, 401);
  }
  let data;
  try { data = await readSmallJSON(request); }
  catch { return json({ error: 'invalid_or_oversized_json' }, 400); }
  if (!data || !VALID_GAMES.has(data.game) || !VALID_TOPICS.has(data.topic) ||
      ![5, 10].includes(data.count) || !['short', 'long'].includes(data.format) ||
      typeof data.request_id !== 'string' || !/^[a-zA-Z0-9_-]{8,64}$/.test(data.request_id)) {
    return json({ error: 'invalid_game_topic_rank_format_or_request_id' }, 400);
  }
  const result = fixedOutline(data.game, data.topic, data.count, data.format);
  if (!routerAvailable(env)) return json({ source: 'built_in_template', api_tokens_used: 0, requires_fact_and_rights_review: true, outline: result });
  const budget = await reserveBudget(env.DB, data.request_id);
  if (!budget.ok) return json({ error: budget.code, local_fallback: result }, budget.code === 'duplicate_request' ? 409 : 429);
  try {
    const optional = await tryRouter(env, data);
    await recordResult(env.DB, data.request_id, budget.day, true, optional.actual_tokens);
    return json({ source: 'owner_configured_router', api_tokens_reported: optional.actual_tokens,
      reserved_tokens: TOKENS_PER_REQUEST, requires_fact_and_rights_review: true,
      suggestions: optional.suggestion, outline: result });
  } catch (error) {
    await recordResult(env.DB, data.request_id, budget.day, false, null);
    console.error(JSON.stringify({ event: 'optional_router_failed', kind: error?.name || 'unknown' }));
    return json({ source: 'built_in_fallback', warning: 'external_router_unavailable',
      api_tokens_reported: null, reserved_tokens: TOKENS_PER_REQUEST,
      requires_fact_and_rights_review: true, outline: result });
  }
}

export async function routeIntegrations(request, env) {
  const path = new URL(request.url).pathname;
  if (path === '/integrations/status' && request.method === 'GET') return status(env);
  if (path === '/integrations/ideas' && request.method === 'POST') return ideas(request, env);
  if (path.startsWith('/integrations/')) return json({ error: 'not_found' }, 404);
  return null;
}
