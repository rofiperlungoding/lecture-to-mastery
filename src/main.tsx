import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { Route as RootRoute } from './routes/__root'
import { Route as IndexRoute } from './routes/index'
import { Route as CorpusChatRoute } from "./routes/corpus-chat"
import { Route as DocRoute } from './routes/doc.$docId'
import { Route as LoginRoute } from './routes/login'
import { Route as SettingsRoute } from './routes/settings'
import { Route as ProgressRoute } from './routes/progress'
import { Route as PrintRoute } from './routes/print.$docId'
import { Route as CoursePrintRoute } from './routes/print.$courseId'
import { Route as StyleguideRoute } from './routes/styleguide'
import { Route as AboutRoute } from './routes/about'
import { Route as HealthRoute } from './routes/health'
import { Route as CourseRoute } from './routes/course.$courseId'
import { Route as ReviewRoute } from './routes/review'
import { Route as ProfileRoute } from './routes/u.$username'
import { Route as AchievementShareRoute } from './routes/u.$username.achievement.$achievementId'
import { useAuthStore } from './stores/useAuthStore'
import { initErrorMonitor } from './lib/errorMonitor'
import { initLocale } from './lib/i18n'
import './styles/globals.css'

const routeTree = RootRoute.addChildren([IndexRoute, DocRoute, LoginRoute, SettingsRoute, ProgressRoute, CorpusChatRoute, PrintRoute, CoursePrintRoute, StyleguideRoute, AboutRoute, HealthRoute, CourseRoute, ReviewRoute, ProfileRoute, AchievementShareRoute])

const router = createRouter({
  routeTree,
  context: {
    auth: undefined as unknown as ReturnType<typeof useAuthStore.getState>,
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Await auth init before rendering
const rootElement = document.getElementById('root')!

async function bootstrap() {
  // Initialize i18n locale from localStorage before render
  initLocale()

  // Initialize client-side error monitoring (window.onerror + onunhandledrejection)
  initErrorMonitor()

  const authStore = useAuthStore.getState()
  await authStore.initialize()

  // Wire the current auth state into the router context
  router.options.context = {
    auth: useAuthStore.getState(),
  }

  // Subscribe so router context stays in sync
  useAuthStore.subscribe((state) => {
    router.options.context = { auth: state }
  })

  createRoot(rootElement).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}

bootstrap()
