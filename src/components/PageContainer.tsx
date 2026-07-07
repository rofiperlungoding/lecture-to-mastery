import type { ReactNode } from 'react'

interface PageContainerProps {
  children: ReactNode
  className?: string
}

export function PageContainer({ children, className = '' }: PageContainerProps) {
  return (
    <div className={`mx-auto w-full max-w-[1080px] px-6 md:px-8 py-8 ${className}`}>
      {children}
    </div>
  )
}
