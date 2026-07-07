import { useState, useEffect, useRef, type RefObject } from 'react'
import { createHighlight } from '../lib/api'
import { showToast } from './Toast'
import { Highlighter, X } from 'lucide-react'

interface Props {
  docId: string
  selectedText: string
  position: { x: number; y: number }
  onClose: () => void
  onSaved: () => void
}

export function HighlightTooltip({ docId, selectedText, position, onClose, onSaved }: Props) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [showNoteInput, setShowNoteInput] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showNoteInput && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showNoteInput])

  const handleSave = async (withNote: boolean) => {
    setSaving(true)
    try {
      await createHighlight(docId, selectedText, withNote ? note : '')
      showToast('success', 'Highlight saved!')
      onSaved()
    } catch (err) {
      showToast('error', 'Failed to save highlight')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed z-50"
      style={{
        left: position.x,
        top: position.y - 10,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <div className="bg-white rounded-lg shadow-xl border border-border p-2 flex items-center gap-1.5 min-w-[180px]">
        {!showNoteInput ? (
          <>
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-700 bg-brand-50 rounded-md hover:bg-brand-100 transition-colors"
            >
              <Highlighter size={14} />
              Highlight
            </button>
            <button
              onClick={() => setShowNoteInput(true)}
              className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            >
              + Note
            </button>
            <button
              onClick={onClose}
              className="px-2 py-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <input
              ref={inputRef}
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note..."
              className="flex-1 px-2 py-1 text-sm border border-border rounded-md outline-none focus:border-brand-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave(true)
                if (e.key === 'Escape') setShowNoteInput(false)
              }}
            />
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="px-2 py-1 text-xs font-medium text-white bg-brand-600 rounded-md hover:bg-brand-700 transition-colors"
            >
              Save
            </button>
          </>
        )}
      </div>
      {/* Arrow */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-r border-b border-border rotate-45"
        style={{ top: 'calc(100% - 6px)' }}
      />
    </div>
  )
}

/**
 * Hook to manage text selection and highlight tooltip state.
 */
export function useHighlightSelection(docId: string, containerRef: React.RefObject<HTMLDivElement | null>) {
  const [selectedText, setSelectedText] = useState('')
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [showTooltip, setShowTooltip] = useState(false)

  const handleMouseUp = () => {
    // Small delay to let the selection complete
    setTimeout(() => {
      const selection = window.getSelection()
      const text = selection?.toString().trim()

      if (!text || text.length === 0) {
        setShowTooltip(false)
        return
      }

      // Only show tooltip if selection is within our container
      if (containerRef.current && selection?.rangeCount) {
        const range = selection.getRangeAt(0)
        if (containerRef.current.contains(range.commonAncestorContainer)) {
          const rect = range.getBoundingClientRect()
          setSelectedText(text)
          setTooltipPos({
            x: rect.left + rect.width / 2,
            y: rect.top,
          })
          setShowTooltip(true)
        }
      }
    }, 10)
  }

  const closeTooltip = () => {
    setShowTooltip(false)
    window.getSelection()?.removeAllRanges()
  }

  const highlightTooltip = showTooltip ? (
    <HighlightTooltip
      docId={docId}
      selectedText={selectedText}
      position={tooltipPos}
      onClose={closeTooltip}
      onSaved={closeTooltip}
    />
  ) : null

  return {
    handleMouseUp,
    highlightTooltip,
    closeTooltip,
  }
}
