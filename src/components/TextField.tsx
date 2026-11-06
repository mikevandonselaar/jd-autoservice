import type { InputHTMLAttributes } from 'react'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string
  label: string
  hint?: string
}

export function TextField({ id, label, hint, className = '', ...props }: TextFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-semibold">
        {label}
      </label>
      {/* Active field: charcoal edge, thickened with a shadow so the layout does not shift. */}
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={`h-[60px] w-full rounded-sm border-2 border-edge bg-surface px-3 text-lg text-ink focus:border-charcoal focus:shadow-[0_0_0_1px_var(--color-charcoal)] focus:outline-none ${className}`}
        {...props}
      />
      {hint && (
        <span id={`${id}-hint`} className="text-base text-muted">
          {hint}
        </span>
      )}
    </div>
  )
}
