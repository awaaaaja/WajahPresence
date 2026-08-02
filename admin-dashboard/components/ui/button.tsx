import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "accent" | "secondary" | "outline" | "ghost" | "destructive" | "success";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-hover active:bg-primary-hover disabled:bg-primary/50",
  accent:
    "bg-accent text-white hover:bg-accent-hover active:bg-accent-hover disabled:bg-accent/50",
  secondary:
    "bg-primary-soft text-primary hover:bg-blue-200 disabled:bg-primary-soft/60",
  outline:
    "border-2 border-primary text-primary bg-surface hover:bg-primary-soft/50 disabled:border-border disabled:text-muted",
  ghost: "bg-transparent text-primary hover:bg-primary-soft/60 disabled:text-muted",
  destructive:
    "bg-destructive text-white hover:bg-red-700 disabled:bg-destructive/50",
  success: "bg-success text-white hover:bg-green-700 disabled:bg-success/50",
};

const sizeClasses: Record<Size, string> = {
  sm: "min-h-[40px] px-3 py-1.5 text-sm",
  md: "min-h-[44px] px-5 py-2.5 text-base",
  lg: "min-h-[52px] px-6 py-3 text-base",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    fullWidth = false,
    loading = false,
    disabled,
    className = "",
    children,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200 ease-out focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${variantClasses[variant]} ${sizeClasses[size]} ${
        fullWidth ? "w-full" : ""
      } ${className}`}
      {...props}
    >
      {loading && (
        <svg
          className="h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
});

export default Button;
