import type { ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../components/shared/EmptyState.tsx";
import { SampleDataBadge } from "../components/shared/SampleDataBadge.tsx";

interface PlaceholderProps {
  title: string;
  description?: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
}

/** Pages with no backend yet (Orders, Customers, Catalogue, Broadcast, Templates, IG Comments). */
export function Placeholder({ title, description, icon }: PlaceholderProps) {
  const navigate = useNavigate();

  return (
    <div className="my-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="font-display text-xl font-bold tracking-tight text-text">{title}</h1>
        <SampleDataBadge title="No backend for this page yet: it will show sample data until one exists" />
      </div>
      <div className="saba-card p-12 text-center">
        <EmptyState
          {...(icon ? { icon } : {})}
          title={title}
          description={
            description ||
            `The ${title} interface is scheduled for build in the next prompt phase. All components, design tokens, and mock schemas are ready.`
          }
          action={{
            label: "Return to Analytics",
            onClick: () => navigate("/analytics"),
          }}
        />
      </div>
    </div>
  );
}
