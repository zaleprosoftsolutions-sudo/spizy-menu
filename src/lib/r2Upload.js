import { supabase } from './supabaseClient'

export function dataUrlToBlob(dataUrl) {
  const [header, base64Data] = dataUrl.split(',')
  const mimeMatch = header.match(/data:(.*?);base64/)
  const mimeType = mimeMatch?.[1] || 'image/jpeg'

  const binary = atob(base64Data)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: mimeType })
}

export async function uploadProductImageToR2({
  restaurantId,
  imageDataUrl,
  fileName,
}) {
  if (!imageDataUrl?.startsWith('data:image/')) {
    return imageDataUrl || null
  }

  const imageBlob = dataUrlToBlob(imageDataUrl)
  const maxFinalImageSizeBytes = 900 * 1024

if (imageBlob.size > maxFinalImageSizeBytes) {
  throw new Error('Final product image should be below 900 KB.')
}

  const { data, error } = await supabase.functions.invoke(
    'create-r2-upload-url',
    {
      body: {
        restaurantId,
        fileType: imageBlob.type || 'image/jpeg',
        fileName: fileName || 'product-image.jpg',
      },
    },
  )

  if (error) {
    throw new Error(error.message || 'Image upload URL failed')
  }

  if (!data?.uploadUrl || !data?.publicUrl) {
    throw new Error('Invalid upload URL response')
  }

  const uploadResponse = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': imageBlob.type || 'image/jpeg',
    },
    body: imageBlob,
  })

  if (!uploadResponse.ok) {
    throw new Error('Image upload to storage failed')
  }

  return data.publicUrl
}