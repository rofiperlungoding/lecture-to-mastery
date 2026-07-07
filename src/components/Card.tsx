import type { ReactNode, HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hoverable?: boolean;
}

export function Card({
  children,
  hoverable = false,
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={`rounded-xl border border-border dark:border-[#27272A] bg-white dark:bg-[#161618] p-6 shadow-sm ring-1 ring-black/5 dark:ring-white/10 ${
        hoverable
          ? "cursor-pointer transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-border-strong dark:hover:border-[#3F3F46]"
          : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
export default Card;
