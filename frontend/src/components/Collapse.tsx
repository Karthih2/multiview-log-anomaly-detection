import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { prefersReducedMotion } from './Ephemera'

/** Height animates open and shut: short, eased, no bounce. Instant when motion is unwanted. */
export default function Collapse({ open, id, children }: { open: boolean; id: string; children: ReactNode }) {
  const duration = prefersReducedMotion() ? 0 : 0.3
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div id={id} key={id} style={{ overflow: 'hidden' }}
          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
          transition={{ duration, ease: [0.16, 1, 0.3, 1] }}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
