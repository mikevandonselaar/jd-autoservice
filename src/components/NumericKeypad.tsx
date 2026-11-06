import { Icon } from './icons'

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | ',' | 'back'

// Four columns and three rows, so it stays low on the screen.
const keys: KeypadKey[] = ['1', '2', '3', 'back', '4', '5', '6', ',', '7', '8', '9', '0']

/** Our own keypad, so the phone keyboard does not cover the screen while measuring. */
export function NumericKeypad({ onKey }: { onKey: (key: KeypadKey) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onKey(key)}
          aria-label={key === ',' ? 'Komma' : key === 'back' ? 'Wissen' : undefined}
          className="flex h-14 cursor-pointer items-center justify-center rounded-sm border-2 border-divider bg-surface text-2xl font-bold text-ink active:bg-canvas"
        >
          {key === 'back' ? <Icon name="backspace" className="size-6 text-charcoal" strokeWidth={2.4} /> : key}
        </button>
      ))}
    </div>
  )
}
