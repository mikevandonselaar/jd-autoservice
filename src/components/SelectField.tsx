import type { SelectHTMLAttributes } from 'react'

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  id: string
  label: string
}

export function SelectField({ id, label, className = '', children, ...props }: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-semibold">
        {label}
      </label>
      <select
        id={id}
        className={`h-14 w-full rounded-sm border-2 border-edge bg-surface px-3 text-lg text-ink focus:border-charcoal focus:shadow-[0_0_0_1px_var(--color-charcoal)] focus:outline-none ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}
