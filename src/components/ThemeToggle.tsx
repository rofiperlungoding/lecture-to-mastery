import { Sun, Moon } from 'lucide-react'
import { useThemeStore } from '../stores/useThemeStore'

export function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore()

  return (
    <button
      onClick={toggleTheme}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border dark:border-[#27272A] bg-white dark:bg-[#161618] text-text-secondary dark:text-[#A1A1AA] hover:bg-bg-muted dark:hover:bg-[#1C1C1F] hover:text-text dark:hover:text-[#FAFAFA] transition-colors duration-150 shadow-xs"
      aria-label="Toggle theme"
    >
      {theme === 'light' ? (
        <Moon className="h-4.5 w-4.5" />
      ) : (
        <Sun className="h-4.5 w-4.5" />
      )}
    </button>
  )
}
export default ThemeToggle
