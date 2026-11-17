import test from 'node:test';
import assert from 'node:assert/strict';
import {
  excludedProviders,
  includedProviders,
  injectionPolicy,
  sessionProvider,
  withoutPurgeInjection,
} from '../lib/preset-injection.js';

const context = (provider) => ({ modelSelection: { provider } });

test('ChatGPT is excluded by default', () => {
  const decision = injectionPolicy({}, context('openai-codex'));
  assert.equal(decision.providerExcluded, true);
  assert.equal(decision.allowed, false);
});

test('DeepSeek remains allowed by default', () => {
  assert.equal(injectionPolicy({}, context('deepseek-official')).allowed, true);
});

test('default behavior excludes ChatGPT, not every non-DeepSeek provider', () => {
  assert.equal(injectionPolicy({}, context('another-provider')).allowed, true);
});

test('provider IDs are trimmed and case-insensitive', () => {
  assert.equal(injectionPolicy({}, context(' OPENAI-CODEX ')).allowed, false);
});

test('an explicit empty exclusion or false restores provider-wide eligibility', () => {
  for (const excludeProviders of [[], false]) {
    assert.equal(injectionPolicy({ excludeProviders }, context('openai-codex')).allowed, true);
  }
});

test('the optional allowlist supports DeepSeek-only injection', () => {
  const config = { injectProviders: ['deepseek-official'] };
  assert.equal(injectionPolicy(config, context('deepseek-official')).allowed, true);
  assert.equal(injectionPolicy(config, context('another-provider')).allowed, false);
  assert.equal(injectionPolicy(config, {}).allowed, false);
});

test('an exclusion wins over the optional allowlist', () => {
  const config = {
    excludeProviders: ['deepseek-official'],
    injectProviders: ['deepseek-official'],
  };
  assert.equal(injectionPolicy(config, context('deepseek-official')).allowed, false);
});

test('provider filters normalize configuration values', () => {
  assert.deepEqual(excludedProviders({ excludeProviders: [' A ', null, ''] }), ['a']);
  assert.deepEqual(includedProviders({ injectProviders: [' B ', 1, ''] }), ['b']);
});

test('request-local model selection overrides the agent model', () => {
  const current = {
    modelSelection: { provider: 'openai-codex' },
    agent: { model: { current: () => ({ provider: 'deepseek-official' }) } },
  };
  assert.equal(sessionProvider(current), 'openai-codex');
});

test('each agent uses its own selected provider', () => {
  const a = { agent: { model: { current: () => ({ provider: 'openai-codex' }) } } };
  const b = { agent: { model: { current: () => ({ provider: 'deepseek-official' }) } } };
  assert.equal(injectionPolicy({}, a).allowed, false);
  assert.equal(injectionPolicy({}, b).allowed, true);
  assert.equal(injectionPolicy({}, a).allowed, false);
});

test('the latest recorded model selection is used as a fallback', () => {
  const current = { agent: { session: { snapshotEvents: () => [
    { type: 'model/selection', data: { provider: 'deepseek-official' } },
    { type: 'model/selection', data: { provider: 'openai-codex' } },
  ] } } };
  assert.equal(sessionProvider(current), 'openai-codex');
});

test('disabled plugin and unknown-provider default keep their current semantics', () => {
  assert.equal(injectionPolicy({ enabled: false }, context('deepseek-official')).allowed, false);
  assert.equal(injectionPolicy({}, {}).allowed, true);
});

test('removing Purge sections preserves unrelated persona and contexts', () => {
  const persona = { name: 'persona-prefix', text: 'original persona' };
  const runtime = [{ name: 'workspace', text: 'original context' }];
  const assembly = {
    sections: [persona, { name: 'dsh-purge', text: 'injected' }, { name: 'dsh-purge-tail', text: 'tail' }],
    contexts: runtime,
  };
  const clean = withoutPurgeInjection(assembly);
  assert.deepEqual(clean.sections, [persona]);
  assert.equal(clean.contexts, runtime);
  assert.equal(assembly.sections.length, 3);
});
