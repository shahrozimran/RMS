-- Supabase Storage schema is managed by Supabase itself.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('menu-images','menu-images',true,5242880,ARRAY['image/png','image/jpeg','image/gif','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=true,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
