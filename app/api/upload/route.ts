import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as Blob | null

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    const supabase = await createAdminClient()
    const fileName = `${Date.now()}-${(file as any).name || 'image.jpg'}`

    // Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage
      .from('menu-images')
      .upload(fileName, buffer, {
        contentType: file.type || 'image/jpeg',
        cacheControl: '3600',
        upsert: true
      })

    if (uploadError) {
      // If bucket doesn't exist, try to create it or fall back
      return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}. Make sure the bucket 'menu-images' exists in Supabase storage and is public.` }, { status: 500 })
    }

    // Get public URL
    const { data } = supabase.storage
      .from('menu-images')
      .getPublicUrl(fileName)

    return NextResponse.json({ url: data.publicUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
