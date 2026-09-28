import { Construction } from "lucide-react";
import { usePageTitle } from "../components/layout/PageTitle.tsx";
import { EmptyState } from "../components/ui/EmptyState.tsx";

/** Temporary page body until the feature page is built. */
export function Placeholder({ title }: { title: string }) {
  usePageTitle(title);
  return <EmptyState icon={Construction} title={title} description={`TODO: build the ${title} page.`} className="py-24" />;
}
