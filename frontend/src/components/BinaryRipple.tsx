import { useEffect, useRef } from 'react'

const CELL_W = 10
const CELL_H = 20
const GLOW_RADIUS = 150
const RING_SPEED = 320
const RING_WIDTH = 70
const RING_LIFE = 1.5
const MAX_RINGS = 6
const RING_GAP_PX = 90

interface Ring {
  x: number
  y: number
  born: number
}

/**
 * A full-page layer of binary digits that light up around the pointer, with ripple rings that
 * spread from where the pointer has been. It only draws while something is moving.
 */
export default function BinaryRipple({ colour = '#940501', ringColour = '#2a5dba' }: { colour?: string; ringColour?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let width = 0
    let height = 0
    let columns = 0
    let rows = 0
    let bits: string[] = []
    const rings: Ring[] = []
    const pointer = { x: -1000, y: -1000, seen: 0 }
    let lastRing = { x: -1000, y: -1000 }
    let frame = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      columns = Math.ceil(width / CELL_W)
      rows = Math.ceil(height / CELL_H)
      bits = Array.from({ length: columns * rows }, () => (Math.random() > 0.5 ? '1' : '0'))
    }

    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height)
      ctx.font = '16px monospace'
      ctx.textBaseline = 'top'
      const t = now / 1000
      while (rings.length && t - rings[0].born > RING_LIFE) rings.shift()
      const glowOn = now - pointer.seen < 1400
      const fade = glowOn ? Math.min(1, (1400 - (now - pointer.seen)) / 600) : 0

      for (let row = 0; row < rows; row += 1) {
        const y = row * CELL_H + CELL_H / 2
        for (let col = 0; col < columns; col += 1) {
          const x = col * CELL_W + CELL_W / 2
          let glow = 0
          if (fade > 0) {
            const d = Math.hypot(x - pointer.x, y - pointer.y)
            if (d < GLOW_RADIUS) glow = (1 - d / GLOW_RADIUS) ** 2 * fade
          }
          let ring = 0
          for (const r of rings) {
            const age = t - r.born
            const edge = age * RING_SPEED
            const off = Math.abs(Math.hypot(x - r.x, y - r.y) - edge)
            if (off < RING_WIDTH) ring = Math.max(ring, (1 - off / RING_WIDTH) * (1 - age / RING_LIFE))
          }
          if (glow < 0.03 && ring < 0.03) continue
          const index = row * columns + col
          if (ring > glow) {
            ctx.fillStyle = ringColour
            ctx.globalAlpha = Math.min(1, ring * 1.1)
          } else {
            ctx.fillStyle = colour
            ctx.globalAlpha = Math.min(1, glow * 1.2)
          }
          ctx.fillText(bits[index], col * CELL_W, row * CELL_H)
        }
      }
      ctx.globalAlpha = 1
      const alive = glowOn || rings.length > 0
      frame = alive ? requestAnimationFrame(draw) : 0
      if (!alive) ctx.clearRect(0, 0, width, height)
    }

    const wake = () => {
      if (!frame) frame = requestAnimationFrame(draw)
    }

    const onMove = (event: PointerEvent) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      pointer.seen = performance.now()
      if (Math.hypot(pointer.x - lastRing.x, pointer.y - lastRing.y) > RING_GAP_PX) {
        rings.push({ x: pointer.x, y: pointer.y, born: performance.now() / 1000 })
        if (rings.length > MAX_RINGS) rings.shift()
        lastRing = { x: pointer.x, y: pointer.y }
      }
      wake()
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
    }
  }, [colour, ringColour])

  return <canvas ref={canvasRef} className="ripple-layer" aria-hidden="true" />
}
