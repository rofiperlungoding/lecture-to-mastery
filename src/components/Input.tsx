import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { forwardRef, useId } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InputBaseProps {
  /** Visible label rendered above the input */
  label?: string;
  /** Helper text shown below (hidden when error is present) */
  helperText?: string;
  /** Error message shown in danger color below; also sets error ring */
  error?: string;
  /** Visual variant: input (default height) or textarea (min-h-[120px]) */
  as?: "input" | "textarea";
  /** Optional icon rendered inside the input on the leading side */
  leadingIcon?: React.ReactNode;
}

type NativeInputAttrs = Omit<InputHTMLAttributes<HTMLInputElement>, "as">;
type NativeTextareaAttrs = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "as"
>;

type InputAsInput = InputBaseProps & NativeInputAttrs & { as?: "input" };
type InputAsTextarea = InputBaseProps &
  NativeTextareaAttrs & { as: "textarea" };

type InputProps = InputAsInput | InputAsTextarea;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function inputClasses(error?: string, leadingIcon?: boolean) {
  const border = error
    ? "border-error/70 focus:border-error focus:ring-error/20 dark:focus:ring-error/30"
    : "border-border focus:border-brand-500 focus:ring-brand-500/20 dark:focus:ring-brand-500/30";

  const iconPadding = leadingIcon ? "pl-10" : "px-3";

  return [
    "w-full",
    "rounded-md",
    "border",
    "bg-surface",
    iconPadding,
    "py-2",
    "text-body text-text",
    "placeholder:text-text-muted",
    "transition-all duration-150 ease-standard",
    "focus:outline-none focus:ring-2",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-muted",
    "[&::selection]:bg-accent-subtle [&::selection]:text-accent-pressed",
    border,
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Input = forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  InputProps
>((props: InputProps, ref) => {
  // Use a discriminated union to handle input vs textarea
  const isTextarea = (props as InputAsTextarea).as === "textarea";

  const {
    label,
    helperText,
    error,
    as: _as,
    leadingIcon,
    id: externalId,
    className = "",
    ...rest
  } = props as InputBaseProps & Record<string, unknown>;

  const autoId = useId();
  const inputId = (externalId as string) || autoId;
  const describedBy = error
    ? `${inputId}-error`
    : helperText
      ? `${inputId}-helper`
      : undefined;

  const sharedClasses = inputClasses(error, !!leadingIcon);

  const inputEl = isTextarea ? (
    <textarea
      ref={ref as React.Ref<HTMLTextAreaElement>}
      id={inputId}
      className={`${sharedClasses} min-h-[120px] resize-y ${className}`}
      aria-invalid={error ? "true" : undefined}
      aria-describedby={describedBy}
      {...(rest as any)}
    />
  ) : (
    <div className="relative">
      {leadingIcon && (
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
          {leadingIcon}
        </div>
      )}
      <input
        ref={ref as React.Ref<HTMLInputElement>}
        id={inputId}
        className={`${sharedClasses} h-control-md ${className}`}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        {...(rest as any)}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-label text-text-secondary select-none"
        >
          {label}
        </label>
      )}
      {inputEl}
      {error && (
        <p id={`${inputId}-error`} className="text-small text-error" role="alert">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p id={`${inputId}-helper`} className="text-small text-text-tertiary">
          {helperText}
        </p>
      )}
    </div>
  );
});

Input.displayName = "Input";
export default Input;
