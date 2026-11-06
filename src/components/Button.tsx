import type { ButtonHTMLAttributes } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary'
}

// Primary is charcoal, never red. Touch targets are at least 56px high.
const variants = {
  primary: 'border-charcoal bg-charcoal text-white',
  secondary: 'border-charcoal bg-surface text-charcoal',
}

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-[60px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-sm border-2 px-5 text-lg leading-tight font-bold disabled:cursor-not-allowed disabled:border-divider disabled:bg-divider disabled:text-muted ${variants[variant]} ${className}`}
      {...props}
    />
  )
}
