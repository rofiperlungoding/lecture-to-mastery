import { Sun, Moon, Monitor } from 'lucide-react'
import { useThemeStore, type ThemeMode } from '../stores/useThemeStore'

const modeIcons: Record<ThemeMode, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

const modeLabels: Record<ThemeMode, string> = {
  system: 'System theme',
  light: 'Light mode',
  dark: 'Dark mode',
}


export function ThemeToggle() {
  const { mode, cycleMode } = useThemeStore()
  const Icon = modeIcons[mode]

  return (
    <button
      onClick={cycleMode}
      className="group relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary hover:bg-surface-subtle hover:text-text transition-all duration-base shadow-xs active:scale-95"
      aria-label={`Current: ${modeLabels[mode]}. Click to switch.`}
    >
      <Icon className="h-4.5 w-4.5" aria-hidden="true" />

      {/* Tooltip */}
      <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface-elevated px-2.5 py-1 text-caption text-text-secondary opacity-0 shadow-1 transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100">
        {modeLabels[mode]}
        <span className="ml-1.5 text-text-tertiary">({mode === 'system' ? 'auto' : 'manual'})</span>
      </span>
    </button>
  )
}
export default ThemeToggle
