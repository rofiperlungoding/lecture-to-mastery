import { useEffect } from 'react'
import { createRoute, useParams, useNavigate } from '@tanstack/react-router'
import { Route as RootRoute } from './__root'

// ═══════════════════════════════════════════════════════════════════════════
// Achievement Share Redirect
//
// When a user visits /u/<username>/achievement/<id> (from a shared link),
// the Cloudflare Pages Function serves OG meta tags to crawlers.
// For normal users in the SPA, we redirect to the profile page.
// ═══════════════════════════════════════════════════════════════════════════

function AchievementRedirect() {
  const { username } = useParams({ from: '/u/$username/achievement/$achievementId' })
  const navigate = useNavigate()

  useEffect(() => {
    navigate({ to: '/u/$username', params: { username }, replace: true })
  }, [username, navigate])

  return null
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/u/$username/achievement/$achievementId',
  component: AchievementRedirect,
})
