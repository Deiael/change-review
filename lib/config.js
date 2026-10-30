export const DEFAULTS = {
  maxBytes: 524288,
  ignore: [],
  enableSelftest: true,
  exploreBaseUrl: '',
  exploreToken: '',
  exploreTimeoutMs: 8000,
}

export function readField(config, key, fallback) {
  if (config == null) return fallback
  const value = config[key]
  if (value && typeof value === 'object' && typeof value.get === 'function') {
    try {
      const got = value.get()
      return got === undefined ? fallback : got
    } catch {
      return fallback
    }
  }
  if (value === undefined) return fallback
  return value
}

export function readConfig(config) {
  const ignore = readField(config, 'ignore', DEFAULTS.ignore)
  return {
    maxBytes: Number(readField(config, 'maxBytes', DEFAULTS.maxBytes)) || DEFAULTS.maxBytes,
    ignore: Array.isArray(ignore) ? ignore : DEFAULTS.ignore,
    enableSelftest: Boolean(readField(config, 'enableSelftest', DEFAULTS.enableSelftest)),
    exploreBaseUrl: String(readField(config, 'exploreBaseUrl', DEFAULTS.exploreBaseUrl) || '').trim(),
    exploreToken: String(readField(config, 'exploreToken', DEFAULTS.exploreToken) || '').trim(),
    exploreTimeoutMs: Number(readField(config, 'exploreTimeoutMs', DEFAULTS.exploreTimeoutMs)) || DEFAULTS.exploreTimeoutMs,
  }
}
