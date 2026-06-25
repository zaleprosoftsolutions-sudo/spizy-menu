import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Scissors, Trash2, Upload } from 'lucide-react'

function ImageCropUpload({ value, onChange, onError }) {
  const inputRef = useRef(null)
  const [source, setSource] = useState(value || '')
  const [zoom, setZoom] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)

  useEffect(() => {
    setSource(value || '')
  }, [value])

  const handleChooseFile = (event) => {
    const file = event.target.files?.[0]

    if (!file) return

    if (!file.type.startsWith('image/')) {
      onError?.('Please choose a valid image file.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      onError?.('Image size should be below 5 MB.')
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      setSource(String(reader.result || ''))
      onChange('')
      setZoom(1)
      setOffsetX(0)
      setOffsetY(0)
    }

    reader.readAsDataURL(file)
  }

  const handleCrop = async () => {
    if (!source) {
      onError?.('Please choose an image first.')
      return
    }

    const image = new Image()
    image.crossOrigin = 'anonymous'

    image.onload = () => {
      const size = 700
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')

      canvas.width = size
      canvas.height = size

      const naturalWidth = image.naturalWidth
      const naturalHeight = image.naturalHeight
      const cropSize = Math.min(naturalWidth, naturalHeight) / zoom

      const maxX = naturalWidth - cropSize
      const maxY = naturalHeight - cropSize

      const centerX =
        naturalWidth / 2 + (Number(offsetX) / 100) * (maxX / 2)
      const centerY =
        naturalHeight / 2 + (Number(offsetY) / 100) * (maxY / 2)

      const sourceX = clamp(centerX - cropSize / 2, 0, maxX)
      const sourceY = clamp(centerY - cropSize / 2, 0, maxY)

      context.fillStyle = '#111111'
      context.fillRect(0, 0, size, size)
      context.drawImage(
        image,
        sourceX,
        sourceY,
        cropSize,
        cropSize,
        0,
        0,
        size,
        size,
      )

      const croppedImage = canvas.toDataURL('image/jpeg', 0.82)

      setSource(croppedImage)
      onChange(croppedImage)
    }

    image.onerror = () => {
      onError?.('Image crop failed. Please try another image.')
    }

    image.src = source
  }

  const handleRemove = () => {
    setSource('')
    onChange('')
    setZoom(1)
    setOffsetX(0)
    setOffsetY(0)

    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  return (
    <div className="image-crop-upload">
      <div className="image-upload-head">
        <div>
          <strong>Product image</strong>
          <span>Upload and crop to 1:1 square ratio</span>
        </div>

        <button
          type="button"
          className="tiny-button"
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={15} />
          Choose
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChooseFile}
        hidden
      />

      <div className="crop-preview">
        {source ? (
          <img
            src={source}
            alt="Product preview"
            style={{
              transform: `translate(${offsetX / 3}%, ${offsetY / 3}%) scale(${zoom})`,
            }}
          />
        ) : (
          <div className="crop-empty">
            <ImagePlus size={34} />
            <span>No image selected</span>
          </div>
        )}
      </div>

      {source && (
        <>
          <div className="crop-controls">
            <label>
              Zoom
              <input
                type="range"
                min="1"
                max="2"
                step="0.05"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </label>

            <label>
              Move X
              <input
                type="range"
                min="-100"
                max="100"
                step="1"
                value={offsetX}
                onChange={(event) => setOffsetX(Number(event.target.value))}
              />
            </label>

            <label>
              Move Y
              <input
                type="range"
                min="-100"
                max="100"
                step="1"
                value={offsetY}
                onChange={(event) => setOffsetY(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="crop-actions">
            <button type="button" className="tiny-button" onClick={handleCrop}>
              <Scissors size={15} />
              Use 1:1 Crop
            </button>

            <button
              type="button"
              className="tiny-button danger"
              onClick={handleRemove}
            >
              <Trash2 size={15} />
              Remove
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export default ImageCropUpload