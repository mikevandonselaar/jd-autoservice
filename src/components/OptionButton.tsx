import type { ButtonHTMLAttributes } from 'react'

type OptionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> & {
  selected: boolean
}

/** One choice out of a group: a pressed button, not a radio, so it also works as a toggle. */
export function OptionButton({ selected, className = '', type = 'button', ...props }: OptionButtonProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={`flex min-h-14 cursor-pointer items-center justify-center rounded-sm border-2 px-2 text-center text-[17px] leading-tight ${
        selected
          ? 'border-charcoal bg-charcoal font-bold text-white'
          : 'border-edge bg-surface font-semibold text-ink'
      } ${className}`}
      {...props}
    />
  )
}
