import type { ReactNode, HTMLAttributes } from "react";
import { usePressable } from "../hooks/usePressable";

type CardVariant = "elevated" | "outlined";
type CardPadding = "sm" | "md" | "lg";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Elevated has shadow + hairline border; Outlined has a full border */
  variant?: CardVariant;
  /** Sm=16px, Md=20px(default), Lg=24px */
  padding?: CardPadding;
  /** Visual hover effects only (for cards inside <a>/<Link>) */
  hoverable?: boolean;
  /** Full interactive state: hover effects + button semantics + focus ring */
  interactive?: boolean;
}

const variantStyles: Record<CardVariant, string> = {
  elevated:
    "border-border-hairline elevated-1",
  outlined: "border-border",
};

const paddingStyles: Record<CardPadding, string> = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

const interactiveClasses =
  "hover:-translate-y-0.5 hover:shadow-sm hover:border-border-strong cursor-pointer select-none transition-all duration-base ease-standard focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const hoverableClasses =
  "hover:-translate-y-0.5 hover:shadow-sm hover:border-border-strong cursor-pointer select-none transition-all duration-base ease-standard";

export function Card({
  children,
  variant = "elevated",
  padding = "md",
  hoverable = false,
  interactive = false,
  className = "",
  onClick,
  ...rest
}: CardProps) {
  const isInteractive = interactive;
  const isHoverable = hoverable || isInteractive;

  const classes = [
    "rounded-xl",
    "border",
    "bg-surface",
    variantStyles[variant],
    paddingStyles[padding],
    isInteractive ? interactiveClasses : isHoverable ? hoverableClasses : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const pressable = usePressable();

  if (isInteractive) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick as unknown as React.MouseEventHandler<HTMLButtonElement>}
        {...pressable}
        {...(rest as unknown as HTMLAttributes<HTMLButtonElement>
          & { ref?: React.Ref<HTMLButtonElement> })}
      >
        {children}
      </button>
    );
  }

  return (
    <div
      className={classes}
      onClick={onClick}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
    >
      {children}
    </div>
  );
}

export default Card;
