import type { HTMLAttributes } from "react";

export default function Card({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl bg-surface p-5 shadow-md transition-all duration-200 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
