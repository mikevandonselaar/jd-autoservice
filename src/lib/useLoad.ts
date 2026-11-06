import { useCallback, useEffect, useRef, useState } from 'react'

export type Loaded<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T }

/**
 * Loads data once when the screen opens. `reload` fetches again, `reload(true)` keeps showing
 * the current data meanwhile and keeps it when the fetch fails. `update` changes the loaded data
 * in place, for edits that are saved at the same time.
 */
export function useLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const loader = useRef(load)
  const quiet = useRef(false)

  useEffect(() => {
    loader.current = load
  })

  useEffect(() => {
    let active = true
    loader.current().then(
      (data) => {
        if (active) setState({ status: 'ready', data })
      },
      () => {
        if (active) setState((current) => (quiet.current && current.status === 'ready' ? current : { status: 'error' }))
      },
    )
    return () => {
      active = false
    }
  }, [attempt])

  const reload = useCallback((keepData = false) => {
    quiet.current = keepData
    if (!keepData) setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  const update = useCallback((change: (data: T) => T) => {
    setState((current) => (current.status === 'ready' ? { status: 'ready', data: change(current.data) } : current))
  }, [])

  return { state, reload, update }
}
