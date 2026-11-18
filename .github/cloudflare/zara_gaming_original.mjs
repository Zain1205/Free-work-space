// Zara Gaming Cloud: editorial scheduler, not an uploader or paid AI generator.
// No API credentials are embedded in this source.

export const SHORTS = {
  Monday: { game: 'GTA VI', topic: 'Verified details with original explanation', template: 'Hidden Secret Reveal' },
  Tuesday: { game: 'Fortnite', topic: 'Clutch moment and what made it work', template: 'Impossible Clutch' },
  Wednesday: { game: 'Minecraft', topic: 'Tested mechanic or hidden trick', template: 'Hidden Secret Reveal' },
  Thursday: { game: 'Roblox', topic: 'Funny challenge with a surprising twist', template: 'Unexpected Funny Moment' },
  Friday: { game: 'GTA VI', topic: 'Fresh verified detail, no leaks or reuploads', template: 'Explosive Countdown' },
  Saturday: { game: 'Counter-Strike 2', topic: 'Unexpected comeback and original analysis', template: 'Impossible Clutch' },
  Sunday: { game: 'ARC Raiders', topic: 'Dangerous extraction or lucky escape', template: 'Last-Second Escape' },
};

export const LONG_DAYS = new Set(['Wednesday', 'Sunday']);

export function pakistanCalendar(utcMs) {
  const at = new Date(utcMs);
  const date = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at);
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi', weekday: 'long',
  }).format(at);
  return { date, day };
}

export function plannedJob(kind, utcMs) {
  const { date, day } = pakistanCalendar(utcMs);
  if (kind === 'long' && !LONG_DAYS.has(day)) return null;
  const dayPlan = SHORTS[day];
  if (!dayPlan) throw new Error('Unrecognized weekday');
  return {
    id: `${date}:${kind}`,
    schedule_date: date,
    publish_time_pk: kind === 'short' ? '19:00' : '21:00',
    format: kind,
    game: kind === 'short' ? dayPlan.game : 'Original AI gaming fiction',
    topic: kind === 'short' ? dayPlan.topic : `Original 2–3 minute fictional gaming story (${day})`,
    template: kind === 'short' ? dayPlan.template : 'Original widescreen AI storyboard',
    status: kind === 'short' ? 'awaiting_rights_cleared_assets' : 'awaiting_original_ai_images',
  };
}

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
};

const json = (obj, status = 200) => new Response(JSON.stringify(obj, null, 2), {
  status,
  headers: { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
});

function escapeHtml(x) {
  return String(x).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

async function getJobs(env) {
  const result = await env.DB.prepare(`
    SELECT id, schedule_date, publish_time_pk, format, game, topic, template, status, created_at
    FROM production_jobs ORDER BY schedule_date DESC, publish_time_pk DESC LIMIT 30
  `).all();
  return result.results || [];
}

function renderDashboard(jobs) {
  const rows = jobs.length ? jobs.map(job => `<tr><td>${escapeHtml(job.schedule_date)}</td><td>${escapeHtml(job.publish_time_pk)} PK</td><td>${escapeHtml(job.format)}</td><td>${escapeHtml(job.game)}</td><td>${escapeHtml(job.status)}</td></tr>`).join('')
    : '<tr><td colspan="5">No scheduled draft jobs yet. The first Cron run will add them.</td></tr>';
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Zara Gaming Cloud — Setup Dashboard</title>
  <style>body{font:16px system-ui,Arial;margin:0;background:#070b17;color:#ecf3ff}main{max-width:980px;margin:auto;padding:40px 18px}h1{font-size:2rem;color:#91eafa}p{line-height:1.6;color:#c7d3eb}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:24px 0}.card{border:1px solid #304369;background:#121d35;padding:20px;border-radius:12px}.card b{display:block;font-size:1.2rem;color:#fff}.notice{background:#382b12;border:1px solid #d9a648;border-radius:12px;padding:15px}table{border-collapse:collapse;width:100%;background:#101a30}td,th{padding:12px;border-bottom:1px solid #2d3c58;text-align:left}a{color:#7fe1ff}.scroll{overflow-x:auto}</style>
  <main><h1>Zara Gaming Cloud</h1><p>Editorial scheduler and draft queue. Video generation and channel publishing are deliberately disconnected until the account owner authorizes them.</p>
  <div class="cards"><div class="card"><b>Cloud Worker</b>Installed</div><div class="card"><b>Cron scheduling</b>Draft queue only</div><div class="card"><b>Canva templates</b>5 editable layouts</div><div class="card"><b>YouTube OAuth</b>Not linked</div></div>
  <p class="notice"><strong>Publishing OFF.</strong> AAA selected: original AI images + FFmpeg movement, subject to free allowance and asset review. No third-party videos downloaded, no paid AI calls, no videos generated or uploaded by this Worker.</p>
  <h2>Planned editorial jobs</h2><div class="scroll"><table><thead><tr><th>Date</th><th>Time</th><th>Format</th><th>Topic game</th><th>Blocking state</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p>Planned cadence: 7 vertical Shorts (daily 19:00 PK) + 2 original AI videos (Wed/Sun 21:00 PK). Content rights and first-batch human review are mandatory.</p>
  <p><a href="/health">Health JSON</a> · <a href="/calendar">Calendar JSON</a> · <a href="/jobs">Draft jobs JSON</a></p></main></html>`;
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET') return json({ error: 'read_only' }, 405);
    const path = new URL(request.url).pathname;
    if (path === '/health') {
      return json({ service: 'zara-gaming-cloud', stage: 'editorial_scheduler',
        worker: 'deployed', youtube_oauth_connected: false, publishing_enabled: false,
        ai_provider: 'Cloudflare Workers AI',
        ai_binding_connected: typeof env.AI?.run === 'function',
        ai_image_model_planned: '@cf/black-forest-labs/flux-1-schnell',
        ai_video_strategy: 'original_ai_stills_animated_with_ffmpeg',
        paid_ai_video_model_enabled: false,
        image_generation_budget_mode: 'free_allowance_only',
        ai_generation_enabled: false, rendering_connected: false, paid_calls_enabled: false,
        cron_timezone: 'UTC', publish_timezone: 'Asia/Karachi',
        next_step: 'connect an approved renderer, licensed content sources and YouTube OAuth' });
    }
    if (path === '/calendar') {
      return json({ time_zone: 'Asia/Karachi', shorts: { days: 'daily', time: '19:00', by_weekday: SHORTS },
        regular_ai_videos: { days: [...LONG_DAYS], time: '21:00', duration: '2–3 minutes', source: 'original AI scenes' },
        notes: 'Ideas are starting drafts; trends must be verified before production.' });
    }
    if (path === '/jobs') return json({ jobs: await getJobs(env) });
    if (path === '/') return new Response(renderDashboard(await getJobs(env)), {
      headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
    });
    return json({ error: 'not_found' }, 404);
  },
  async scheduled(controller, env) {
    const kind = controller.cron === '0 14 * * *' ? 'short'
      : ['0 16 * * SUN', '0 16 * * WED'].includes(controller.cron) ? 'long' : null;
    if (!kind) {
      console.error(JSON.stringify({ event: 'unexpected_cron', cron: controller.cron }));
      return;
    }
    const job = plannedJob(kind, controller.scheduledTime);
    if (!job) return;
    await env.DB.prepare(`
      INSERT OR IGNORE INTO production_jobs
      (id,schedule_date,publish_time_pk,format,game,topic,template,status)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(job.id, job.schedule_date, job.publish_time_pk, job.format, job.game,
      job.topic, job.template, job.status).run();
    console.log(JSON.stringify({ event: 'editorial_job_queued', id: job.id, status: job.status,
      notice: 'No rendering, payment or YouTube publication performed' }));
  },
};


