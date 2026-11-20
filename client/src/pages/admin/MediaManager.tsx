import { useRef, useState, type DragEvent } from 'react'
import { FileBadge } from '../../components/FileList'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { VideoPlayer } from '../../components/VideoPlayer'
import { api, errorMessage } from '../../lib/api'
import { formatBytes, formatDuration } from '../../lib/format'
import type { Asset } from '../../lib/types'
import { uploadAsset } from '../../lib/upload'

type Props = {
  planId: string
  /** null = the plan's own videos/files; otherwise the task they belong to. */
  taskId: string | null
  kind: Asset['kind']
  /** Only the assets of this list, already sorted. */
  assets: Asset[]
  onChange: (update: (all: Asset[]) => Asset[]) => void
}

type Upload = { key: string; name: string; progress: number; error?: string }

/** Upload, sort, rename and delete the videos or files of a plan or a task. */
export function MediaManager({ planId, taskId, kind, assets, onChange }: Props) {
  const [uploads, setUploads] = useState<Upload[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null)
  const [preview, setPreview] = useState<Asset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const isVideo = kind === 'video'

  const patchUpload = (key: string, patch: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)))

  const start = async (files: File[]) => {
    const queue = files.map((file) => ({ key: crypto.randomUUID(), file }))
    setUploads((list) => [...list, ...queue.map(({ key, file }) => ({ key, name: file.name, progress: 0 }))])
    // One at a time, so big videos do not compete for bandwidth.
    for (const { key, file } of queue) {
      try {
        const asset = await uploadAsset({
          planId,
          taskId,
          kind,
          file,
          onProgress: (p) => patchUpload(key, { progress: p }),
        })
        onChange((all) => [...all, asset])
        setUploads((list) => list.filter((u) => u.key !== key))
      } catch (err) {
        patchUpload(key, { error: errorMessage(err) })
      }
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = [...e.dataTransfer.files].filter((f) => !isVideo || f.type.startsWith('video/') || /\.(mp4|m4v|mov|webm|mkv)$/i.test(f.name))
    if (files.length) void start(files)
  }

  const move = async (index: number, direction: -1 | 1) => {
    const ids = assets.map((a) => a.id)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
    const order = new Map(ids.map((id, i) => [id, i]))
    onChange((all) => all.map((a) => (order.has(a.id) ? { ...a, order: order.get(a.id)! } : a)))
    try {
      await api(`/admin/plans/${planId}/assets/order`, { method: 'PUT', body: { ids } })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const saveTitle = async () => {
    if (!editing) return
    const { id, title } = editing
    setEditing(null)
    const current = assets.find((a) => a.id === id)
    if (!title.trim() || title.trim() === current?.title) return
    try {
      const res = await api<{ asset: Asset }>(`/admin/assets/${id}`, { method: 'PATCH', body: { title } })
      onChange((all) => all.map((a) => (a.id === id ? res.asset : a)))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const remove = async (asset: Asset) => {
    if (!window.confirm(`Delete “${asset.title}”? The file is removed from storage.`)) return
    try {
      await api(`/admin/assets/${asset.id}`, { method: 'DELETE' })
      onChange((all) => all.filter((a) => a.id !== asset.id))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="media">
      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={16} /> {error}
          <button type="button" className="icon-btn" onClick={() => setError(null)} aria-label="Dismiss">
            <Icon name="x" size={16} />
          </button>
        </div>
      )}

      {assets.length > 0 && (
        <ol className="media__list">
          {assets.map((asset, i) => (
            <li key={asset.id} className="media__item">
              {isVideo ? (
                <button type="button" className="media__thumb" onClick={() => setPreview(asset)} aria-label={`Preview ${asset.title}`}>
                  {asset.posterUrl ? <img src={asset.posterUrl} alt="" /> : <Icon name="video" size={20} />}
                  <span className="media__play">
                    <Icon name="play" size={14} />
                  </span>
                </button>
              ) : (
                <FileBadge fileName={asset.fileName} />
              )}

              <div className="media__text">
                {editing?.id === asset.id ? (
                  <input
                    className="input media__title-input"
                    value={editing.title}
                    autoFocus
                    onChange={(e) => setEditing({ id: asset.id, title: e.target.value })}
                    onBlur={() => void saveTitle()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveTitle()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                    aria-label="Title"
                  />
                ) : (
                  <span className="media__title">{asset.title}</span>
                )}
                <span className="media__meta">
                  {isVideo && asset.durationSeconds ? `${formatDuration(asset.durationSeconds)} · ` : ''}
                  {asset.fileName} · {formatBytes(asset.size)}
                </span>
              </div>

              <div className="media__actions">
                {!isVideo && asset.downloadUrl && (
                  <a className="icon-btn" href={asset.downloadUrl} aria-label="Download" title="Download">
                    <Icon name="download" size={16} />
                  </a>
                )}
                <button type="button" className="icon-btn" onClick={() => setEditing({ id: asset.id, title: asset.title })} aria-label="Rename" title="Rename">
                  <Icon name="edit" size={16} />
                </button>
                <button type="button" className="icon-btn" onClick={() => void move(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">
                  <Icon name="arrowUp" size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => void move(i, 1)}
                  disabled={i === assets.length - 1}
                  aria-label="Move down"
                  title="Move down"
                >
                  <Icon name="arrowDown" size={16} />
                </button>
                <button type="button" className="icon-btn icon-btn--danger" onClick={() => void remove(asset)} aria-label="Delete" title="Delete">
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {uploads.length > 0 && (
        <ul className="media__uploads">
          {uploads.map((u) => (
            <li key={u.key} className={u.error ? 'is-error' : ''}>
              <div className="media__upload-row">
                <span className="media__upload-name">{u.name}</span>
                <span>{u.error ? 'Failed' : `${Math.round(u.progress * 100)}%`}</span>
                {u.error && (
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setUploads((list) => list.filter((x) => x.key !== u.key))}
                    aria-label="Dismiss"
                  >
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
              {u.error ? (
                <span className="field__error">{u.error}</span>
              ) : (
                <div className="progress">
                  <div className="progress__bar" style={{ width: `${u.progress * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div
        className={`media__drop${dragOver ? ' is-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <button type="button" className="btn btn--soft btn--sm" onClick={() => input.current?.click()}>
          <Icon name="upload" size={15} /> {isVideo ? 'Upload videos' : 'Upload files'}
        </button>
        <span>or drop {isVideo ? 'videos' : 'files'} here · {isVideo ? 'MP4 (H.264) plays everywhere · ' : ''}up to 5 GB each</span>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={isVideo ? 'video/*' : undefined}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            if (files.length) void start(files)
          }}
        />
      </div>

      <Modal open={preview !== null} onClose={() => setPreview(null)} title={preview?.title ?? 'Video'} size="xl">
        {preview?.url && <VideoPlayer src={preview.url} poster={preview.posterUrl} title={preview.title} autoPlay />}
      </Modal>
    </div>
  )
}
