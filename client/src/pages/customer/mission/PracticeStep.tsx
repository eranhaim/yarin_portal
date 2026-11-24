import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import type { MyPlan, MyTask, Worksheet, WorksheetView, WorkResult } from '../../../lib/types'
import { HomeworkPanel } from '../HomeworkPanel'
import { WorksheetPanel } from './WorksheetPanel'

// Practice on the customer's own business. When the work came back with notes, they stay in view while fixing.

type Props = {
  task: MyTask
  worksheet: Worksheet
  view: WorksheetView
  onView: (view: WorksheetView) => void
  onWork: (result: WorkResult) => void
  onPlan: (plan: MyPlan | null) => void
}

export function PracticeStep({ task, worksheet, view, onView, onWork, onPlan }: Props) {
  const [files, setFiles] = useState(task.submissions.length > 0)
  const { check } = task.flow
  const toFix = check === 'fix' && view.review ? view.review.improvements : []
  return (
    <div className="practice">
      {check === 'returned' && view.human && (
        <section className="practice__notes practice__notes--human">
          <h2>
            <Icon name="users" size={17} /> הערות של {view.human.by || 'ירין ואורן'}
          </h2>
          <p>{view.human.note}</p>
        </section>
      )}
      {toFix.length > 0 && (
        <section className="practice__notes">
          <h2>
            <Icon name="edit" size={17} /> מה לשפר בגרסה הזו
          </h2>
          <ol>
            {toFix.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ol>
        </section>
      )}
      <WorksheetPanel taskId={task.id} worksheet={worksheet} view={view} onView={onView} onWork={onWork} examiner={task.flow.steps.some((s) => s.key === 'check')} />
      {task.fileRule !== 'none' && task.fileRule !== 'required' && (
        <div className="practice__files">
          <button type="button" className="btn btn--sm btn--ghost-light" onClick={() => setFiles((v) => !v)} aria-expanded={files}>
            <Icon name="clip" size={15} /> {files ? 'קבצים מצורפים' : 'צירוף קבצים לעבודה (לא חובה)'}
          </button>
          {files && <HomeworkPanel task={task} onPlan={onPlan} />}
        </div>
      )}
    </div>
  )
}
