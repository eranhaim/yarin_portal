import { fileExtension, formatBytes } from '../lib/format'
import type { Asset } from '../lib/types'
import { Icon } from './Icon'

const FILE_TONES: Record<string, string> = {
  pdf: 'red',
  doc: 'blue',
  docx: 'blue',
  txt: 'slate',
  xls: 'green',
  xlsx: 'green',
  csv: 'green',
  ppt: 'orange',
  pptx: 'orange',
  key: 'orange',
  zip: 'purple',
  rar: 'purple',
  png: 'teal',
  jpg: 'teal',
  jpeg: 'teal',
  webp: 'teal',
  mp3: 'pink',
  wav: 'pink',
}

export function FileBadge({ fileName }: { fileName: string }) {
  const ext = fileExtension(fileName)
  return (
    <span className={`file-badge file-badge--${FILE_TONES[ext] ?? 'slate'}`} aria-hidden="true">
      {ext ? ext.slice(0, 4).toUpperCase() : <Icon name="file" size={18} />}
    </span>
  )
}

export function FileList({ files, emptyText = 'אין קבצים עדיין.' }: { files: Asset[]; emptyText?: string }) {
  if (files.length === 0) return <p className="empty-note">{emptyText}</p>
  return (
    <ul className="file-list">
      {files.map((file) => (
        <li key={file.id} className="file-list__item">
          <FileBadge fileName={file.fileName} />
          <div className="file-list__text">
            <span className="file-list__title">{file.title}</span>
            <span className="file-list__meta">
              <span className="ltr">{formatBytes(file.size)}</span> · {file.fileName}
            </span>
          </div>
          {file.downloadUrl && (
            <a className="btn btn--soft btn--sm" href={file.downloadUrl} download={file.fileName}>
              <Icon name="download" size={16} />
              <span>הורדה</span>
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}
