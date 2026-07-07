import type { ReactNode, ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";

type ButtonVariant =
  "primary" | "secondary" | "outline" | "ghost" | "destructive";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-xs",
  secondary:
    "border border-border dark:border-[#27272A] bg-white dark:bg-[#161618] text-text-secondary dark:text-[#A1A1AA] hover:bg-bg-muted dark:hover:bg-[#1C1C1F] active:bg-bg-subtle dark:active:bg-[#1C1C1F]",
  outline:
    "border border-border dark:border-[#27272A] bg-white dark:bg-[#161618] text-text-secondary dark:text-[#A1A1AA] hover:bg-bg-muted dark:hover:bg-[#1C1C1F] active:bg-bg-subtle dark:active:bg-[#1C1C1F]",
  ghost:
    "border border-transparent bg-transparent text-text-secondary dark:text-[#A1A1AA] hover:bg-bg-muted dark:hover:bg-[#1C1C1F] active:bg-bg-subtle dark:active:bg-[#1C1C1F]",
  destructive:
    "bg-error text-white hover:bg-error/90 active:bg-error/80 shadow-xs",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-small gap-1.5",
  md: "h-10 px-4 text-label gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  leadingIcon,
  trailingIcon,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center rounded-md font-medium transition duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Spinner size="sm" />
      ) : leadingIcon ? (
        <span className="h-4 w-4 shrink-0">{leadingIcon}</span>
      ) : null}
      {children}
      {!isLoading && trailingIcon && (
        <span className="h-4 w-4 shrink-0">{trailingIcon}</span>
      )}
    </button>
  );
}
export default Button;
