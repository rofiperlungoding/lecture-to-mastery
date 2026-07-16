import { create } from 'zustand'

export type ThemeMode = 'system' | 'light' | 'dark'

interface ThemeState {
  /** The user's selected mode: system | light | dark */
  mode: ThemeMode
  /** The resolved effective theme (light or dark) — what's actually applied */
  resolved: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
  cycleMode: () => void
}

function applyTheme(resolved: 'light' | 'dark') {
  const html = document.documentElement

  // Enable smooth cross-fade transition
  html.classList.add('theme-transitioning')

  html.setAttribute('data-theme', resolved)
  if (resolved === 'dark') {
    html.classList.add('dark')
  } else {
    html.classList.remove('dark')
  }

  // Remove transition class after the animation has painted
  // Double rAF ensures the browser has rendered the new colors
  // before removing the transition guard.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      html.classList.remove('theme-transitioning')
    })
  })
}

function getResolved(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light') return 'light'
  if (mode === 'dark') return 'dark'
  // system
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

let mediaQuery: MediaQueryList | null = null
let mediaListener: ((e: MediaQueryListEvent) => void) | null = null

function subscribeToSystemChanges(storeSet: (partial: Partial<ThemeState>) => void) {
  // Unsubscribe previous listener
  if (mediaQuery && mediaListener) {
    mediaQuery.removeEventListener('change', mediaListener)
  }

  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

  mediaListener = (e: MediaQueryListEvent) => {
    const resolved = e.matches ? 'dark' : 'light'
    applyTheme(resolved)
    storeSet({ resolved })
  }

  mediaQuery.addEventListener('change', mediaListener)
}

function unsubscribeSystemChanges() {
  if (mediaQuery && mediaListener) {
    mediaQuery.removeEventListener('change', mediaListener)
  }
  mediaQuery = null
  mediaListener = null
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const getInitialMode = (): ThemeMode => {
    try {
      const persisted = localStorage.getItem('theme-mode') as ThemeMode | null
      if (persisted === 'system' || persisted === 'light' || persisted === 'dark') {
        return persisted
      }
    } catch {
      // localStorage unavailable
    }
    return 'light'
  }

  const initialMode = getInitialMode()
  const initialResolved = getResolved(initialMode)

  // Apply theme immediately (the blocking script in index.html already
  // sets the initial theme, so this ensures the store is in sync)
  applyTheme(initialResolved)

  // Subscribe to system changes if mode is 'system'
  if (initialMode === 'system') {
    subscribeToSystemChanges(set)
  }

  return {
    mode: initialMode,
    resolved: initialResolved,
    setMode: (mode: ThemeMode) => {
      unsubscribeSystemChanges()

      // Persist
      try { localStorage.setItem('theme-mode', mode) } catch { /* noop */ }

      const resolved = getResolved(mode)
      applyTheme(resolved)
      set({ mode, resolved })

      // Subscribe if system mode
      if (mode === 'system') {
        subscribeToSystemChanges(set)
      }
    },
    cycleMode: () => {
      const current = get().mode
      const next: ThemeMode =
        current === 'system' ? 'light' :
        current === 'light' ? 'dark' :
        'system'
      get().setMode(next)
    },
  }
})

export default useThemeStore
