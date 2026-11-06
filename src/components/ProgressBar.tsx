export function ProgressBar({ label, done, total }: { label: string; done: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div>
      <div className="mb-1 flex justify-between font-bold">
        <span>{label}</span>
        <span>
          {done}/{total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-2 overflow-hidden rounded-sm bg-divider"
      >
        <span className="block h-full bg-charcoal" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
