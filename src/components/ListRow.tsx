import type { ReactNode, HTMLAttributes } from "react";
import { usePressable } from "../hooks/usePressable";

type ListRowPadding = "sm" | "md";

interface ListRowProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Optional leading element (icon, avatar, checkbox) */
  leading?: ReactNode;
  /** Optional trailing element (badge, action, timestamp) */
  trailing?: ReactNode;
  /** Make the entire row clickable (adds hover + cursor) */
  clickable?: boolean;
  padding?: ListRowPadding;
}

const paddingStyles: Record<ListRowPadding, string> = {
  sm: "px-3 py-2.5",
  md: "px-4 py-3",
};

/**
 * Consistent list row with hairline separator, hover highlight,
 * and comfortable tap target. Designed for recent-activity feeds,
 * flashcard/quiz lists, and settings sections.
 *
 * Each row gets a hairline-bottom border. Remove it on the last child
 * of a container with `last:border-b-0` if needed.
 */
export function ListRow({
  children,
  leading,
  trailing,
  clickable = false,
  padding = "md",
  className = "",
  onClick,
  ...rest
}: ListRowProps) {
  const pressable = usePressable();

  return (
    <div
      className={[
        "flex items-center gap-3",
        "hairline-bottom",
        clickable
          ? "cursor-pointer transition-colors duration-150 ease-standard hover:bg-surface-subtle"
          : "",
        paddingStyles[padding],
        "min-h-touch",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable && onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
              }
            }
          : undefined
      }
      {...(clickable ? pressable : {})}
      {...rest}
    >
      {leading && (
        <div className="flex shrink-0 items-center justify-center">
          {leading}
        </div>
      )}
      <div className="min-w-0 flex-1">{children}</div>
      {trailing && (
        <div className="flex shrink-0 items-center justify-center">
          {trailing}
        </div>
      )}
    </div>
  );
}

export default ListRow;
