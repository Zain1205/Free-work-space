// New entrypoint preserving the original Zara Gaming Cloud editorial scheduler.
// OAuth, a private upload pilot, and rights-gated YouTube scheduled release.
import editorial, {plannedJob} from './zara_gaming_original.mjs';
import {routeYouTube, youtubeConnected} from './youtube_oauth.mjs';
import {routePrivateUpload} from './youtube_private_upload.mjs';
import {routeStudio} from './production_studio.mjs';
import {routeRunner} from './render_runner.mjs';
import {routeIntegrations} from './integrations_manager.mjs';

const SECURITY = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
const VERIFIED_REVIEW_RUN = 'https://github.com/Zain1205/Free-work-space/actions/runs/44077556769';
const VERIFIED_REVIEW_ARTIFACT = `${VERIFIED_REVIEW_RUN}/artifacts/14324453693`;

export default {
  async fetch(request, env, ctx) {
    try {
      const uploader = await routePrivateUpload(request, env);
      if (uploader) return uploader;
      const oauth = await routeYouTube(request, env);
      if (oauth) return oauth;
      const studio = await routeStudio(request, env);
      if (studio) return studio;
      const runner = await routeRunner(request, env);
      if (runner) return runner;
      const integrations = await routeIntegrations(request, env);
      if (integrations) return integrations;
      const path = new URL(request.url).pathname;
      if (path === '/health' && request.method === 'GET') {
        const original = await editorial.fetch(request, env, ctx);
        const value = await original.json();
        const linked = await youtubeConnected(env);
        value.youtube_oauth_connected = linked;
        value.youtube_oauth_backend_installed = true;
        value.youtube_oauth_credentials_configured = !!(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET);
        value.ai_image_model = '@cf/black-forest-labs/flux-1-schnell';
        value.ai_image_manual_preview_ready = typeof env.AI?.run === 'function' && !!env.YOUTUBE_OWNER_SETUP_KEY;
        value.ai_image_preview_daily_limit = 3;
        value.github_render_oidc_endpoint_installed = true;
        value.video_renderer_review_only = true;
        value.ai_generation_enabled = false; // scheduled image generation remains off pending first-batch review
        value.rendering_connected = true; // verified on 2026-11-17 with four AI scenes and FFmpeg
        value.first_review_video = {format:'1080x1920 H.264',duration_seconds:32,job_id:'2026-11-16:short',github_run:VERIFIED_REVIEW_RUN,artifact:VERIFIED_REVIEW_ARTIFACT};
        value.publishing_enabled = true;
        value.private_upload_endpoint_enabled = linked;
        value.scheduled_release_endpoint_installed = true;
        value.scheduled_release_requires_rights_approval = true;
        value.scheduled_release_requires_signed_owner_workflow = true;
        value.thumbnail_upload_endpoint_installed = true;
        value.automatic_publishing_enabled = true;
        value.publishing_is_rights_gated = true;
        value.automatic_runner = 'GitHub Actions daily cron checks approved_media/publishing_queue.json';
        const scheduledCount=await env.DB.prepare("SELECT COUNT(*) AS n FROM youtube_scheduled_uploads WHERE upload_state='scheduled'").first();
        value.youtube_confirmed_scheduled_count = Number(scheduledCount?.n||0);
        value.integration_manager = '/integrations/status';
        value.stage = linked ? 'rights_gated_auto_scheduler_deployed_no_unapproved_media' : 'youtube_oauth_setup_pending';
        value.next_step = linked ? 'approve exact footage/music SHA-256 rights record, then submit signed scheduled upload with thumbnail' : 'finish owner Google consent';
        return new Response(JSON.stringify(value,null,2),{headers:{...SECURITY,'Content-Type':'application/json; charset=utf-8'}});
      }
      if (path === '/' && request.method === 'GET') {
        const original = await editorial.fetch(request, env, ctx);
        let html = await original.text();
        const linked = await youtubeConnected(env);
        html = html.replace('YouTube OAuth</b>Not linked', `YouTube OAuth</b>${linked ? 'Authorized (publishing OFF)' : 'Setup pending'}`);
        html = html.replace('<p><a href="/health">Health JSON</a>', '<p><a href="/auth/youtube">Connect YouTube</a> · <a href="/health">Health JSON</a>');
        html = html.replace('<p><a href="/auth/youtube">Connect YouTube</a>', '<p><a href="/studio">Original AI Image Studio</a> · <a href="/auth/youtube">Connect YouTube</a>');
        html = html.replace(' · <a href="/health">Health JSON</a>', ' · <a href="/runner/status">Renderer JSON</a> · <a href="/health">Health JSON</a>');
        html = html.replace(' · <a href="/health">Health JSON</a>', ' · <a href="/upload/status">Scheduled YouTube uploader status</a> · <a href="/health">Health JSON</a>');
        html = html.replace(' · <a href="/health">Health JSON</a>', ' · <a href="/integrations/status">Editing &amp; API Budget</a> · <a href="/health">Health JSON</a>');
        html = html.replace('No third-party videos downloaded, no paid AI calls, no videos generated or uploaded by this Worker.', 'The first original AI concept Short has been rendered externally for owner review. No third-party videos downloaded, no paid AI video calls, and nothing uploaded to YouTube.');
        html = html.replace('<p class="notice">', `<p><strong>GitHub FFmpeg renderer connected.</strong> <a href="${VERIFIED_REVIEW_ARTIFACT}">Download the first 32-second review video</a>. Scheduled rendering and public publishing are paused until owner review.</p><p class="notice">`);
        return new Response(html,{headers:{...SECURITY,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
      }
      return editorial.fetch(request, env, ctx);
    } catch (error) {
      console.error(JSON.stringify({event:'worker_handler_failure',name:error?.name || 'unknown'}));
      return new Response(JSON.stringify({error:'internal_error'}),{status:500,headers:{...SECURITY,'Content-Type':'application/json'}});
    }
  },
  async scheduled(controller, env, ctx) {
    // The original long-video draft status was not permitted by its own D1 CHECK constraint.
    if (controller.cron === '0 16 * * SUN' || controller.cron === '0 16 * * WED') {
      const job = plannedJob('long', controller.scheduledTime);
      if (!job) return;
      job.status = 'awaiting_approved_ai_provider';
      await env.DB.prepare(`INSERT OR IGNORE INTO production_jobs
        (id,schedule_date,publish_time_pk,format,game,topic,template,status)
        VALUES (?,?,?,?,?,?,?,?)`).bind(job.id,job.schedule_date,job.publish_time_pk,job.format,job.game,job.topic,job.template,job.status).run();
      console.log(JSON.stringify({event:'editorial_job_queued',id:job.id,status:job.status,publishing:'disabled'}));
      return;
    }
    return editorial.scheduled(controller,env,ctx);
  },
};

