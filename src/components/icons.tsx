const paths = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5" />
      <path d="M12 18v.5" />
    </>
  ),
  wrench: <path d="M14.5 5.5a4 4 0 0 0 5 5l-9 9a2.1 2.1 0 0 1-3-3l9-9a4 4 0 0 0-2-2z" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  close: <path d="M5 5l14 14M19 5L5 19" />,
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  up: <path d="M5 15l7-7 7 7" />,
  down: <path d="M5 9l7 7 7-7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  backspace: (
    <>
      <path d="M9 5h12v14H9l-6-7z" />
      <path d="M13 9l5 6M18 9l-5 6" />
    </>
  ),
  pencil: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v12H4z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M21 16l-5-5-8 8" />
    </>
  ),
  ruler: (
    <>
      <path d="M3 17L17 3l4 4L7 21z" />
      <path d="M7.5 12.5l2 2M10.5 9.5l2 2M13.5 6.5l2 2" />
    </>
  ),
}

export type IconName = keyof typeof paths

/** Stroke icons in the colour of the surrounding text. */
export function Icon({
  name,
  className = 'size-5',
  strokeWidth = 3,
}: {
  name: IconName
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`flex-none ${className}`}
    >
      {paths[name]}
    </svg>
  )
}
