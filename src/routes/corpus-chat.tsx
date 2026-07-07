import { createRoute } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'
import { CorpusChat } from '../components/CorpusChat'
import { PageContainer } from '../components/PageContainer'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: 'corpus-chat',
  component: CorpusChatPage,
})

function CorpusChatPage() {
  return (
    <PageContainer>
      <CorpusChat />
    </PageContainer>
  )
}
