// Image checks shared by avatar uploads and the AI photo reader.

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export type ImageType = { mime: 'image/jpeg' | 'image/png' | 'image/webp'; ext: string }

/** Finds the real image type from the first bytes. The Content-Type header is not trusted. */
export function detectImageType(data: Buffer): ImageType | null {
  if (data.length < 12) return null
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png' }
  }
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' }
  }
  return null
}
