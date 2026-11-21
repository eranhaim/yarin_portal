function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Crops an image to a centered square and resizes it.
 * Re-encoding also removes photo metadata such as GPS location.
 */
export async function squareImage(file: File, size = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('הדפדפן לא יכול לעבד תמונות')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  bitmap.close()
  // Browsers without WebP encoding (older Safari) return PNG instead; the server accepts both.
  const blob = (await canvasToBlob(canvas, 'image/webp', 0.86)) ?? (await canvasToBlob(canvas, 'image/png', 1))
  if (!blob) throw new Error('לא הצלחנו לעבד את התמונה')
  return blob
}

/**
 * Reads a video's duration and captures a preview frame, in the browser.
 * Returns nulls when the browser cannot decode the video (the upload still works).
 */
export function inspectVideo(file: File): Promise<{ duration: number | null; poster: Blob | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    let duration: number | null = null
    let done = false

    const finish = (poster: Blob | null) => {
      if (done) return
      done = true
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      video.load()
      resolve({ duration, poster })
    }
    const timer = setTimeout(() => finish(null), 20_000)

    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    video.onerror = () => finish(null)
    video.onloadedmetadata = () => {
      duration = Number.isFinite(video.duration) ? video.duration : null
      video.currentTime = Math.min(2, (duration ?? 0) * 0.1)
    }
    video.onseeked = async () => {
      const width = Math.min(960, video.videoWidth)
      const height = Math.round((width / video.videoWidth) * video.videoHeight)
      if (!width || !height) return finish(null)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')?.drawImage(video, 0, 0, width, height)
      finish(await canvasToBlob(canvas, 'image/jpeg', 0.82))
    }
    video.src = url
  })
}
