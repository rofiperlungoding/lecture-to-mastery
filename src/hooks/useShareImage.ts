import { useCallback, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { showToast } from '../components/Toast'

export type ShareAspectRatio = 'square' | 'story'

interface ShareImageOptions {
  /** File name for the downloaded PNG (without extension). */
  filename: string
  /** Aspect ratio: 'square' = 1:1 (600×600), 'story' = 9:16 (600×1067) */
  aspectRatio?: ShareAspectRatio
  /** Optional text to accompany the share (used by Web Share API). */
  text?: string
}

interface UseShareImageResult {
  /** Ref to attach to the card element that should be captured. */
  cardRef: React.RefObject<HTMLDivElement | null>
  /** Whether a capture is currently in progress. */
  loading: boolean
  /** Last error message, if any. */
  error: string | null
  /** Trigger the share flow: capture → Web Share or download. */
  share: (options: ShareImageOptions) => Promise<void>
  /** Download the card as PNG directly (no share dialog). */
  download: (options: Pick<ShareImageOptions, 'filename'>) => Promise<void>
}

const CARD_DIMENSIONS: Record<ShareAspectRatio, { width: number; height: number }> = {
  square: { width: 600, height: 600 },
  story: { width: 600, height: 1067 },
}

/**
 * Hook that captures a DOM element as a crisp PNG and shares or downloads it.
 *
 * Usage:
 * ```tsx
 * const { cardRef, share, download, loading } = useShareImage()
 *
 * return (
 *   <>
 *     <div ref={cardRef}>
 *       <ShareCard type="mastery" value={82} title="Thermodynamics" />
 *     </div>
 *     <button onClick={() => share({ filename: 'my-mastery' })}>Share</button>
 *   </>
 * )
 * ```
 */
export function useShareImage(): UseShareImageResult {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const captureToBlob = useCallback(
    async (aspectRatio: ShareAspectRatio = 'square'): Promise<Blob | null> => {
      const node = cardRef.current
      if (!node) {
        setError('Card element not found')
        return null
      }

      const dims = CARD_DIMENSIONS[aspectRatio]

      setLoading(true)
      setError(null)

      try {
        // Wait for web fonts to load before capturing
        await document.fonts.ready

        // Ensure dimensions are set during capture
        const originalWidth = node.style.width
        const originalHeight = node.style.height
        const originalPosition = node.style.position
        const originalLeft = node.style.left

        node.style.width = `${dims.width}px`
        node.style.height = `${dims.height}px`
        node.style.position = 'absolute'
        node.style.left = '-9999px'

        const dataUrl = await toPng(node, {
          width: dims.width,
          height: dims.height,
          pixelRatio: 2, // Retina-quality capture
          cacheBust: true,
          // Include styles that html-to-image might miss
          filter: (el) => {
            // Skip script elements, but include everything else
            return el.tagName !== 'SCRIPT'
          },
        })

        // Restore original styles
        node.style.width = originalWidth
        node.style.height = originalHeight
        node.style.position = originalPosition
        node.style.left = originalLeft

        // Convert data URL to blob
        const response = await fetch(dataUrl)
        const blob = await response.blob()
        return blob
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to capture image'
        setError(message)
        showToast('error', 'Failed to create share image')
        return null
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const share = useCallback(
    async (options: ShareImageOptions) => {
      const { filename, aspectRatio = 'square', text } = options
      const blob = await captureToBlob(aspectRatio)
      if (!blob) return

      const file = new File([blob], `${filename}.png`, { type: 'image/png' })

      // Web Share API — only if files are supported
      const supportsFileShare =
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })

      if (supportsFileShare) {
        try {
          await navigator.share({
            files: [file],
            title: 'Lecture-to-Mastery',
            text: text ?? 'Check out my study progress on Lecture-to-Mastery!',
          })
          showToast('success', 'Shared successfully!')
        } catch (err) {
          // User cancelled — not an error; other errors → fallback
          if (err instanceof Error && err.name !== 'AbortError') {
            // Fallback to download
            downloadBlob(blob, `${filename}.png`)
            showToast('success', 'Image downloaded!')
          }
        }
      } else {
        // Fallback: download the PNG + copy text
        downloadBlob(blob, `${filename}.png`)
        if (text) {
          try {
            await navigator.clipboard.writeText(text)
            showToast('success', 'Image downloaded! Link copied to clipboard.')
          } catch {
            showToast('success', 'Image downloaded!')
          }
        } else {
          showToast('success', 'Image downloaded!')
        }
      }
    },
    [captureToBlob],
  )

  const download = useCallback(
    async (options: Pick<ShareImageOptions, 'filename'>) => {
      const { filename } = options
      const blob = await captureToBlob('square')
      if (!blob) return

      downloadBlob(blob, `${filename}.png`)
      showToast('success', 'Image downloaded!')
    },
    [captureToBlob],
  )

  return { cardRef, loading, error, share, download }
}

// ── Helpers ────────────────────────────────────

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default useShareImage
