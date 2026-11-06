import type { ReactNode } from 'react'
import logo from '../assets/logo.png'

// Diagonal edge where the header meets the red accent (design M1 to M6).
const diagonal = '[clip-path:polygon(32px_0,100%_0,100%_100%,0_100%)]'

type AppShellProps = {
  /** Text in the red and charcoal panel on the right of the header, usually the user's name. */
  panel?: string
  footer?: ReactNode
  children: ReactNode
}

export function AppShell({ panel, footer, children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-[60px] flex-none items-stretch border-b border-divider bg-surface">
        <div className="flex items-center px-4">
          <img src={logo} alt="JD Autoservice" className="block h-[26px] w-auto" />
        </div>
        {panel && (
          <div className={`ml-auto flex min-w-[140px] max-w-[60%] bg-brand ${diagonal}`}>
            <div
              className={`ml-2.5 flex min-w-0 flex-1 items-center justify-end bg-charcoal pr-4 pl-10 text-base font-bold text-white ${diagonal}`}
            >
              <span className="truncate">{panel}</span>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-4 px-4 py-[18px]">
        {children}
      </main>

      {footer && (
        <footer className="flex-none border-t border-divider bg-surface">
          <div className="mx-auto flex max-w-[480px] flex-col gap-3 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        </footer>
      )}
    </div>
  )
}
