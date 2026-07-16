import type { ReactNode, ButtonHTMLAttributes } from "react";
import { usePressable } from "../hooks/usePressable";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string; // required for accessibility + tooltip
  variant?: "default" | "ghost" | "danger";
  size?: "sm" | "md";
}

const variantStyles = {
  default:
    "border border-border bg-surface text-text-secondary hover:bg-surface-subtle hover:text-text active:bg-surface-muted",
  ghost:
    "border border-transparent bg-transparent text-text-secondary hover:bg-surface-subtle hover:text-text active:bg-surface-muted",
  danger:
    "border border-transparent bg-transparent text-danger hover:bg-danger-subtle active:bg-danger-subtle/80",
};

const sizeStyles = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
};

export function IconButton({
  icon,
  label,
  variant = "default",
  size = "md",
  disabled,
  className = "",
  ...props
}: IconButtonProps) {
  const pressable = usePressable();

  return (
    <button
      aria-label={label}
      disabled={disabled}
      title={label}
      className={[
        "inline-flex items-center justify-center rounded-[var(--radius-md)] shrink-0 select-none cursor-pointer",
        "transition-colors duration-fast ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variantStyles[variant],
        sizeStyles[size],
        className,
      ].join(" ")}
      {...pressable}
      {...props}
    >
      <span className="h-4 w-4 flex items-center justify-center">{icon}</span>
    </button>
  );
}
export default IconButton;
