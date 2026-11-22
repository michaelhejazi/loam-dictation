// The terms note, read fresh on every ask, as `GET /terms` answers it:
// `{path, obsidian_url, modified, text}`, or null when there is no note. The
// text is sent whole: parsing it into terms is the page's job, so the page and
// the Obsidian plugin cannot disagree about a line.
//
// `path` is vault-relative and `obsidian_url` opens the note in Obsidian,
// whose vault name is the vault's folder name. A file outside the vault has
// neither, so `path` is its absolute path and the link is null.

import fsp from 'node:fs/promises'
import path from 'node:path'

export function termsVaultPath({ file, vault }) {
  if (!file || !vault) return null
  const rel = path.relative(vault, file)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
  return rel.split(path.sep).join('/')
}

export async function readTerms({ file, vault }) {
  if (!file) return null
  let text, stat
  try {
    ;[text, stat] = await Promise.all([fsp.readFile(file, 'utf8'), fsp.stat(file)])
  } catch (err) {
    if (['ENOENT', 'EISDIR', 'ENOTDIR'].includes(err?.code)) return null
    throw err
  }
  const modified = new Date(Math.floor(stat.mtimeMs / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const rel = termsVaultPath({ file, vault })
  if (!rel) return { path: file, obsidian_url: null, modified, text }
  const target = rel.endsWith('.md') ? rel.slice(0, -3) : rel
  return {
    path: rel,
    obsidian_url: `obsidian://open?vault=${encodeURIComponent(path.basename(vault))}&file=${encodeURIComponent(target)}`,
    modified,
    text,
  }
}
