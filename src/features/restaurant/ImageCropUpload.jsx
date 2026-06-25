import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2, Upload } from 'lucide-react'

const maxSourceImageSizeMb = 4
const maxSourceImageSizeBytes = maxSourceImageSizeMb * 1024 * 1024
const outputSize = 900
const outputQuality = 0.82

function ImageCropUpload({ value, onChange, onError }) {
  const inputRef = useRef(null)
  const [preview, setPreview] = useState(value || '')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    setPreview(value || '')
  }, [value])

  const handleChooseFile = async (event) => {
    const file = event.target.files?.[0]

    if (!file) return

    if (!file.type.startsWith('image/')) {
      onError?.('Please choose a valid image file.')
      return
    }

    if (file.size > maxSourceImageSizeBytes) {
      onError?.(`Image size should be below ${maxSourceImageSizeMb} MB.`)
      resetInput()
      return
    }

    setProcessing(true)

    try {
      const croppedDataUrl = await autoCropImageToSquare(file)

      setPreview(croppedDataUrl)
      onChange(croppedDataUrl)
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : 'Image processing failed. Please try another image.',
      )
    } finally {
      setProcessing(false)
    }
  }

  const handleRemove = () => {
    setPreview('')
    onChange('')
    resetInput()
  }

  const resetInput = () => {
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  return (
    <div className="image-crop-upload">
      <div className="image-upload-head">
        <div>
          <strong>Product image</strong>
          <span>Recommended 1:1 square image. Max {maxSourceImageSizeMb} MB.</span>
        </div>

        <button
          type="button"
          className="tiny-button"
          onClick={() => inputRef.current?.click()}
          disabled={processing}
        >
          <Upload size={15} />
          {processing ? 'Processing...' : 'Choose'}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        onChange={handleChooseFile}
        hidden
      />

      <div className="crop-preview">
        {preview ? (
          <img src={preview} alt="Product preview" />
        ) : (
          <div className="crop-empty">
            <ImagePlus size={34} />
            <span>No image selected</span>
          </div>
        )}
      </div>

      {preview && (
        <div className="auto-crop-note">
          Image is automatically cropped to 1:1 square before upload.
        </div>
      )}

      {preview && (
        <div className="crop-actions">
          <button
            type="button"
            className="tiny-button"
            onClick={() => inputRef.current?.click()}
            disabled={processing}
          >
            <Upload size={15} />
            Change Image
          </button>

          <button
            type="button"
            className="tiny-button danger"
            onClick={handleRemove}
            disabled={processing}
          >
            <Trash2 size={15} />
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

function autoCropImageToSquare(file) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')

        if (!context) {
          reject(new Error('Image editor not supported in this browser.'))
          return
        }

        const sourceSize = Math.min(image.naturalWidth, image.naturalHeight)
        const sourceX = Math.floor((image.naturalWidth - sourceSize) / 2)
        const sourceY = Math.floor((image.naturalHeight - sourceSize) / 2)

        canvas.width = outputSize
        canvas.height = outputSize

        context.fillStyle = '#111111'
        context.fillRect(0, 0, outputSize, outputSize)

        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceSize,
          sourceSize,
          0,
          0,
          outputSize,
          outputSize,
        )

        const dataUrl = canvas.toDataURL('image/jpeg', outputQuality)

        URL.revokeObjectURL(objectUrl)
        resolve(dataUrl)
      } catch (error) {
        URL.revokeObjectURL(objectUrl)
        reject(error)
      }
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Image loading failed. Please try another image.'))
    }

    image.src = objectUrl
  })
}

export default ImageCropUpload