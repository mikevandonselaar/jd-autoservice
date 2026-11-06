import type { ReactNode } from 'react'
import { Link } from 'react-router'
import logo from '../assets/logo.png'
import { Icon } from './icons'

// Diagonal edge where the header meets the red accent (design M1 to M6).
const diagonal = '[clip-path:polygon(32px_0,100%_0,100%_100%,0_100%)]'

type AppShellProps = {
  /** Text in the red and charcoal panel on the right of the header, usually the user's name. */
  panel?: string
  /** Replaces the logo on the left of the header, for example the licence plate or a back button. */
  headerStart?: ReactNode
  /** Band under the header that stays in view while the page scrolls, for example progress. */
  subheader?: ReactNode
  footer?: ReactNode
  children: ReactNode
}

export function AppShell({ panel, headerStart, subheader, footer, children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex h-[60px] flex-none items-stretch border-b border-divider bg-surface">
        <div className="flex min-w-0 flex-1 items-center">
          {headerStart ?? (
            <Link to="/" className="flex h-full items-center px-4">
              <img src={logo} alt="JD Autoservice" className="block h-[26px] w-auto" />
            </Link>
          )}
        </div>
        {panel && (
          <div className={`flex min-w-[140px] max-w-[60%] flex-none bg-brand ${diagonal}`}>
            <div
              className={`ml-2.5 flex min-w-0 flex-1 items-center justify-end bg-charcoal pr-4 pl-10 text-base font-bold text-white ${diagonal}`}
            >
              <span className="truncate">{panel}</span>
            </div>
          </div>
        )}
      </header>

      {subheader && (
        <div className="sticky top-[60px] z-10 flex-none border-b-2 border-charcoal bg-surface">
          <div className="mx-auto max-w-[480px] px-4 pt-2.5 pb-3">{subheader}</div>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-3 px-4 py-3.5">
        {children}
      </main>

      {footer && (
        <footer className="sticky bottom-0 z-10 flex-none border-t border-divider bg-surface">
          <div className="mx-auto flex max-w-[480px] flex-col gap-3 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        </footer>
      )}
    </div>
  )
}

type BackHeaderProps = {
  to: string
  /** Accessible name of the back button, for example "Terug naar checklist". */
  label: string
  title: string
  /** Content on the right, for example the licence plate. */
  end?: ReactNode
}

/** Header content with a back button and a title (design M5). Pass it as `headerStart`. */
export function BackHeader({ to, label, title, end }: BackHeaderProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 pr-4 pl-2">
      <Link to={to} aria-label={label} className="flex h-14 w-12 flex-none items-center justify-center text-charcoal">
        <Icon name="back" className="size-[22px]" />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-xl">{title}</h1>
      {end}
    </div>
  )
}
