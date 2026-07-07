import { create } from 'zustand'

export type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const getInitialTheme = (): Theme => {
    if (typeof window !== 'undefined') {
      const persisted = localStorage.getItem('theme') as Theme | null
      if (persisted === 'light' || persisted === 'dark') {
        return persisted
      }
      const systemPreference = window.matchMedia('(prefers-color-scheme: dark)').matches
      return systemPreference ? 'dark' : 'light'
    }
    return 'light'
  }

  const initialTheme = getInitialTheme()

  // Apply to documentElement on initialization
  if (typeof window !== 'undefined') {
    if (initialTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  return {
    theme: initialTheme,
    setTheme: (theme: Theme) => {
      localStorage.setItem('theme', theme)
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
      set({ theme })
    },
    toggleTheme: () => {
      const current = get().theme
      const next = current === 'light' ? 'dark' : 'light'
      get().setTheme(next)
    },
  }
})
export default useThemeStore
