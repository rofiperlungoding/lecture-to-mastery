import type { ReactNode, ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";
import { usePressable } from "../hooks/usePressable";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
  children: ReactNode;
}

/* ── Variant styles (color, bg, border) ────────── */
const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-500 text-text-on-accent hover:bg-brand-600 active:bg-brand-700 shadow-xs",
  secondary:
    "border border-border bg-surface text-text-secondary hover:bg-surface-subtle hover:text-text active:bg-surface-muted",
  ghost:
    "border border-transparent bg-transparent text-text-secondary hover:bg-surface-subtle hover:text-text active:bg-surface-muted",
  destructive:
    "bg-danger text-white hover:bg-danger/90 active:bg-danger/80 shadow-xs",
};

/* ── Size styles (height, padding, font, gap) ──── */
const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-footnote gap-1.5",
  md: "h-10 px-4 text-label gap-2",
  lg: "h-11 px-5 text-label gap-2.5",
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  const pressable = usePressable();

  return (
    <button
      disabled={disabled || isLoading}
      className={[
        "relative inline-flex items-center justify-center rounded-[var(--radius-md)] font-medium select-none cursor-pointer",
        "transition-colors duration-fast ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "",
        variantStyles[variant],
        sizeStyles[size],
        className,
      ].join(" ")}
      {...pressable}
      {...props}
    >
      {/* Stable-width wrapper — prevents layout shift on loading */}
      <span className="inline-flex items-center gap-[inherit]">
        {/* Loading state: icons hidden, spinner visible */}
        {isLoading ? (
          <Spinner size="sm" />
        ) : leadingIcon ? (
          <span className="h-4 w-4 shrink-0 flex items-center justify-center">{leadingIcon}</span>
        ) : null}

        <span className={isLoading ? "invisible" : ""}>{children}</span>

        {!isLoading && trailingIcon && (
          <span className="h-4 w-4 shrink-0 flex items-center justify-center">{trailingIcon}</span>
        )}
      </span>
    </button>
  );
}
export default Button;
