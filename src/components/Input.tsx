import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";

interface InputBaseProps {
  label?: string;
  helperText?: string;
  error?: string;
}

type InputAsInput = InputBaseProps &
  InputHTMLAttributes<HTMLInputElement> & { as?: "input" };
type InputAsTextarea = InputBaseProps &
  TextareaHTMLAttributes<HTMLTextAreaElement> & { as: "textarea" };

type InputProps = InputAsInput | InputAsTextarea;

function inputClasses(error?: string) {
  const border = error
    ? "border-error focus:ring-error/20"
    : "border-border dark:border-[#27272A] focus:border-brand-500 focus:ring-brand-500/20";
  return `w-full rounded-md border bg-white dark:bg-[#1C1C1F] px-3 py-2 text-body text-text dark:text-[#FAFAFA] placeholder-text-muted dark:placeholder-[#71717A] transition-colors duration-150 ease-out focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${border}`;
}

export const Input = forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  InputProps
>((props, ref) => {
  const { label, helperText, error, as, ...rest } = props as InputBaseProps & {
    as?: string;
  } & Record<string, unknown>;

  const inputEl =
    as === "textarea" ? (
      <textarea
        ref={ref as React.Ref<HTMLTextAreaElement>}
        className={`${inputClasses(error)} min-h-[120px] resize-y`}
        {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
      />
    ) : (
      <input
        ref={ref as React.Ref<HTMLInputElement>}
        className={`${inputClasses(error)} h-10`}
        {...(rest as InputHTMLAttributes<HTMLInputElement>)}
      />
    );

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-label text-text-secondary dark:text-[#A1A1AA]">
          {label}
        </label>
      )}
      {inputEl}
      {error && <p className="text-small text-error">{error}</p>}
      {helperText && !error && (
        <p className="text-small text-text-muted dark:text-[#71717A]">
          {helperText}
        </p>
      )}
    </div>
  );
});

Input.displayName = "Input";
export default Input;
