import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PutObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3'
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function getImageExtension(fileType: string, fileName = '') {
  if (fileType === 'image/png') return 'png'
  if (fileType === 'image/webp') return 'webp'
  if (fileType === 'image/gif') return 'gif'

  const extension = fileName.split('.').pop()?.toLowerCase()

  if (extension && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension)) {
    return extension === 'jpeg' ? 'jpg' : extension
  }

  return 'jpg'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    const r2AccountId = Deno.env.get('R2_ACCOUNT_ID')
    const r2AccessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
    const r2SecretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
    const r2BucketName = Deno.env.get('R2_BUCKET_NAME')
    const r2PublicUrl = Deno.env.get('R2_PUBLIC_URL')

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !r2AccountId ||
      !r2AccessKeyId ||
      !r2SecretAccessKey ||
      !r2BucketName ||
      !r2PublicUrl
    ) {
      return jsonResponse({ error: 'Missing server configuration' }, 500)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const { restaurantId, fileType, fileName } = await req.json()

    if (!restaurantId) {
      return jsonResponse({ error: 'restaurantId is required' }, 400)
    }

    if (!fileType || !String(fileType).startsWith('image/')) {
      return jsonResponse({ error: 'Only image uploads are allowed' }, 400)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    let isAllowed = profile?.role === 'super_admin'

    if (!isAllowed) {
      const { data: member } = await supabase
        .from('restaurant_members')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()

      isAllowed = Boolean(member)
    }

    if (!isAllowed) {
      return jsonResponse({ error: 'You cannot upload for this restaurant' }, 403)
    }

    const extension = getImageExtension(fileType, fileName)
    const objectKey = `restaurants/${restaurantId}/products/${crypto.randomUUID()}.${extension}`

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      },
    })

    const command = new PutObjectCommand({
      Bucket: r2BucketName,
      Key: objectKey,
      ContentType: fileType,
      CacheControl: 'public, max-age=31536000',
    })

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 300,
    })

    const publicUrl = `${r2PublicUrl.replace(/\/$/, '')}/${objectKey}`

    return jsonResponse({
      uploadUrl,
      publicUrl,
      objectKey,
    })
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Upload URL failed',
      },
      500,
    )
  }
})