import { FileList } from '../../components/FileList'
import { Icon } from '../../components/Icon'
import { VideoPlaylist } from '../../components/VideoPlaylist'
import { useCustomer } from './customerContext'
import { NoPlan } from './NoPlan'

export function LibraryPage() {
  const { me, plan } = useCustomer()
  if (!plan) return <NoPlan name={me.name} />

  return (
    <div className="cx-library">
      <header className="cx-library__head">
        <p className="cx-eyebrow">{plan.title}</p>
        <h1>Guidance library</h1>
        <p>Videos with guidance and instructions for your plan, and the files you need along the way.</p>
      </header>

      <section className="cx-section">
        <h2 className="cx-section__title">
          <Icon name="video" size={20} /> Guidance videos
        </h2>
        <VideoPlaylist videos={plan.videos} heading="Guidance videos" emptyText="There are no guidance videos yet." />
      </section>

      <section className="cx-section">
        <h2 className="cx-section__title">
          <Icon name="file" size={20} /> Plan files
        </h2>
        <FileList files={plan.files} emptyText="There are no files yet." />
      </section>
    </div>
  )
}
