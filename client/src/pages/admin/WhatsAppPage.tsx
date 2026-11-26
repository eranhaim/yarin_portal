import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import type { WhatsAppKind, WhatsAppSettings, WhatsAppStatus } from '../../lib/types'

// WhatsApp messages (Green API): the linked account, which messages go out, a test message, and the log.

const KINDS: { key: Exclude<WhatsAppKind, 'test'>; label: string; who: 'customer' | 'admin'; hint: string }[] = [
  { key: 'welcome', who: 'customer', label: 'ברוכים הבאים', hint: 'כשנוצר לקוח עם מספר נייד: קישור לכניסה והמייל שלו.' },
  { key: 'decision', who: 'customer', label: 'התשובה שלכם על עבודה', hint: 'כשאתם מאשרים, מחזירים עם הערות, או כותבים הערה.' },
  { key: 'reminder', who: 'customer', label: 'תזכורת כשאין פעילות', hint: 'אחרי 3 ימים ואחרי 7 ימים בלי פעילות: המשימה הבאה. לא יותר.' },
  { key: 'monthly', who: 'customer', label: 'מספרי העסק של החודש', hint: 'ב-1 עד 3 לחודש, אם עוד לא עדכנו את החודש שעבר.' },
  { key: 'adminRequest', who: 'admin', label: 'בקשה לבדיקה אישית', hint: 'לקוח ביקש שתעברו על עבודה, או המשיך עם עבודה שלא עברה.' },
  { key: 'adminLead', who: 'admin', label: 'ליד חדש', hint: 'מישהו השאיר פרטים בקישור של חבר מביא חבר.' },
  { key: 'adminDigest', who: 'admin', label: 'סיכום בוקר', hint: 'עבודות שמחכות, לידים חדשים, ולקוחות בלי פעילות שבוע. רק כשיש משהו.' },
  { key: 'adminAi', who: 'admin', label: 'הבינה המלאכותית נעצרה או חזרה', hint: 'למשל כשנגמר הקרדיט ב-Anthropic.' },
]

const KIND_LABEL: Record<WhatsAppKind, string> = { ...Object.fromEntries(KINDS.map((k) => [k.key, k.label])), test: 'בדיקה' } as Record<WhatsAppKind, string>

const STATUS: Record<'queued' | 'sent' | 'failed', { label: string; chip: string }> = {
  sent: { label: 'נשלחה', chip: 'chip--success' },
  queued: { label: 'ממתינה', chip: 'chip--warn' },
  failed: { label: 'לא נשלחה', chip: 'chip--danger' },
}

export function WhatsAppPage() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null)
  const [draft, setDraft] = useState<WhatsAppSettings | null>(null)
  const [phones, setPhones] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)
  const [testPhone, setTestPhone] = useState('')

  const load = async () => {
    try {
      const res = await api<WhatsAppStatus>('/admin/whatsapp')
      setStatus(res)
      setDraft(res.settings)
      setPhones(res.settings.adminPhones.join(', '))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const save = async () => {
    if (!draft) return
    setBusy('save')
    setError(null)
    setMessage(null)
    try {
      const adminPhones = phones
        .split(/[,\n;]+/)
        .map((p) => p.trim())
        .filter(Boolean)
      const res = await api<{ settings: WhatsAppSettings }>('/admin/whatsapp/settings', { method: 'PUT', body: { ...draft, adminPhones } })
      setDraft(res.settings)
      setPhones(res.settings.adminPhones.join(', '))
      setMessage('ההגדרות נשמרו.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const test = async () => {
    setBusy('test')
    setError(null)
    setMessage(null)
    try {
      await api('/admin/whatsapp/test', { body: { phone: testPhone.trim() } })
      setMessage(testPhone.trim() ? 'הודעת הבדיקה נשלחה.' : 'הודעת הבדיקה נשלחה למספר המחובר (בצ׳אט „אני” בוואטסאפ).')
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const linked = status?.state === 'authorized'

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>הודעות בוואטסאפ</h1>
          <p>
            הודעות ללקוחות וללכם, דרך Green API. בלילה ובשבת שום הודעה לא יוצאת: היא מחכה לבוקר. לקוח יכול לכבות את ההודעות בדף הדמות שלו, ואתם בכרטיס הלקוח.
          </p>
        </div>
      </header>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}
      {message && <div className="alert alert--info">{message}</div>}

      {!status || !draft ? (
        !error && (
          <div className="page-loader">
            <span className="spinner" />
          </div>
        )
      ) : (
        <div className="adm-wa">
          <section className="adm-card adm-wa__status">
            <h2>החיבור</h2>
            {!status.configured ? (
              <p>Green API לא מוגדר בשרת (GREEN_API_ID ו-GREEN_API_TOKEN בקובץ ההגדרות).</p>
            ) : (
              <>
                <p className="adm-wa__state">
                  <span className={`adm-dot${linked ? ' is-ok' : ''}`} /> {linked ? 'מחובר ומוכן לשליחה' : `לא מחובר (${status.state ?? 'לא ידוע'}): סרקו מחדש את הקוד בקונסולה של Green API`}
                </p>
                {status.number && (
                  <p>
                    שולח מהמספר <strong className="ltr">+{status.number}</strong>
                  </p>
                )}
                <p className="adm-wa__counts">
                  {(['sent', 'queued', 'failed'] as const).map((k) => (
                    <span key={k} className={`chip ${STATUS[k].chip}`}>
                      {STATUS[k].label}: {status.counts[k] ?? 0}
                    </span>
                  ))}
                </p>
                <p className="adm-wa__note">
                  בתוכנית החינמית של Green API אפשר לשלוח לשלושה צ׳אטים שונים בחודש בלבד. לכל הלקוחות צריך את תוכנית Business בקונסולה של Green API.
                </p>
                <div className="adm-wa__test">
                  <input className="input ltr" type="tel" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="מספר לבדיקה (ריק = המספר המחובר)" />
                  <button type="button" className="btn" onClick={() => void test()} disabled={busy !== null}>
                    {busy === 'test' ? <span className="spinner" /> : <Icon name="send" size={16} />} הודעת בדיקה
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="adm-card adm-wa__settings">
            <h2>מה נשלח</h2>
            <label className="toggle">
              <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
              <strong>הודעות בוואטסאפ פעילות</strong>
            </label>
            {(['customer', 'admin'] as const).map((who) => (
              <fieldset key={who} className="adm-wa__group" disabled={!draft.enabled}>
                <legend>{who === 'customer' ? 'ללקוחות' : 'לכם (ירין ואורן)'}</legend>
                {KINDS.filter((k) => k.who === who).map((k) => (
                  <label key={k.key} className="toggle adm-wa__kind">
                    <input type="checkbox" checked={draft.kinds[k.key]} onChange={(e) => setDraft({ ...draft, kinds: { ...draft.kinds, [k.key]: e.target.checked } })} />
                    <span>
                      {k.label}
                      <small>{k.hint}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
            <label className="field">
              <span className="field__label">
                המספרים שלכם <small>(עד 4, מופרדים בפסיק. ריק = המספר המחובר עצמו)</small>
              </span>
              <input className="input ltr" type="text" value={phones} onChange={(e) => setPhones(e.target.value)} placeholder="050-1234567, 052-7654321" />
            </label>
            <label className="toggle">
              <input type="checkbox" checked={draft.quiet} onChange={(e) => setDraft({ ...draft, quiet: e.target.checked })} />
              שעות שקטות: לא בלילה (21:00-08:30), ולא משישי בצהריים עד מוצאי שבת
            </label>
            <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={busy !== null}>
              {busy === 'save' ? <span className="spinner" /> : <Icon name="check" size={16} />} שמירה
            </button>
          </section>

          <section className="adm-card adm-wa__log">
            <div className="adm-card__head">
              <h2>הודעות אחרונות</h2>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => void load()}>
                <Icon name="refresh" size={15} /> רענון
              </button>
            </div>
            {status.messages.length === 0 ? (
              <p>עוד לא נשלחו הודעות.</p>
            ) : (
              <ul className="adm-wa__list">
                {status.messages.map((m) => (
                  <li key={m.id}>
                    <div className="adm-wa__meta">
                      <span className={`chip ${STATUS[m.status].chip}`}>{STATUS[m.status].label}</span>
                      <strong>{m.to}</strong>
                      {m.phone && <span className="ltr">+{m.phone}</span>}
                      <span>· {KIND_LABEL[m.kind]}</span>
                      <time>
                        {m.status === 'sent' && m.sentAt ? formatDateTime(m.sentAt) : m.status === 'queued' ? `יוצאת ב-${formatDateTime(m.sendAfter)}` : formatDateTime(m.createdAt)}
                      </time>
                    </div>
                    <p className="adm-wa__text">{m.text}</p>
                    {m.error && <small className="adm-wa__error">{m.error}</small>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
