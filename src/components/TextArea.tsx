import type { TextareaHTMLAttributes } from 'react'

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string
  label: string
  /** Shown after the label, for example "optioneel". */
  note?: string
}

export function TextArea({ id, label, note, className = '', ...props }: TextAreaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-semibold">
        {label}
        {note && <span className="font-normal text-muted"> · {note}</span>}
      </label>
      <textarea
        id={id}
        className={`min-h-16 w-full resize-none rounded-sm border-2 border-edge bg-surface px-3 py-2.5 text-base text-ink focus:border-charcoal focus:shadow-[0_0_0_1px_var(--color-charcoal)] focus:outline-none ${className}`}
        {...props}
      />
    </div>
  )
}
