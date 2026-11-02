import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/rbac'
import { apiError } from '@/lib/api/errors'
import { readBody } from '@/lib/api/body'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    requirePermission(session, 'menu', 'write')
    const body = await readBody(request, 6 * 1024 * 1024)
    const form = await new Response(body, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData()
    const file = form.get('file')
    if (!(file instanceof File) || file.size < 12 || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'An image of up to 5MB is required' }, { status: 400 })
    const bytes = Buffer.from(await file.arrayBuffer())
    const mime = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
      : /^GIF8[79]a$/.test(bytes.subarray(0,6).toString('ascii')) ? 'image/gif'
      : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' ? 'image/webp' : null
    if (!mime || mime !== file.type) return NextResponse.json({ error: 'Only valid PNG, JPEG, GIF and WebP images are supported' }, { status: 400 })
    const db = await createAdminClient()
    const extensions: Record<string,string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }
    const name = randomUUID() + '.' + extensions[mime]
    const { error } = await db.storage.from('menu-images').upload(name, bytes, { contentType: mime, cacheControl: '3600', upsert: false })
    if (error) throw error
    return NextResponse.json({ url: db.storage.from('menu-images').getPublicUrl(name).data.publicUrl })
  } catch (error) { return apiError(error) }
}
