// Every knob Dictation's server has, from its environment. Loam starts the
// server with its own variables (`LOAM_PLUGIN_*`, `PORT`); `GEMINI_API_URL`,
// `DICTATION_POLISH_MODEL` and `DICTATION_TERMS` are for a test or a box that
// wants to point one somewhere else.

import path from 'node:path'

export function readConfig(env = process.env) {
  const privateDir = (env.LOAM_PLUGIN_PRIVATE ?? '').trim()
  return {
    port: Number.parseInt(env.PORT ?? env.LOAM_PLUGIN_PORT ?? '0', 10) || 0,
    geminiUrl: (env.GEMINI_API_URL ?? 'https://generativelanguage.googleapis.com').trim().replace(/\/+$/, ''),
    // The text model that polishes a take (`polish.js`), on the same key.
    polishModel: (env.DICTATION_POLISH_MODEL ?? '').trim() || 'gemini-3.5-flash-lite',
    logLevel: (env.LOG_LEVEL ?? '').trim().toLowerCase() || 'info',
    keysFile: (env.LOAM_PLUGIN_KEYS ?? '').trim() || (privateDir ? path.join(privateDir, 'keys.env') : ''),
    terms: termsNote(env),
  }
}

// The one note of names and terms that biases dictation: `Dictation terms.md`
// in the vault's system folder, which the Obsidian plugin reads too. Loam
// tells a plugin's server its own vault folder, `<system>/Loam/data/<id>`, as
// a vault-relative path (`LOAM_VAULT_DATA`) and as a host path
// (`LOAM_VAULT_DATA_DIR`); the vault and its system folder are read off the
// two. `DICTATION_TERMS` names another file outright (a test). No request can
// name a file: the route serves this path and nothing else.
export function termsNote(env = process.env) {
  const named = (env.DICTATION_TERMS ?? '').trim()
  const rel = (env.LOAM_VAULT_DATA ?? '').trim().replace(/^\/+|\/+$/g, '')
  const abs = (env.LOAM_VAULT_DATA_DIR ?? '').trim().replace(/\/+$/, '')
  let vault = (env.LOAM_VAULT ?? '').trim().replace(/\/+$/, '') || null
  if (!vault && rel && abs.endsWith(`/${rel}`)) vault = abs.slice(0, -(rel.length + 1))
  const system = /^(.+?)\/Loam\/data\/[^/]+$/.exec(rel)?.[1] ?? null
  if (named) return { file: path.resolve(named), vault }
  if (!vault || !system) return { file: null, vault }
  return { file: path.join(vault, system, 'Dictation terms.md'), vault }
}
