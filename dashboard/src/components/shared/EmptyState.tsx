import type { ComponentType } from "react";

interface EmptyStateProps {
  icon?: ComponentType<{ size?: number; className?: string }>;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto ${className}`}>
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-primary-soft text-primary-text flex items-center justify-center mb-4 shadow-xs">
          <Icon size={22} />
        </div>
      )}
      <h3 className="font-display font-semibold text-lg text-text">{title}</h3>
      {description && <p className="mt-1.5 text-sm text-text-muted">{description}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:brightness-105 active:scale-98 transition shadow-xs cursor-pointer"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
