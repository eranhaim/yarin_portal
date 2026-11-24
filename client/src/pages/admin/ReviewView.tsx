import { Icon } from '../../components/Icon'
import type { ChatTurn, Review } from '../../lib/types'

/** The AI examiner's check of a work, for the admins: criteria with quotes, what to fix, and the defense. */
export function ReviewView({ review, chat }: { review: Review; chat: ChatTurn[] }) {
  return (
    <div className="adm-review">
      <h4>
        הבוחן: {review.finalScore ?? review.score}
        {review.finalScore !== null && review.finalScore !== review.score && <small> (לפני השאלות: {review.score})</small>}
      </h4>
      <p>{review.summary}</p>
      {review.progress && (
        <p className="adm-review__progress">
          <Icon name="trendUp" size={15} /> {review.progress}
        </p>
      )}
      {(review.criteria ?? []).length > 0 && (
        <ul className="adm-review__criteria">
          {review.criteria.map((c, i) => (
            <li key={i} className={`is-${c.status}`}>
              <strong>{c.criterion}</strong>
              {c.evidence && <q>{c.evidence}</q>}
              {c.fix && c.status !== 'met' && <span>{c.fix}</span>}
            </li>
          ))}
        </ul>
      )}
      {review.improvements.length > 0 && (
        <>
          <h5>מה לשפר</h5>
          <ul>
            {review.improvements.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      {(review.filesRead ?? []).length > 0 && <small>קבצים שנקראו: {review.filesRead.join(', ')}</small>}
      {(review.filesSkipped ?? []).length > 0 && <small>קבצים שלא נפתחו: {review.filesSkipped.join(', ')}</small>}
      {chat.length > 0 && (
        <div className="adm-transcript">
          <h5>השאלות של הבוחן</h5>
          {chat.map((t, i) => (
            <p key={i} className={`adm-transcript__turn adm-transcript__turn--${t.role}`}>
              <b>{t.role === 'user' ? 'הלקוח' : 'הבוחן'}</b> {t.text}
            </p>
          ))}
        </div>
      )}
      {review.finalNote && <p className="adm-review__final">{review.finalNote}</p>}
    </div>
  )
}
