// Match next.config.ts. Other hosts keep working without opening the optimizer
// to arbitrary remote URLs; public Supabase uploads get resized and compressed.
export function canOptimizeFoodImage(source: string): boolean {
  if (source.startsWith('/') && !source.startsWith('//')) return true
  try {
    const url = new URL(source)
    return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co')
      && url.pathname.startsWith('/storage/v1/object/public/')
      && !url.username && !url.password && !url.port
  } catch { return false }
}
