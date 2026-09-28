import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface PageTitleValue {
  title: string | null;
  setTitle: (title: string | null) => void;
}

const PageTitleContext = createContext<PageTitleValue>({ title: null, setTitle: () => undefined });

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  return <PageTitleContext.Provider value={{ title, setTitle }}>{children}</PageTitleContext.Provider>;
}

export function usePageTitleValue(): string | null {
  return useContext(PageTitleContext).title;
}

/** Set the TopBar title (and document title) for the current page. */
export function usePageTitle(title: string): void {
  const { setTitle } = useContext(PageTitleContext);
  useEffect(() => {
    setTitle(title);
    document.title = `${title} · Resin Art Assistant`;
    return () => setTitle(null);
  }, [title, setTitle]);
}
