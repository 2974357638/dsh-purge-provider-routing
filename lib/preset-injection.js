// Session-local prompt policy. No global "last preset" state: parallel agents
// must make their own decision at every assembly and host fallback call.
import { sessionAgentPreset } from './identity.js';

export function excludedPresetIds(config) {
  return Array.isArray(config?.excludePresets)
    ? config.excludePresets.filter(x => typeof x === 'string').map(x => x.trim().toLowerCase()).filter(Boolean)
    : [];
}

// Provider-scoped injection.
//
// Hosted OpenAI traffic goes through a cyber-risk classifier that reads the whole
// request body. A 25KB operator prompt full of pentest/malware vocabulary trips it
// on every turn — even a bare "你好" — so ChatGPT answers with
// "This content was flagged for possible cybersecurity risk" and nothing else.
// Injection therefore stays on the plain-provider path and is skipped for the
// listed providers.
//
// excludeProviders: array of provider ids to skip, false to disable the gate,
//   omitted to use DEFAULT_EXCLUDE_PROVIDERS.
// injectProviders: optional whitelist; when non-empty, only these get injection.
export const DEFAULT_EXCLUDE_PROVIDERS = ['openai-codex'];

export function excludedProviders(config) {
  const raw = config?.excludeProviders;
  const list = Array.isArray(raw) ? raw : raw === false ? [] : DEFAULT_EXCLUDE_PROVIDERS;
  return list.filter((x) => typeof x === 'string').map((x) => x.trim().toLowerCase()).filter(Boolean);
}

export function includedProviders(config) {
  const raw = config?.injectProviders;
  return Array.isArray(raw)
    ? raw.filter((x) => typeof x === 'string').map((x) => x.trim().toLowerCase()).filter(Boolean)
    : [];
}

/** Current provider id for this assembly, '' when it cannot be determined. */
export function sessionProvider(context) {
  const probes = [
    () => context?.modelSelection?.provider,
    () => context?.agent?.modelSelection?.provider,
    () => context?.agent?.model?.current?.()?.provider,
    () => context?.agent?.session?.header?.modelSelection?.provider,
  ];
  for (const probe of probes) {
    try {
      const value = probe();
      if (value) return String(value).trim().toLowerCase();
    } catch { /* probe unavailable in this context shape */ }
  }
  // Fallback: last recorded selection in the session log.
  try {
    const session = context?.agent?.session;
    const events = typeof session?.snapshotEvents === 'function' ? session.snapshotEvents()
      : Array.isArray(session?.events) ? session.events : [];
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      const provider = event?.type === 'model/selection' ? event?.data?.provider : '';
      if (provider) return String(provider).trim().toLowerCase();
    }
  } catch { /* session log unavailable */ }
  return '';
}

export function injectionPolicy(config, context) {
  const ids = excludedPresetIds(config);
  let preset = '';
  try { preset = String(sessionAgentPreset(context) || '').trim().toLowerCase(); } catch { /* unavailable context */ }
  // Subagents use their own effective preset, not their parent's selection.
  // Unknown contexts cannot safely opt back into injection when exclusions exist.
  const unknown = ids.length > 0 && !preset;
  const excluded = !!preset && ids.includes(preset);
  const provider = sessionProvider(context);
  const excludedByProvider = excludedProviders(config);
  const onlyProviders = includedProviders(config);
  const providerExcluded = excludedByProvider.length > 0 && !!provider && excludedByProvider.includes(provider);
  const providerNotListed = onlyProviders.length > 0 && !onlyProviders.includes(provider);
  return {
    preset,
    excluded,
    unknown,
    provider,
    providerExcluded,
    providerNotListed,
    allowed: config?.enabled !== false && !excluded && !unknown && !providerExcluded && !providerNotListed,
  };
}

export function isPurgeSection(section) {
  const name = String(section?.name || '');
  return name === 'dsh-purge' || name.startsWith('dsh-purge-') || name.startsWith('dsh-purge:') || name.startsWith('dshpg-');
}

// Symbol survives ordinary {...assembly} copies but never renders or serializes.
// Only reverse our own known writes, never regex-delete user/persona text.
const ORIGINAL = Symbol.for('dsh-purge.prompt-provenance.v1');
export function withoutPurgeInjection(assembly, { keepPluginSections = false } = {}) {
  if (!Array.isArray(assembly?.sections)) return assembly;
  const record = assembly[ORIGINAL];
  const sections = assembly.sections.filter(s => {
    if (isPurgeSection(s)) return keepPluginSections;
    const prior = record?.written.find(p => p.name === s.name);
    return !(prior && prior.text === s.text && !record.original.some(p => p.name === s.name));
  }).map(s => {
    const prior = record?.written.find(p => p.name === s.name);
    const original = record?.original.find(p => p.name === s.name);
    return prior && original && prior.text === s.text ? { ...s, text: original.text } : s;
  });
  // Restore native sections removed by our previous rewrite, preserving any
  // later downstream additions/edits and their order.
  for (const original of record?.original || []) {
    if (isPurgeSection(original) || record.written.some(s => s.name === original.name) || sections.some(s => s.name === original.name)) continue;
    const index = record.original.indexOf(original);
    const following = new Set(record.original.slice(index + 1).map(s => s.name));
    const before = sections.findIndex(s => following.has(s.name));
    sections.splice(before < 0 ? sections.length : before, 0, original);
  }
  const clean = { ...assembly, sections };
  delete clean[ORIGINAL];
  return clean;
}

export function rememberPromptRewrite(original, rewritten) {
  if (!Array.isArray(original?.sections) || !Array.isArray(rewritten?.sections)) return rewritten;
  return { ...rewritten, [ORIGINAL]: {
    original: original.sections.map(s => ({ ...s })),
    written: rewritten.sections.map(s => ({ ...s })),
  } };
}

// LLM requests carry a sessionId, not an assembly context. Resolve that exact
// live agent; never use the last/current UI conversation or causal parent.
export function requestInjectionContext(ctx, options) {
  if (options?.context?.agent || options?.context?.session) return options.context;
  if (options?.agent || options?.session) return options;
  if (typeof options?.sessionId !== 'string' || !options.sessionId) return undefined;
  try {
    const registry = typeof ctx?.get === 'function' ? ctx.get('agents') : ctx?.agents;
    const agent = registry?.get(options.sessionId);
    return agent?.session?.id === options.sessionId ? { agent } : undefined;
  } catch { return undefined; }
}
