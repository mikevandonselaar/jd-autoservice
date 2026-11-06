import type { InputHTMLAttributes } from 'react'

const sizes = {
  sm: 'h-8 px-2 text-base',
  md: 'h-9 px-2.5 text-lg',
}

/** A licence plate as text, for headers and summaries. */
export function PlateBadge({ plate, size = 'sm' }: { plate: string; size?: keyof typeof sizes }) {
  return (
    <span
      className={`inline-flex flex-none items-center rounded-sm border-2 border-ink bg-plate font-bold tracking-[0.05em] text-ink ${sizes[size]}`}
    >
      {plate}
    </span>
  )
}

type PlateFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  id: string
  label: string
}

/** The licence plate input of the start screen: yellow, with the blue EU band. */
export function PlateField({ id, label, ...props }: PlateFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-semibold">
        {label}
      </label>
      <div className="flex h-14 items-stretch overflow-hidden rounded-sm border-2 border-ink bg-plate font-bold tracking-[0.06em] text-ink focus-within:shadow-[0_0_0_2px_var(--color-charcoal)]">
        <span
          aria-hidden="true"
          className="flex w-5 flex-none items-end justify-center bg-plate-eu px-[3px] pb-0.5 text-[10px] tracking-normal text-white"
        >
          NL
        </span>
        <input
          id={id}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full min-w-0 flex-1 bg-transparent px-1 text-center text-xl tracking-[0.04em] uppercase focus:outline-none"
          {...props}
        />
      </div>
    </div>
  )
}
