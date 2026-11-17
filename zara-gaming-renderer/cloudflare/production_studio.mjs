// Owner-only, free-allowance image previews for Zara Gaming Cloud.
// This module does not upload to YouTube or render videos.
const MODEL = '@cf/black-forest-labs/flux-1-schnell';
const CANONICAL_ORIGIN = 'https://zara-gaming-cloud.z16958420.workers.dev';
const MAX_DAILY_PREVIEWS = 3;
const encoder = new TextEncoder();
const COMMON = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function page(title, body, status = 200) {
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} — Zara Gaming Cloud</title>
  <style>body{background:#080d1c;color:#e7f3ff;font:16px system-ui;margin:0}main{max-width:740px;margin:auto;padding:36px 16px}h1{color:#87eaff}label{display:block;margin:16px 0 5px}select,input,button{width:100%;box-sizing:border-box;padding:12px;border-radius:8px;border:1px solid #506586;background:#182741;color:white}button{background:#1573b3;cursor:pointer;font-weight:700;margin-top:20px}p{line-height:1.5}small{color:#abbad1}a{color:#82ddff}</style><main><h1>${escapeHtml(title)}</h1>${body}<p><a href="/">Back to dashboard</a></p></main></html>`;
  return new Response(html, { status, headers: {
    ...COMMON,
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  } });
}

async function isOwner(candidate, secret) {
  if (!secret || !candidate || candidate.length < 20 || candidate.length > 256) return false;
  const digests = await Promise.all([candidate, secret].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const a = new Uint8Array(digests[0]);
  const b = new Uint8Array(digests[1]);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function readSmallForm(request) {
  if (!request.body) return new URLSearchParams();
  const reader = request.body.getReader();
  const parts = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { all.set(part, offset); offset += part.byteLength; }
  return new URLSearchParams(new TextDecoder().decode(all));
}

function originalPrompt(job) {
  const themed = {
    'GTA VI': 'a fictional contemporary coastal city at blue hour, sleek sports car on a rain-soaked avenue, dramatic neon reflections',
    'Fortnite': 'a vibrant stylized fantasy battleground, lone heroic silhouette in a dramatic last-second escape, playful dramatic lighting',
    'Minecraft': 'a beautiful voxel-inspired fantasy valley, blocky mountain cliffs and rivers, golden hour, curious adventurer silhouette',
    'Roblox': 'a whimsical blocky 3D virtual world, impossible obstacle course, joyful cinematic action scene',
    'Counter-Strike 2': 'a fictional competitive tactical arena, tense standoff between abstract unbranded teams, warm cinematic rim lighting',
    'ARC Raiders': 'an original science fiction extraction scene, stormy overgrown city with towering robots in the mist, hopeful survivor silhouette',
    'Original AI gaming fiction': 'a completely original science-fiction gaming universe, futuristic city, imposing atmospheric lighting, stunning cinematic environments',
  };
  const subject = themed[job.game] || themed['Original AI gaming fiction'];
  return `Original concept-art still for a gaming video. ${subject}. Photorealistic environmental textures, cinematic composition, rich details, atmospheric depth, realistic lighting, no real people. This is a purely fictional AI-generated concept, NOT gameplay or official promotional artwork. No brand names, trademarks, logos, on-screen text, watermarks, existing game characters, or copyrighted footage.`;
}

async function studioPage(env) {
  const records = await env.DB.prepare(`SELECT id, schedule_date, game, format, status FROM production_jobs ORDER BY schedule_date DESC, publish_time_pk DESC LIMIT 30`).all();
  const options = (records.results || []).map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(`${item.schedule_date} · ${item.game} · ${item.format} (${item.status})`)}</option>`).join('');
  return page('Original AI Still Preview', `<p>Generate an <strong>original concept image</strong> with Cloudflare Workers AI. Maximum ${MAX_DAILY_PREVIEWS} owner-requested previews/day. Uses only the free Workers AI allowance; paid video generation and public YouTube uploads remain OFF.</p>
  <p>Note: this shows a JPEG preview in the browser; save it locally for manual asset review. It is not a finished video or verified gameplay.</p>
  ${options ? `<form action="/studio/generate" method="post"><label for="job">Draft job</label><select id="job" name="job_id" required>${options}</select><label for="key">Private setup key</label><input id="key" name="setup_key" type="password" required minlength="20" autocomplete="off"><button type="submit">Generate one preview image</button></form>` : '<p>No jobs in the draft queue yet.</p>'}
  <small>Save the image from the browser using Save image as…; use only after reviewing rights and accuracy.</small>`);
}

async function generate(request, env) {
  const expectedOrigin = new URL(CANONICAL_ORIGIN).origin;
  const currentUrl = new URL(request.url);
  if (currentUrl.origin !== expectedOrigin || request.headers.get('Origin') !== expectedOrigin) {
    return page('Request blocked', '<p>Open the original Studio link in your browser.</p>', 403);
  }
  if (!(request.headers.get('Content-Type') || '').startsWith('application/x-www-form-urlencoded')) {
    return page('Invalid form', '<p>Use the browser form on the Studio page.</p>', 415);
  }
  if (Number(request.headers.get('Content-Length') || 0) > 2048) return page('Request too large', '<p>Please use the normal form.</p>', 413);
  const form = await readSmallForm(request);
  if (!form) return page('Request too large', '<p>Please use the normal form.</p>', 413);
  const key = String(form.get('setup_key') || '').trim();
  if (!(await isOwner(key, env.YOUTUBE_OWNER_SETUP_KEY))) return page('Access denied', '<p>Private setup key was incorrect.</p>', 403);
  const jobId = String(form.get('job_id') || '');
  if (!/^\d{4}-\d{2}-\d{2}:(short|long)$/.test(jobId)) return page('Invalid job', '<p>Choose a listed job.</p>', 400);
  const job = await env.DB.prepare('SELECT id, game, topic, status FROM production_jobs WHERE id=?').bind(jobId).first();
  if (!job) return page('Draft not found', '<p>The draft job is missing.</p>', 404);
  if (typeof env.AI?.run !== 'function') return page('AI not ready', '<p>Workers AI binding is missing.</p>', 503);

  const todayUTC = new Date().toISOString().slice(0, 10);
  await env.DB.prepare('INSERT OR IGNORE INTO image_preview_usage (day, request_count) VALUES (?,0)').bind(todayUTC).run();
  const attempt = await env.DB.prepare(`UPDATE image_preview_usage SET request_count = request_count + 1 WHERE day=? AND request_count < ?`).bind(todayUTC, MAX_DAILY_PREVIEWS).run();
  if (attempt.meta?.changes !== 1) return page('Daily image limit reached', '<p>Try again after 00:00 UTC. Nothing has been charged.</p>', 429);

  let output;
  try {
    output = await env.AI.run(MODEL, { prompt: originalPrompt(job), steps: 4 });
  } catch (error) {
    console.error(JSON.stringify({ event: 'preview_image_failed', type: error?.name || 'unknown', jobId }));
    return page('Image generation unavailable', '<p>Workers AI could not generate the image. Check its free allowance or capacity and try later.</p>', 503);
  }
  if (!output?.image || typeof output.image !== 'string' || output.image.length > 12_000_000) {
    return page('No image returned', '<p>The AI model did not return a valid image.</p>', 502);
  }
  const binary = atob(output.image);
  const jpeg = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new Response(jpeg, { headers: {
    ...COMMON,
    'Content-Type': 'image/jpeg',
    'Content-Disposition': `inline; filename="zara-preview-${jobId.replace(':','-')}.jpg"`,
  } });
}

export async function routeStudio(request, env) {
  const path = new URL(request.url).pathname;
  if (path === '/studio' && request.method === 'GET') return studioPage(env);
  if (path === '/studio/generate' && request.method === 'POST') return generate(request, env);
  if (path.startsWith('/studio')) return page('Not found', '<p>Unknown Studio route.</p>', 404);
  return null;
}
