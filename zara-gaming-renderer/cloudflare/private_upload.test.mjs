import test from 'node:test';
import assert from 'node:assert/strict';
import {routePrivateUpload} from './youtube_private_upload.mjs';

test('private uploader status is explicit and public publishing remains disabled', async () => {
  const env={DB:{prepare:()=>({first:async()=>({ok:1})})}};
  const response=await routePrivateUpload(new Request('https://zara-gaming-cloud.example/upload/status'),env);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.private_upload_api_installed,true);
  assert.equal(data.private_upload_enabled,true);
  assert.equal(data.youtube_oauth_connected,true);
  assert.equal(data.public_publishing_enabled,false);
  assert.equal(data.automatic_publishing_enabled,false);
});

test('private upload rejects unsigned requests without touching Google or the database', async () => {
  const request=new Request('https://zara-gaming-cloud.example/upload/private',{method:'POST',
    headers:{'Content-Type':'video/mp4','X-Zara-Video-Kind':'synthetic-upload-test'},
    body:new Uint8Array(2000)});
  const response=await routePrivateUpload(request,{});
  assert.equal(response.status,401);
  assert.equal((await response.json()).error,'manual_github_identity_required');
});

test('no arbitrary endpoint dispatch', async () => {
  const response=await routePrivateUpload(new Request('https://zara-gaming-cloud.example/upload/public'),{});
  assert.equal(response.status,404);
});
