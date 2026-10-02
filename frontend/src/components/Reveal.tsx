import type { ReactNode } from 'react'
import AnimatedContent from '../reactbits/AnimatedContent'
import { prefersReducedMotion } from './Ephemera'

/** Plays once on scroll-in: a short, small slide and fade. Renders the final state when motion is unwanted. */
export default function Reveal({ children, delay = 0, distance = 24, duration = 0.6, className }: {
  children: ReactNode
  delay?: number
  distance?: number
  duration?: number
  className?: string
}) {
  if (prefersReducedMotion()) return <div className={className}>{children}</div>
  return (
    <AnimatedContent className={className} distance={distance} duration={duration} delay={delay}
      ease="power3.out" threshold={0.12}>
      {children}
    </AnimatedContent>
  )
}
