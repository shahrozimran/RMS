// Poll with completion-based scheduling: no overlap, no hidden-tab work.
export function pollVisible(task: () => Promise<unknown>, intervalMs = 5000) {
  let stopped = false
  let running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = async () => {
    if (stopped || running) return
    clearTimeout(timer)
    if (document.hidden) return
    running = true
    try { await task() } catch { /* The owning UI handles request errors. */ }
    finally {
      running = false
      if (!stopped) timer = setTimeout(run, intervalMs)
    }
  }
  const onVisibility = () => { if (!document.hidden) void run(); else clearTimeout(timer) }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', onVisibility)
  void run()
  return () => {
    stopped = true
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('focus', onVisibility)
  }
}
