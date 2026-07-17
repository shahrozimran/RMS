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
    let uploadError: any = null

    try {
      const result = await supabase.storage
        .from('menu-images')
        .upload(fileName, buffer, {
          contentType: file.type || 'image/jpeg',
          cacheControl: '3600',
          upsert: true
        })
      uploadError = result.error
    } catch (e: any) {
      uploadError = e
    }

    // Auto-heal: If bucket does not exist, try to create it and retry upload
    if (uploadError) {
      const errMsg = uploadError.message || ''
      const isBucketMissing = 
        errMsg.toLowerCase().includes('bucket not found') || 
        errMsg.toLowerCase().includes('does not exist') ||
        uploadError.status === 404 ||
        uploadError.statusCode === '404' ||
        uploadError.statusCode === 404

      if (isBucketMissing) {
        // Attempt to create the public bucket
        const { error: createError } = await supabase.storage.createBucket('menu-images', {
          public: true,
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
          fileSizeLimit: 5242880 // 5MB
        })

        if (!createError) {
          // Retry the upload
          const { error: retryError } = await supabase.storage
            .from('menu-images')
            .upload(fileName, buffer, {
              contentType: file.type || 'image/jpeg',
              cacheControl: '3600',
              upsert: true
            })
          
          if (!retryError) {
            uploadError = null
          } else {
            uploadError = retryError
          }
        } else {
          uploadError = new Error(`Failed to auto-create bucket: ${createError.message}. Orig upload error: ${errMsg}`)
        }
      }
    }

    if (uploadError) {
      return NextResponse.json({ 
        error: `Storage upload failed: ${uploadError.message}. Make sure the bucket 'menu-images' exists in Supabase storage and is public.` 
      }, { status: 500 })
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
