import type { ReactNode } from 'react'
import Reveal from './Reveal'

/** One tile of the dashboard grid: a title row, an optional action, then the content. */
interface TileProps {
  title: string
  hint?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

/** The tile itself, without its grid cell: for tiles that share one cell. */
export function TileBody({ title, hint, action, children, className = '' }: TileProps) {
  return (
    <section className={`tile ${className}`}>
      <header className="tile__head">
        <div>
          <h2 className="tile__title">{title}</h2>
          {hint && <p className="tile__hint">{hint}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

export default function Tile({ span = 12, ...props }: TileProps & { span?: 3 | 4 | 5 | 6 | 7 | 8 | 12 }) {
  return (
    <Reveal className={`bento__cell bento__cell--${span}`}>
      <TileBody {...props} />
    </Reveal>
  )
}
