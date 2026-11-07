/** @param {string | undefined} value */
export function supabaseUrl(value) {
  let url
  try { url = new URL(value ?? '') } catch { throw new Error('Configure a valid Supabase URL') }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  const allowLocalHttp = process.env.NODE_ENV !== 'production' && loopback && url.protocol === 'http:'
  if ((!allowLocalHttp && url.protocol !== 'https:') || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Supabase requires an HTTPS project origin')
  }
  return url.origin
}
