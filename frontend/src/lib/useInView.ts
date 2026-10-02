import { useEffect, useRef, useState } from 'react'

/** True once the element has scrolled into view; stays true. Starts true when motion is unwanted. */
export function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const node = ref.current
    if (seen || !node) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); observer.disconnect() }
    }, { threshold })
    observer.observe(node)
    return () => observer.disconnect()
  }, [seen, threshold])

  return [ref, seen] as const
}
