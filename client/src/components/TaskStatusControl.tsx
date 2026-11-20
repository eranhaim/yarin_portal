import type { TaskStatus } from '../lib/types'
import { Icon } from './Icon'

const OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'started', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
]

type Props = {
  value: TaskStatus
  onChange: (status: TaskStatus) => void
  disabled?: boolean
  size?: 'sm' | 'md'
}

/** Three-way switch for a task's status. */
export function TaskStatusControl({ value, onChange, disabled, size = 'md' }: Props) {
  return (
    <div className={`status-switch status-switch--${size}`} role="radiogroup" aria-label="Task status">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`status-switch__option status-switch__option--${option.value}`}
          disabled={disabled}
          onClick={() => value !== option.value && onChange(option.value)}
        >
          {option.value === 'completed' && <Icon name="check" size={14} />}
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function StatusPill({ status }: { status: TaskStatus }) {
  const label = OPTIONS.find((o) => o.value === status)?.label
  return <span className={`status-pill status-pill--${status}`}>{label}</span>
}
