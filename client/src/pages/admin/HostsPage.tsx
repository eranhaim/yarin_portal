import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { LookEditor } from '../../components/mascot/LookEditor'
import { Mascot } from '../../components/mascot/Mascot'
import { api, errorMessage } from '../../lib/api'
import { squareImage } from '../../lib/media'
import type { Host, Look } from '../../lib/types'

// The characters of Yarin and Oren: the bosses on the login screen and on the invite page.
// Build each one by hand, or upload a photo and let the AI bot pick the features.

type HostKey = Host['key']

export function HostsPage() {
  const [hosts, setHosts] = useState<Host[] | null>(null)
  const [saved, setSaved] = useState<string>('')
  const [busy, setBusy] = useState<HostKey | 'save' | null>(null)
  const [hop, setHop] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    api<{ hosts: Host[] }>('/admin/settings')
      .then((res) => {
        setHosts(res.hosts)
        setSaved(JSON.stringify(res.hosts))
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  const dirty = hosts !== null && JSON.stringify(hosts) !== saved

  const setLook = (key: HostKey, look: Look) => {
    setHosts((list) => list?.map((h) => (h.key === key ? { ...h, look } : h)) ?? null)
    setHop((n) => n + 1)
    setNotice(null)
  }

  const fromPhoto = async (key: HostKey, file: File | undefined) => {
    if (!file) return
    setBusy(key)
    setError(null)
    try {
      const blob = await squareImage(file)
      const res = await api<{ look: Look }>('/admin/looks/detect', { method: 'POST', raw: blob })
      setLook(key, res.look)
      setNotice('הבוט יצר דמות לפי התמונה. אהבתם? שמרו.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    if (!hosts) return
    setBusy('save')
    setError(null)
    try {
      const body = Object.fromEntries(hosts.map((h) => [h.key, h.look]))
      const res = await api<{ hosts: Host[] }>('/admin/settings/hosts', { method: 'PUT', body })
      setHosts(res.hosts)
      setSaved(JSON.stringify(res.hosts))
      setNotice('הדמויות נשמרו. הן כבר במסך הכניסה.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>הדמויות של ירין ואורן</h1>
          <p>הבוסים שעומדים במסך הכניסה ובעמוד ההזמנה של חבר מביא חבר. העלו תמונה, או עצבו לבד.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={!dirty || busy !== null}>
          {busy === 'save' ? <span className="spinner" /> : <Icon name="check" size={18} />} שמירה
        </button>
      </header>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}
      {notice && <div className="alert alert--info">{notice}</div>}

      {!hosts ? (
        !error && (
          <div className="page-loader">
            <span className="spinner" />
          </div>
        )
      ) : (
        <div className="adm-hosts">
          {hosts.map((host) => (
            <HostCard
              key={host.key}
              host={host}
              hop={hop}
              busy={busy === host.key}
              disabled={busy !== null}
              onLook={(look) => setLook(host.key, look)}
              onPhoto={(file) => void fromPhoto(host.key, file)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

type CardProps = {
  host: Host
  hop: number
  busy: boolean
  disabled: boolean
  onLook: (look: Look) => void
  onPhoto: (file: File | undefined) => void
}

function HostCard({ host, hop, busy, disabled, onLook, onPhoto }: CardProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  return (
    <section className="adm-card adm-host">
      <div className="adm-host__stage">
        <Mascot className="adm-host__mascot" look={host.look} pose="boss" hopKey={hop} />
        <strong>{host.name}</strong>
      </div>
      <button type="button" className="btn btn--outline btn--block" onClick={() => fileInput.current?.click()} disabled={disabled}>
        {busy ? <span className="spinner" /> : <Icon name="sparkles" size={16} />}
        {busy ? 'הבוט מעצב…' : `דמות מתמונה של ${host.name}`}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        hidden
        onChange={(e) => {
          onPhoto(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <div className="adm-host__editor">
        <LookEditor look={host.look} onChange={(patch) => onLook({ ...host.look, ...patch })} />
      </div>
    </section>
  )
}
