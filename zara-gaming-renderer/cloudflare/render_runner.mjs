// Short-lived GitHub Actions OIDC authorization for Zara's review-only FFmpeg runner.
// The token's signature, repository, branch, workflow, audience, and expiry are checked.
const GH_ISSUER = 'https://token.actions.githubusercontent.com';
const GH_JWKS = `${GH_ISSUER}/.well-known/jwks`;
const EXPECTED_REPO = 'Zain1205/Free-work-space';
const EXPECTED_OWNER_ID = '317032240';
const EXPECTED_REPO_ID = '1399740102';
// GitHub repositories created after 2026-07-15 have immutable owner/repo
// IDs inside the OIDC `sub` claim. Check the exact new format rather than
// relaxing repository or workflow restrictions.
const EXPECTED_SUB = `repo:Zain1205@${EXPECTED_OWNER_ID}/Free-work-space@${EXPECTED_REPO_ID}:ref:refs/heads/main`;
const EXPECTED_WORKFLOW = `${EXPECTED_REPO}/.github/workflows/zara-render.yml@refs/heads/main`;
const AUDIENCE = 'zara-gaming-cloud-render';
const MODEL = '@cf/black-forest-labs/flux-1-schnell';
const FRAMES = {short:4,long:6};
const MAX_REQUESTS_PER_DAY = 16;

function base64urlDecode(text) {
  const padded = text.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-text.length%4)%4);
  return Uint8Array.from(atob(padded),character=>character.charCodeAt(0));
}

function parsePart(text) {
  return JSON.parse(new TextDecoder().decode(base64urlDecode(text)));
}

export async function hasValidGitHubIdentity(request, allowedEvents = ['schedule','workflow_dispatch','push']) {
  const authorization=request.headers.get('Authorization') || '';
  if (!/^Bearer [A-Za-z0-9._-]{100,8000}$/.test(authorization)) return false;
  try {
    const jwt=authorization.slice(7);
    const chunks=jwt.split('.');
    if (chunks.length!==3) return false;
    const header=parsePart(chunks[0]);
    const claims=parsePart(chunks[1]);
    const now=Math.floor(Date.now()/1000);
    if (header.alg!=='RS256' || typeof header.kid!=='string' || header.kid.length>128) return false;
    if (claims.iss!==GH_ISSUER || claims.aud!==AUDIENCE || claims.repository!==EXPECTED_REPO) return false;
    if (claims.ref!=='refs/heads/main' || claims.sub!==EXPECTED_SUB) return false;
    if (claims.repository_id!==EXPECTED_REPO_ID || claims.repository_owner_id!==EXPECTED_OWNER_ID) return false;
    if (claims.workflow_ref!==EXPECTED_WORKFLOW) return false;
    if (!allowedEvents.includes(claims.event_name)) return false;
    if (!(Number.isInteger(claims.iat) && Number.isInteger(claims.exp)) || claims.iat>now+30 || claims.exp<=now || claims.exp>now+900) return false;
    if (claims.nbf && claims.nbf>now) return false;
    const jwksResponse=await fetch(GH_JWKS,{cf:{cacheTtl:3600}});
    if (!jwksResponse.ok) return false;
    const jwks=await jwksResponse.json();
    const jwk=(jwks.keys||[]).find(key=>key.kid===header.kid && key.kty==='RSA' && (key.use==='sig'||!key.use));
    if (!jwk) return false;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify({name:'RSASSA-PKCS1-v1_5'},key,base64urlDecode(chunks[2]),new TextEncoder().encode(`${chunks[0]}.${chunks[1]}`));
  } catch {
    return false;
  }
}

function scenePrompt(job,frame) {
  const settings={
    'GTA VI':'an entirely fictional rain-soaked coastal metropolis and cinematic street race, no known characters',
    'Fortnite':'a colorful imaginary stylized battleground with dramatic natural landscapes and whimsical suspense',
    'Minecraft':'a stunning original voxel world, towering cliffs, forests, and block-shaped architecture',
    'Roblox':'a playful blocky 3D imaginary obstacle course with expressive colorful environments',
    'Counter-Strike 2':'an original fictional competitive tactical arena with realistic architectural lighting',
    'ARC Raiders':'a spectacular original science-fiction extraction adventure with robots and foggy ruins',
    'Original AI gaming fiction':'a breathtaking original science-fiction world with futuristic architecture and mysterious energy',
  };
  const cinematography=['wide establishing shot','intimate atmospheric close-up','dramatic aerial perspective','low-angle action composition','cinematic side profile','final sunset silhouette'];
  return `Original cinematic environmental concept still: ${settings[job.game]||settings['Original AI gaming fiction']}. Frame ${frame+1}: ${cinematography[frame]}. Vivid color depth, detailed atmospheric lighting, photorealistic textures, fine detail, dramatic environmental storytelling, visually distinct composition. Completely fictional AI concept art, NOT a screenshot, actual gameplay, licensed title asset, or official promotional image. No video game logos, brand names, recognizable copyrighted characters, real people, trademarks, captions, watermarks or text.`;
}

function safeJSON(obj,status=200) {
  return new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}

export async function routeRunner(request,env) {
  const url=new URL(request.url);
  if (!url.pathname.startsWith('/runner')) return null;
  if (url.pathname==='/runner/status' && request.method==='GET') return safeJSON({
    runner:'github-actions-oidc',repository:EXPECTED_REPO,model:MODEL,free_allowance_only:true,
    frame_counts:FRAMES,public_youtube_uploads:false,paid_video_provider_enabled:false,
  });
  if (url.pathname!=='/runner/frame' || request.method!=='POST') return safeJSON({error:'not_found'},404);
  if (!(await hasValidGitHubIdentity(request))) return safeJSON({error:'unauthorized_runner'},401);
  const jobId=url.searchParams.get('job_id')||'';
  const frame=Number(url.searchParams.get('frame'));
  if (!/^\d{4}-\d{2}-\d{2}:(short|long)$/.test(jobId) || !Number.isSafeInteger(frame) || frame<0) return safeJSON({error:'invalid_job_or_frame'},400);
  const job=await env.DB.prepare('SELECT id, game, format FROM production_jobs WHERE id=?').bind(jobId).first();
  if (!job || frame>=FRAMES[job.format]) return safeJSON({error:'job_or_frame_not_available'},404);
  if (typeof env.AI?.run!=='function') return safeJSON({error:'ai_binding_missing'},503);
  const today=new Date().toISOString().slice(0,10);
  await env.DB.prepare('INSERT OR IGNORE INTO runner_image_usage (day, request_count) VALUES (?,0)').bind(today).run();
  const result=await env.DB.prepare('UPDATE runner_image_usage SET request_count=request_count+1 WHERE day=? AND request_count<?').bind(today,MAX_REQUESTS_PER_DAY).run();
  if (result.meta?.changes!==1) return safeJSON({error:'daily_free_preview_limit_reached'},429);
  try {
    const output=await env.AI.run(MODEL,{prompt:scenePrompt(job,frame),steps:4});
    if (typeof output?.image!=='string' || output.image.length>12_000_000) return safeJSON({error:'ai_image_missing'},502);
    const image=Uint8Array.from(atob(output.image),c=>c.charCodeAt(0));
    return new Response(image,{headers:{
      'Content-Type':'image/jpeg','Cache-Control':'no-store',
      'X-Zara-Asset-Class':'original-ai-fictional-concept',
      'Content-Disposition':`attachment; filename="zara-${jobId.replace(':','-')}-${frame}.jpg"`,
    }});
  } catch(error) {
    console.error(JSON.stringify({event:'runner_frame_failed',jobId,frame,errorType:error?.name||'unknown'}));
    return safeJSON({error:'ai_temporarily_unavailable'},503);
  }
}
