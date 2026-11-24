import { strFromU8, unzipSync } from 'fflate'
import type { AiContent } from './claude.ts'
import { ffmpegAvailable, readMedia, smallImage } from './media.ts'
import { getObjectBytes, signedUrl } from '../storage.ts'

// Opens the files a customer hands in, so the AI checks the real work and not only its name:
// images, PDF, Word, PowerPoint, Excel, text, and (with ffmpeg) videos and recordings.

export type WorkFile = { name: string; contentType: string; size: number; key: string; note?: string }

export type ReadFiles = {
  content: AiContent
  /** Names of the files that were opened, and of the ones that could not be. */
  read: string[]
  skipped: string[]
}

const MB = 1024 * 1024
const MAX_FILES = 6
const MAX_TEXT = 24_000
const MAX_DOCUMENT = 18 * MB
const MAX_VIDEO = 600 * MB

const extensionOf = (name: string) => /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase() ?? ''

type Kind = 'image' | 'pdf' | 'office' | 'text' | 'media' | 'other'

export function kindOf(file: Pick<WorkFile, 'name' | 'contentType'>): Kind {
  const ext = extensionOf(file.name)
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext) || file.contentType.startsWith('image/')) return 'image'
  if (ext === 'pdf' || file.contentType === 'application/pdf') return 'pdf'
  if (['docx', 'pptx', 'xlsx'].includes(ext)) return 'office'
  if (['txt', 'md', 'csv', 'tsv', 'json', 'srt', 'vtt'].includes(ext) || file.contentType.startsWith('text/')) return 'text'
  if (file.contentType.startsWith('video/') || file.contentType.startsWith('audio/') || ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'mp3', 'm4a', 'wav', 'ogg', 'opus'].includes(ext)) return 'media'
  return 'other'
}

const decodeXml = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')

/** Text of a Word, PowerPoint or Excel file. Only the parts that hold text are unpacked, up to 25 MB. */
export function officeText(data: Uint8Array, name: string): string {
  const ext = extensionOf(name)
  const wanted =
    ext === 'docx'
      ? /^word\/document\.xml$/
      : ext === 'pptx'
        ? /^ppt\/slides\/slide\d+\.xml$/
        : /^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/
  let budget = 25 * MB
  const parts = unzipSync(data, {
    filter: (file) => {
      if (!wanted.test(file.name) || file.originalSize > budget) return false
      budget -= file.originalSize
      return true
    },
  })
  const numberIn = (path: string) => Number(/(\d+)\.xml$/.exec(path)?.[1] ?? 0)
  const paths = Object.keys(parts).sort((a, b) => numberIn(a) - numberIn(b))
  const xml = (path: string) => strFromU8(parts[path]!)

  if (ext === 'docx') {
    return paths
      .map(xml)
      .join('')
      .replace(/<\/w:tc>/g, ' | ')
      .replace(/<\/w:p>|<w:br\s*\/>|<\/w:tr>/g, '\n')
      .replace(/<w:tab\s*\/>/g, '\t')
      .replace(/<[^>]+>/g, '')
      .split('\n')
      .map((line) => decodeXml(line).trim())
      .filter(Boolean)
      .join('\n')
  }
  if (ext === 'pptx') {
    return paths
      .map((path, i) => {
        const text = [...xml(path).matchAll(/<a:t>([^<]*)<\/a:t>|<\/a:p>/g)].map((m) => (m[1] === undefined ? '\n' : decodeXml(m[1]))).join('')
        return `Slide ${i + 1}:\n${text.replace(/\n+/g, '\n').trim()}`
      })
      .join('\n\n')
  }
  const shared = parts['xl/sharedStrings.xml']
    ? [...xml('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decodeXml([...m[1]!.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join('')))
    : []
  return paths
    .filter((path) => path.startsWith('xl/worksheets/'))
    .map((path, i) => {
      const rows = [...xml(path).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].slice(0, 300).map((row) =>
        [...row[1]!.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)]
          .map(([, attributes, body]) => {
            const value = /<v>([^<]*)<\/v>/.exec(body!)?.[1] ?? /<t[^>]*>([^<]*)<\/t>/.exec(body!)?.[1] ?? ''
            return /t="s"/.test(attributes!) ? (shared[Number(value)] ?? '') : decodeXml(value)
          })
          .join(' | '),
      )
      return `Sheet ${i + 1}:\n${rows.filter((row) => row.replace(/[|\s]/g, '')).join('\n')}`
    })
    .join('\n\n')
}

const clip = (text: string) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n[…the rest is cut]` : text)

async function readOne(file: WorkFile): Promise<AiContent | null> {
  const kind = kindOf(file)
  const note = file.note ? ` The participant's note: ${file.note}` : ''
  const label = (text: string): AiContent[number] => ({ type: 'text', text })

  if (kind === 'image') {
    if (file.size > 40 * MB) return null
    if (await ffmpegAvailable()) {
      const data = await smallImage(await signedUrl(file.key))
      return [label(`File "${file.name}" (image):${note}`), { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: data.toString('base64') } }]
    }
    const type = file.contentType === 'image/png' ? 'image/png' : file.contentType === 'image/webp' ? 'image/webp' : file.contentType === 'image/jpeg' ? 'image/jpeg' : null
    if (!type || file.size > 3.5 * MB) return null
    const data = await getObjectBytes(file.key)
    return data && [label(`File "${file.name}" (image):${note}`), { type: 'image', source: { type: 'base64', media_type: type, data: data.toString('base64') } }]
  }

  if (kind === 'media') {
    if (file.size > MAX_VIDEO || !(await ffmpegAvailable())) return null
    const media = await readMedia(await signedUrl(file.key))
    const parts: AiContent = [label(`File "${file.name}" (video or recording, ${Math.round(media.seconds)} seconds).${note}`)]
    media.sheets.forEach((sheet, i) => {
      parts.push(label(i === 0 && media.sheets.length > 1 ? 'The first 4 seconds, two frames per second:' : 'Frames across the whole video, in order:'))
      parts.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: sheet.toString('base64') } })
    })
    parts.push(
      label(
        media.transcript === null
          ? 'The speech could not be transcribed. Judge only what you see, and say so.'
          : media.transcript
            ? `What is said in it (automatic transcript, small mistakes are possible):\n${clip(media.transcript)}`
            : 'Nobody speaks in it.',
      ),
    )
    return parts
  }

  if (kind === 'other' || file.size > MAX_DOCUMENT) return null
  const data = await getObjectBytes(file.key)
  if (!data) return null
  if (kind === 'pdf') {
    return [label(`File "${file.name}" (PDF):${note}`), { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data.toString('base64') } }]
  }
  const text = kind === 'office' ? officeText(data, file.name) : data.toString('utf8')
  if (!text.trim()) return null
  return [label(`File "${file.name}":${note}\n<file>\n${clip(text)}\n</file>`)]
}

/** The newest files, as message content. A file that cannot be opened is named in "skipped". */
export async function readFiles(files: WorkFile[]): Promise<ReadFiles> {
  const result: ReadFiles = { content: [], read: [], skipped: [] }
  const chosen = files.slice(-MAX_FILES)
  result.skipped.push(...files.slice(0, -MAX_FILES).map((f) => f.name))
  for (const file of chosen) {
    try {
      const parts = await readOne(file)
      if (parts) {
        result.content.push(...parts)
        result.read.push(file.name)
      } else result.skipped.push(file.name)
    } catch (err) {
      console.warn(`Could not read ${file.name} for the AI`, err)
      result.skipped.push(file.name)
    }
  }
  if (result.skipped.length) {
    result.content.push({ type: 'text', text: `Files you could not open (do not guess what is in them): ${result.skipped.join(', ')}` })
  }
  return result
}
