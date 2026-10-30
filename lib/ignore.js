const DEFAULT_PATTERNS = [
  /(?:^|[\\/])node_modules(?:[\\/]|$)/i,
  /(?:^|[\\/])\.git(?:[\\/]|$)/i,
  /(?:^|[\\/])dist(?:[\\/]|$)/i,
  /(?:^|[\\/])\.dsh(?:[\\/]|$)/i,
  /(?:^|[\\/])pnpm-lock\.yaml$/i,
  /(?:^|[\\/])package-lock\.json$/i,
]

/**
 * @param {string} path
 * @param {string[]} [extraGlobs] glob-ish suffixes, e.g. "*.lock"
 */
export function shouldIgnore(path, extraGlobs = []) {
  const normalized = path.replaceAll('\\', '/')
  if (DEFAULT_PATTERNS.some((re) => re.test(normalized))) return true
  for (const glob of extraGlobs) {
    const g = String(glob || '').trim()
    if (!g) continue
    if (g.startsWith('*.')) {
      if (normalized.toLowerCase().endsWith(g.slice(1).toLowerCase())) return true
    } else if (normalized.includes(g.replaceAll('\\', '/'))) {
      return true
    }
  }
  return false
}
