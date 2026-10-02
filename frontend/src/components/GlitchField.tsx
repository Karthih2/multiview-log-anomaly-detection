import { useEffect, useState } from 'react'
import LetterGlitch from '../reactbits/LetterGlitch'
import BinaryRipple from './BinaryRipple'
import { prefersReducedMotion } from './Ephemera'

/**
 * Binary digits scrambling behind a section, in the palette's tints. With `full` it covers the whole
 * page and the digits light up around the pointer. Off when motion is unwanted.
 */
export default function GlitchField({ speed = 70, className = '', full = false }: {
  speed?: number
  className?: string
  full?: boolean
}) {
  const [colors, setColors] = useState<string[]>(['#e4d9bb', '#95bbea', '#d9a39c'])

  useEffect(() => {
    const style = getComputedStyle(document.documentElement)
    setColors(['--glitch-1', '--glitch-2', '--glitch-3'].map((name) => style.getPropertyValue(name).trim()))
  }, [])

  if (prefersReducedMotion()) return null
  return (
    <>
      <div className={`glitch-field${full ? ' glitch-field--full' : ''} ${className}`} aria-hidden="true">
        <LetterGlitch glitchColors={colors} glitchSpeed={speed} outerVignette={false} centerVignette={false}
          smooth backgroundColor="transparent" characters="01" />
      </div>
      {full && <BinaryRipple />}
    </>
  )
}
