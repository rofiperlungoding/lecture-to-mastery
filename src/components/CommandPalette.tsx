import { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppStore } from '../stores/useAppStore'
import { useThemeStore } from '../stores/useThemeStore'
import { useAuthStore } from '../stores/useAuthStore'
import { Search } from 'lucide-react'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

interface ActionItem {
  label: string
  run: () => void | Promise<void>
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const navigate = useNavigate()
  const setUploadOpen = useAppStore((s) => s.setUploadOpen)
  const cycleMode = useThemeStore((s) => s.cycleMode)
  const signOut = useAuthStore((s) => s.signOut)

  useEffect(() => {
    if (open) {
      setSearch('')
      setActiveIndex(0)
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    }
  }, [open])

  if (!open) return null

  const actions: ActionItem[] = [
    {
      label: 'Go to Library',
      run: () => {
        navigate({ to: '/' })
      },
    },
    {
      label: 'Go to Progress',
      run: () => {
        navigate({ to: '/progress' })
      },
    },
    {
      label: 'Add document',
      run: () => {
        setUploadOpen(true)
      },
    },
    {
      label: 'Toggle theme',
      run: () => {
        cycleMode()
      },
    },
    {
      label: 'Sign out',
      run: async () => {
        await signOut()
        window.location.href = '/login'
      },
    },
  ]

  // Filter actions
  const filteredActions = actions.filter((action) =>
    action.label.toLowerCase().includes(search.toLowerCase())
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (filteredActions.length > 0 ? (prev + 1) % filteredActions.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (filteredActions.length > 0 ? (prev - 1 + filteredActions.length) % filteredActions.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredActions[activeIndex]) {
        filteredActions[activeIndex].run()
        onClose()
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-150"
        onClick={onClose}
      />

      {/* Centered Modal */}
      <div
        ref={containerRef}
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface-elevated elevated-3 transition-all duration-150"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-5 w-5 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="w-full bg-transparent text-body text-text placeholder-text-muted focus:outline-none"
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto p-2">
          {filteredActions.length === 0 ? (
            <p className="p-3 text-small text-text-muted text-center">No commands found.</p>
          ) : (
            <ul className="space-y-0.5">
              {filteredActions.map((action, idx) => {
                const isSelected = idx === activeIndex
                return (
                  <li key={action.label}>
                    <button
                      onClick={() => {
                        action.run()
                        onClose()
                      }}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`flex w-full items-center rounded-lg px-3 py-2.5 text-left text-label font-medium transition-colors duration-100 ${
                        isSelected
                          ? 'bg-brand-500/10 text-brand-700'
                          : 'text-text-secondary hover:bg-surface-subtle'
                      }`}
                    >
                      {action.label}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
export default CommandPalette
