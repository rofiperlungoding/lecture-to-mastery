import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-500">
          {icon}
        </div>
      )}
      <h3 className="text-h3 text-text">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-small text-text-secondary">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
