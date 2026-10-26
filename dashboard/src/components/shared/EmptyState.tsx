import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn.ts";
import { MascotIllustration } from "./MascotIllustration.tsx";

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "secondary" | "outline";
}

export interface EmptyStateProps {
  /** Title of the empty state, defaults to "No data found" */
  title?: string;
  /** Contextual explanation or suggestion */
  description?: ReactNode;
  /** Optional primary action button or link, or custom ReactNode */
  action?: EmptyStateAction | ReactNode;
  /** Size variant for different container layouts */
  size?: "default" | "compact" | "table";
  /** Whether to show the animated astronaut mascot (true by default) or a fallback icon */
  showIllustration?: boolean;
  /** Optional icon to use if illustration is disabled */
  icon?: ComponentType<{ size?: number; className?: string }> | LucideIcon;
  /** Additional container classes */
  className?: string;
}

function isActionObject(action: unknown): action is EmptyStateAction {
  return typeof action === "object" && action !== null && "label" in action;
}

export function EmptyState({
  title = "No data found",
  description,
  action,
  size = "default",
  showIllustration = true,
  icon: Icon,
  className = "",
}: EmptyStateProps) {
  const isCompact = size === "compact";
  const isTable = size === "table";

  const renderAction = () => {
    if (!action) return null;

    if (!isActionObject(action)) {
      return <div className={isCompact ? "mt-3.5" : "mt-5"}>{action}</div>;
    }

    const { label, onClick, href, variant = "primary" } = action;

    const variantClasses = {
      primary:
        "bg-primary text-primary-foreground font-semibold hover:brightness-105 active:scale-98 shadow-xs",
      secondary:
        "bg-surface-muted text-text font-medium hover:bg-border active:scale-98",
      outline:
        "border border-border bg-surface text-text font-medium hover:bg-surface-muted active:scale-98",
    }[variant];

    const buttonClass = cn(
      "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm transition cursor-pointer select-none",
      variantClasses
    );

    if (href) {
      return (
        <div className={isCompact ? "mt-3.5" : "mt-5"}>
          <Link to={href} className={buttonClass}>
            {label}
          </Link>
        </div>
      );
    }

    return (
      <div className={isCompact ? "mt-3.5" : "mt-5"}>
        <button type="button" onClick={onClick} className={buttonClass}>
          {label}
        </button>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center mx-auto",
        isCompact ? "p-4 max-w-sm" : isTable ? "py-10 px-4 max-w-md" : "p-8 max-w-md",
        className
      )}
    >
      {showIllustration ? (
        <MascotIllustration
          size={isCompact ? "compact" : "default"}
          className={isCompact ? "mb-3" : "mb-4"}
        />
      ) : (
        Icon && (
          <div className="w-12 h-12 rounded-2xl bg-primary-soft text-primary-text flex items-center justify-center mb-4 shadow-xs">
            <Icon size={22} className="h-5 w-5" />
          </div>
        )
      )}

      <h3
        className={cn(
          "font-display font-semibold text-text tracking-tight",
          isCompact ? "text-14" : "text-16 sm:text-18"
        )}
      >
        {title}
      </h3>

      {description && (
        <div
          className={cn(
            "text-text-muted",
            isCompact ? "mt-1 text-12 max-w-xs" : "mt-1.5 text-13 max-w-sm leading-relaxed"
          )}
        >
          {description}
        </div>
      )}

      {renderAction()}
    </div>
  );
}
