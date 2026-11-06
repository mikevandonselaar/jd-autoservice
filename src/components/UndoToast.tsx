/** A short message with one undo button, above the footer. The page decides when it disappears. */
export function UndoToast({ text, onUndo }: { text: string; onUndo: () => void }) {
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[104px] z-20 mx-auto flex max-w-[456px] items-center gap-2.5 rounded-sm bg-ink py-1 pr-1 pl-3.5 font-semibold text-white"
    >
      <span className="flex-1">{text}</span>
      <button
        type="button"
        onClick={onUndo}
        className="min-h-14 cursor-pointer rounded-sm border-2 border-white px-3.5 font-bold"
      >
        Herstel
      </button>
    </div>
  )
}
