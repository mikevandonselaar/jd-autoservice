import type { ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router'

type Variant = 'primary' | 'secondary'

// Primary is charcoal, never red. Touch targets are at least 56px high.
const variants: Record<Variant, string> = {
  primary: 'border-charcoal bg-charcoal text-white',
  secondary: 'border-charcoal bg-surface text-charcoal',
}

const base =
  'inline-flex min-h-14 w-full cursor-pointer items-center justify-center gap-2.5 rounded-sm border-2 px-5 text-lg leading-tight font-bold disabled:cursor-not-allowed disabled:border-divider disabled:bg-divider disabled:text-muted'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
}

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`${base} ${variants[variant]} ${className}`} {...props} />
}

/** A link that looks like a Button. */
export function LinkButton({ variant = 'primary', className = '', ...props }: LinkProps & { variant?: Variant }) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...props} />
}
