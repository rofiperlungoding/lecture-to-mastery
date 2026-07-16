import { useState, type ReactNode } from 'react'
import { Share2, Loader2, Download } from 'lucide-react'
import { useShareImage, type ShareAspectRatio } from '../hooks/useShareImage'
import { ShareCard, type ShareCardType } from './ShareCard'

// ── Props ─────────────────────────────────────────────────────────

interface ShareButtonProps {
  /** Card type: 'mastery' | 'quiz' | 'streak' */
  type: ShareCardType
  /** Primary value (mastery %, quiz score, streak days) */
  value: number
  /** Optional secondary value (e.g. \"5/7\" for quiz) */
  secondaryValue?: string
  /** Document title or context */
  title: string
  /** Optional subtitle (e.g. \"Great job!\") */
  subtitle?: string
  /** Aspect ratio. Default: 'square' */
  aspectRatio?: ShareAspectRatio
  /** Button label. Default: 'Share' */
  label?: string
  /** Optional icon override */
  icon?: ReactNode
  /** Button variant. Default: 'secondary' */
  variant?: 'secondary' | 'ghost'
  /** Button size. Default: 'sm' */
  size?: 'sm' | 'md'
  className?: string
}

// ── Style constants ───────────────────────────────────────────────

const variantStyles = {
  secondary:
    'border border-border bg-surface text-text-secondary hover:bg-surface-subtle hover:text-text active:bg-surface-muted',
  ghost:
    'border border-transparent bg-transparent text-text-tertiary hover:bg-surface-subtle hover:text-text-secondary',
}

const sizeStyles = {
  sm: 'h-8 px-3 text-footnote gap-1.5',
  md: 'h-10 px-4 text-label gap-2',
}

// ── Component ─────────────────────────────────────────────────────

/**
 * ShareButton — renders a hidden ShareCard off-screen, captures it as PNG
 * on click, and shares via Web Share API (or downloads as fallback).
 *
 * Entry points: place this after quiz completion, flashcard session end,
 * and on the mastery panel.
 */
export function ShareButton({
  type,
  value,
  secondaryValue,
  title,
  subtitle,
  aspectRatio = 'square',
  label = 'Share',
  icon,
  variant = 'secondary',
  size = 'sm',
  className = '',
}: ShareButtonProps) {
  const { cardRef, share, download, loading } = useShareImage()
  const [showCard, setShowCard] = useState(false)

  const handleShare = async () => {
    setShowCard(true)

    // Wait a tick for the card to mount and render
    await new Promise((resolve) => setTimeout(resolve, 50))

    try {
      await share({
        filename: `lecture-to-mastery-${type}-${Math.round(value)}`,
        aspectRatio,
        text: getShareText(type, value, title),
      })
    } finally {
      setShowCard(false)
    }
  }

  const handleDownload = async () => {
    setShowCard(true)
    await new Promise((resolve) => setTimeout(resolve, 50))

    try {
      await download({
        filename: `lecture-to-mastery-${type}-${Math.round(value)}`,
      })
    } finally {
      setShowCard(false)
    }
  }

  // On iOS (no navigator.share that supports files), show download
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const supportsNativeShare = !isIOS && !!navigator.share

  return (
    <>
      {/* Hidden card for capture — rendered off-screen */}
      {showCard && (
        <div
          style={{
            position: 'fixed',
            left: '-9999px',
            top: '0',
            zIndex: -1,
            pointerEvents: 'none',
            opacity: 0,
          }}
        >
          <ShareCard
            ref={cardRef}
            type={type}
            value={value}
            secondaryValue={secondaryValue}
            title={title}
            subtitle={subtitle}
            aspectRatio={aspectRatio}
          />
        </div>
      )}

      {supportsNativeShare ? (
        <button
          onClick={handleShare}
          disabled={loading}
          className={[
            'inline-flex items-center justify-center rounded-md font-medium select-none cursor-pointer',
            'transition-colors duration-fast ease-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            'disabled:cursor-not-allowed disabled:opacity-50',
            variantStyles[variant],
            sizeStyles[size],
            className,
          ].join(' ')}
          aria-label={`Share your ${type} result`}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : icon ? (
            <span className="h-4 w-4 shrink-0 flex items-center justify-center">{icon}</span>
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          {loading ? 'Sharing...' : label}
        </button>
      ) : (
        <button
          onClick={handleDownload}
          disabled={loading}
          className={[
            'inline-flex items-center justify-center rounded-md font-medium select-none cursor-pointer',
            'transition-colors duration-fast ease-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            'disabled:cursor-not-allowed disabled:opacity-50',
            variantStyles[variant],
            sizeStyles[size],
            className,
          ].join(' ')}
          aria-label={`Download ${type} result as image`}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {loading ? 'Generating...' : 'Save Image'}
        </button>
      )}
    </>
  )
}

// ── Share text generator ──────────────────────────────────────────

function getShareText(type: ShareCardType, value: number, title: string): string {
  switch (type) {
    case 'mastery':
      return `I hit ${Math.round(value)}% mastery on "${title}" with Lecture-to-Mastery! 🎯`
    case 'quiz':
      return `I scored ${Math.round(value)}% on the "${title}" quiz with Lecture-to-Mastery! 🧠`
    case 'streak':
      return `I've studied ${value} days in a row with Lecture-to-Mastery! 🔥`
  }
}

export default ShareButton
