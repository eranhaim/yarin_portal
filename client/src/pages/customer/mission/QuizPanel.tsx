import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { api, errorMessage } from '../../../lib/api'
import type { MyPlan, PublicQuiz, QuizResult } from '../../../lib/types'

// The lesson quiz: one question at a time, then the score with explanations. Points for the best try.

type Props = {
  taskId: string
  quiz: PublicQuiz
  best: { correct: number; total: number; tries: number } | null
  /** The plan after the quiz (the step may be done). */
  onResult: (plan: MyPlan, completed: boolean) => void
  onNext: () => void
}

export function QuizPanel({ taskId, quiz, best, onResult, onNext }: Props) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<QuizResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const question = quiz.questions[step]

  const choose = async (option: number) => {
    const next = [...answers.slice(0, step), option]
    setAnswers(next)
    if (step < quiz.questions.length - 1) {
      window.setTimeout(() => setStep(step + 1), 220)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await api<QuizResult>(`/me/tasks/${taskId}/quiz`, { body: { answers: next } })
      setResult(res)
      onResult(res.plan, res.completed)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const restart = () => {
    setResult(null)
    setAnswers([])
    setStep(0)
  }

  if (result) {
    const perfect = result.correct === result.total
    // The same share as on the server (QUIZ_PASS).
    const passed = result.correct / result.total >= 0.6
    return (
      <section className="panel quiz">
        <div className={`quiz__score${perfect ? ' is-perfect' : ''}`}>
          <span className="quiz__big">
            {result.correct}/{result.total}
          </span>
          <span>{perfect ? 'מושלם. הרעיון יושב.' : passed ? 'עברתם. כדאי לקרוא את ההסברים למה שפספסתם.' : 'עוד לא. קראו את ההסברים ונסו שוב.'}</span>
          {result.gained > 0 && <b className="quiz__gain">+{result.gained} XP</b>}
        </div>
        <ol className="quiz__review">
          {quiz.questions.map((q, i) => {
            const r = result.results[i]!
            return (
              <li key={i} className={r.correct ? 'is-correct' : 'is-wrong'}>
                <strong>
                  <Icon name={r.correct ? 'check' : 'x'} size={16} /> {q.question}
                </strong>
                {!r.correct && <span>התשובה הנכונה: {q.options[r.answer]}</span>}
                <small>{r.explanation}</small>
              </li>
            )
          })}
        </ol>
        <div className="quiz__actions">
          {passed && (
            <button type="button" className="btn btn--game btn--lg" onClick={onNext}>
              ממשיכים לשלב הבא
            </button>
          )}
          {!perfect && (
            <button type="button" className={`btn ${passed ? 'btn--ghost-light' : 'btn--game btn--lg'}`} onClick={restart}>
              <Icon name="refresh" size={18} /> ניסיון נוסף
            </button>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="panel quiz">
      <header className="panel__head">
        <div>
          <h2>חידון השיעור</h2>
          <p>
            {quiz.questions.length} שאלות קצרות. 60% נכון סוגר את השלב.
            {best && ` השיא שלכם: ${best.correct}/${best.total}.`}
          </p>
        </div>
        <span className="quiz__progress">
          {step + 1}/{quiz.questions.length}
        </span>
      </header>
      <div className="quiz__dots" aria-hidden="true">
        {quiz.questions.map((_, i) => (
          <i key={i} className={i < step ? 'is-done' : i === step ? 'is-now' : ''} />
        ))}
      </div>
      {question && (
        <div key={step} className="quiz__card">
          <h3>{question.question}</h3>
          <div className="quiz__options">
            {question.options.map((option, i) => (
              <button
                key={i}
                type="button"
                className={`quiz__option${answers[step] === i ? ' is-picked' : ''}`}
                onClick={() => void choose(i)}
                disabled={busy}
              >
                <b>{['א', 'ב', 'ג', 'ד', 'ה', 'ו'][i]}</b>
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
      {busy && (
        <p className="quiz__checking">
          <span className="spinner" /> בודקים…
        </p>
      )}
      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}
    </section>
  )
}
