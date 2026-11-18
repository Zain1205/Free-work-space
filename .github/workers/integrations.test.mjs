import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {routeIntegrations} from './integrations_manager.mjs';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const db = {
  prepare() { return {
    async all() { return { results: [
      { id: 'demo-motion-prompt-library', role: 'reference', status: 'reference_only' },
      { id: 'demo-freellmapi-router', role: 'router', status: 'optional_disabled' },
      { id: 'demo-unverified-10b-plugin', role: 'unverified', status: 'unverified_not_installed' },
    ] }; },
    bind() { return {async first() {return null;}}; },
  }; },
};
const env = {DB:db, YOUTUBE_OWNER_SETUP_KEY:'test-owner-secret-not-for-production'};

test('integration status is safe and external calls are off', async () => {
  const response = await routeIntegrations(new Request('https://zara.example/integrations/status'), env);
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.api_budget.external_api_calls_enabled, false);
  assert.equal(status.source_reviews.length, 3);
  assert.equal(status.editing.automatic_publication, false);
  assert.ok(!JSON.stringify(status).includes(env.YOUTUBE_OWNER_SETUP_KEY));
});

test('ideas route refuses unauthenticated callers', async () => {
  const response = await routeIntegrations(new Request('https://zara.example/integrations/ideas', {
    method: 'POST', body: '{}', headers: {'Content-Type': 'application/json'},
  }), env);
  assert.equal(response.status, 401);
});

test('idea generation needs no API tokens and no fake gameplay', async () => {
  const response = await routeIntegrations(new Request('https://zara.example/integrations/ideas', {
    method: 'POST', headers: {'X-Zara-Owner-Key': env.YOUTUBE_OWNER_SETUP_KEY},
    body: JSON.stringify({game:'Minecraft',topic:'danger-zones',count:5,format:'short',request_id:'sample-20261118'}),
  }), env);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.api_tokens_used, 0);
  assert.equal(result.outline.entries.length, 5);
  assert.equal(result.outline.may_publish, false);
  assert.ok(result.outline.entries.every(entry=>entry.fact_checked === false));
});

test('invalid request is rejected without any provider call', async () => {
  const response = await routeIntegrations(new Request('https://zara.example/integrations/ideas', {
    method: 'POST', headers: {'X-Zara-Owner-Key': env.YOUTUBE_OWNER_SETUP_KEY},
    body: JSON.stringify({game:'Minecraft',topic:'fake-cheat-codes',count:5,format:'short',request_id:'bad-input-1'}),
  }), env);
  assert.equal(response.status, 400);
});
