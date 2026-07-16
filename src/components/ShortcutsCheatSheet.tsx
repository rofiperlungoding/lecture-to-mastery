import { X } from 'lucide-react'

interface ShortcutsCheatSheetProps {
  open: boolean
  onClose: () => void
}

export function ShortcutsCheatSheet({ open, onClose }: ShortcutsCheatSheetProps) {
  if (!open) return null

  const shortcuts = [
    { keys: ['/'], description: 'Focus main search input (if present)' },
    { keys: ['g', 'l'], description: 'Go to Library (in sequence within 1s)' },
    { keys: ['g', 'r'], description: 'Go to Review (skipped if missing)' },
    { keys: ['n'], description: 'Open Add Document flow' },
    { keys: ['?'], description: 'Open this shortcuts cheat sheet' },
    { keys: ['Ctrl+K', 'Cmd+K'], description: 'Open Command Palette' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface-elevated p-6 elevated-3 transition-all duration-150">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h2 className="text-h2 text-text">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-text-muted hover:bg-bg-muted hover:text-text transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4">
          <ul className="divide-y divide-border">
            {shortcuts.map((shortcut, i) => (
              <li key={i} className="flex items-center justify-between py-3">
                <span className="text-body text-text-secondary">{shortcut.description}</span>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, j) => (
                    <span key={j} className="flex items-center gap-1">
                      <kbd
                        className="inline-flex items-center justify-center rounded border border-border bg-bg-subtle px-2 py-0.5 font-mono text-caption text-text shadow-xs"
                      >
                        {key}
                      </kbd>
                      {j < shortcut.keys.length - 1 && <span className="text-caption text-text-muted">or</span>}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
export default ShortcutsCheatSheet
