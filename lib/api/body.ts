import { ApiError } from './errors'

export async function readBody(request: Request, maxBytes = 256 * 1024): Promise<ArrayBuffer> {
  if (!request.body) return new ArrayBuffer(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > maxBytes) { void reader.cancel(); throw new ApiError('Request too large', 413) }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return result.buffer
}

export async function readJson(request: Request) {
  const bytes = await readBody(request)
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { throw new ApiError('Invalid UTF-8 JSON') }
  return JSON.parse(text)
}
