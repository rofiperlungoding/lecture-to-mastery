import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  meta?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, meta, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-pageTitle text-text truncate">
          {title}
        </h1>
        {meta && (
          <p className="mt-1 text-body text-text-secondary">
            {meta}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-3">{actions}</div>
      )}
    </div>
  );
}
export default PageHeader;
