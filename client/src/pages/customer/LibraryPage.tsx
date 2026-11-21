import type { CSSProperties } from 'react'
import { FileList } from '../../components/FileList'
import { Icon } from '../../components/Icon'
import { VideoPlaylist } from '../../components/VideoPlaylist'
import { useCustomer } from './customerContext'
import { lessonVideos } from '../../lib/types'
import { NoPlan } from './NoPlan'

export function LibraryPage() {
  const { me, plan } = useCustomer()
  if (!plan) return <NoPlan name={me.name} />
  const lessons = lessonVideos(plan)

  return (
    <div className="cx-library">
      <header className="cx-deed cx-library__head" style={{ '--group': 'var(--teal)' } as CSSProperties}>
        <div className="cx-deed__band">
          <span className="cx-deed__eyebrow">{plan.title}</span>
          <h1>ספריית ההדרכה</h1>
        </div>
        <div className="cx-deed__body">
          <p>כל השיעורים המוקלטים של השלבים הפתוחים, סרטוני הדרכה וכל הקבצים שתצטרכו בדרך.</p>
        </div>
      </header>

      <section className="cx-section">
        <h2 className="cx-section__title">
          <Icon name="video" size={20} /> השיעורים המוקלטים
        </h2>
        <VideoPlaylist videos={lessons} heading="השיעורים המוקלטים" emptyText="אין עדיין שיעורים מוקלטים בשלבים הפתוחים." />
      </section>

      {plan.videos.length > 0 && (
        <section className="cx-section">
          <h2 className="cx-section__title">
            <Icon name="sparkles" size={20} /> סרטוני הדרכה
          </h2>
          <VideoPlaylist videos={plan.videos} heading="סרטוני הדרכה" />
        </section>
      )}

      <section className="cx-section">
        <h2 className="cx-section__title">
          <Icon name="file" size={20} /> קבצי התוכנית
        </h2>
        <FileList files={plan.files} emptyText="אין עדיין קבצים." />
      </section>
    </div>
  )
}
