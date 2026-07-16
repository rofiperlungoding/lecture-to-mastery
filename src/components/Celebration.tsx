import { useEffect, useRef, useState, useCallback } from 'react'
import { CheckCircle } from 'lucide-react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  alpha: number
  decay: number
  rotation: number
  rotationSpeed: number
}

interface CelebrationProps {
  /** Show the celebration */
  show: boolean
  /** Message to display with the checkmark */
  message?: string
  /** Called when celebration finishes or is dismissed */
  onDone?: () => void
  /** Duration in ms. Default: 1200 */
  duration?: number
}

/**
 * Celebration — tasteful particle burst + checkmark draw-in.
 *
 * - Particles burst outward from center and fade out.
 * - A checkmark icon scales up + fades in with a spring.
 * - Optional message below the checkmark.
 * - Auto-dismisses after `duration` ms.
 * - Click or tap anywhere to dismiss early.
 * - Reduced motion: shows only the checkmark + message (no particles).
 */
export function Celebration({
  show,
  message,
  onDone,
  duration = 1200,
}: CelebrationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number | null>(null)
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [checkmarkVisible, setCheckmarkVisible] = useState(false)
  const finishedRef = useRef(false)

  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const dismiss = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    setExiting(true)
    setTimeout(() => {
      setVisible(false)
      setCheckmarkVisible(false)
      onDone?.()
    }, 300)
  }, [onDone])

  // Show after mount animation frame
  useEffect(() => {
    if (!show) {
      setVisible(false)
      return
    }
    finishedRef.current = false
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setVisible(true)
        setCheckmarkVisible(true)
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [show])

  // Auto-dismiss timer
  useEffect(() => {
    if (!show) return
    const timer = setTimeout(dismiss, duration)
    return () => clearTimeout(timer)
  }, [show, duration, dismiss])

  // Canvas particle animation
  useEffect(() => {
    if (!show || !visible || prefersReduced || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Size canvas to viewport
    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Spawn particles
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const colors = [
      'var(--color-accent, #3366FF)',
      'var(--color-success, #10B981)',
      'var(--color-warning, #F59E0B)',
      'var(--color-mastery-high, #10B981)',
      'var(--color-mastery-mid, #8B5CF6)',
    ]

    const particles: Particle[] = []
    const particleCount = 40

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5
      const speed = 2 + Math.random() * 4
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.015 + Math.random() * 0.015,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.1,
      })
    }
    particlesRef.current = particles

    let running = true

    const animate = () => {
      if (!running) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      let allDead = true

      for (const p of particles) {
        if (p.alpha <= 0) continue
        allDead = false

        p.x += p.vx
        p.y += p.vy
        p.vx *= 0.99
        p.vy *= 0.99
        p.alpha -= p.decay
        p.rotation += p.rotationSpeed

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = Math.max(0, p.alpha)

        // Draw particle as small rounded rectangle
        ctx.fillStyle = p.color
        ctx.beginPath()
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(-p.size / 2, -p.size / 2, p.size, p.size, p.size / 3)
        } else {
          ctx.rect(-p.size / 2, -p.size / 2, p.size, p.size)
        }
        ctx.fill()
        ctx.restore()
      }

      if (!allDead) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      running = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [show, visible, prefersReduced])

  if (!show || !visible) return null

  return (
    <div
      className={`fixed inset-0 z-toast flex items-center justify-center transition-opacity duration-300 ease-standard ${
        exiting ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={dismiss}
      style={{ pointerEvents: exiting ? 'none' : 'auto' }}
      role="status"
      aria-live="polite"
    >
      {/* Canvas for particles */}
      {!prefersReduced && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          aria-hidden="true"
        />
      )}

      {/* Checkmark + message */}
      <div
        className={`relative flex flex-col items-center gap-2 transition-all duration-[400ms] ease-spring ${
          checkmarkVisible && !exiting
            ? 'scale-100 opacity-100'
            : 'scale-50 opacity-0'
        }`}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-white shadow-lg">
          <CheckCircle className="h-10 w-10" strokeWidth={2.5} />
        </div>
        {message && (
          <p className="text-label font-medium text-text">{message}</p>
        )}
      </div>
    </div>
  )
}

export default Celebration
