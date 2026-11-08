import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn.ts";

export interface DataTableColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  headerClass?: string;
  cellClass?: string;
  /** e.g. "w-14" – applied to both th and td */
  width?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Extra classes per row; can be a function for conditional styles */
  rowClassName?: string | ((row: T) => string);
  /** Fills parent height – use on full-height route pages */
  fullHeight?: boolean;
  /** Forces a minimum table width so narrow viewports get horizontal scroll */
  minTableWidth?: string;
  /** Enable virtual scrolling – renders only visible rows. Requires fullHeight=true */
  virtual?: boolean;
  /** Row height in px when virtual=true (all rows must be uniform) */
  rowHeight?: number;
  /** th / td padding class. Default "p-3.5" */
  cellPadding?: string;
  /** Extra class on the outer card wrapper */
  className?: string;
}

function useVirtualScroll(rowCount: number, rowHeight: number, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(500);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop((e.currentTarget).scrollTop);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.contentRect.height);
    });
    obs.observe(el);
    setHeight(el.clientHeight);
    return () => obs.disconnect();
  }, [enabled]);

  const overscan = 2;
  const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIdx = Math.min(rowCount, Math.ceil((scrollTop + height) / rowHeight) + overscan);

  return {
    ref,
    onScroll,
    startIdx,
    endIdx,
    paddingTop: startIdx * rowHeight,
    paddingBottom: Math.max(0, (rowCount - endIdx) * rowHeight),
  };
}

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  onRowClick,
  rowClassName,
  fullHeight = false,
  minTableWidth,
  virtual = false,
  rowHeight = 60,
  cellPadding = "p-3.5",
  className,
}: DataTableProps<T>) {
  const vs = useVirtualScroll(data.length, rowHeight, virtual && fullHeight);

  const visibleRows = virtual && fullHeight
    ? data.slice(vs.startIdx, vs.endIdx)
    : data;

  const getRowClass = (row: T) =>
    typeof rowClassName === "function" ? rowClassName(row) : (rowClassName ?? "");

  const tableEl = (
    <table
      className={cn("w-full text-left text-13 border-collapse", minTableWidth)}
      style={minTableWidth ? undefined : undefined}
    >
      <thead className="sticky top-0 z-10 bg-surface-muted border-b border-border text-11 uppercase font-semibold text-text-muted shadow-xs">
        <tr>
          {columns.map((col) => (
            <th
              key={col.id}
              className={cn(cellPadding, col.width, col.headerClass)}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border/40">
        {/* top virtual spacer */}
        {virtual && vs.paddingTop > 0 && (
          <tr aria-hidden>
            <td
              colSpan={columns.length}
              style={{ height: vs.paddingTop, padding: 0, border: 0 }}
            />
          </tr>
        )}

        {visibleRows.map((row) => (
          <tr
            key={getRowKey(row)}
            style={virtual ? { height: rowHeight } : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn(
              onRowClick && "cursor-pointer hover:bg-surface-muted transition-colors group",
              getRowClass(row),
            )}
          >
            {columns.map((col) => (
              <td key={col.id} className={cn(cellPadding, col.width, col.cellClass)}>
                {col.cell(row)}
              </td>
            ))}
          </tr>
        ))}

        {/* bottom virtual spacer */}
        {virtual && vs.paddingBottom > 0 && (
          <tr aria-hidden>
            <td
              colSpan={columns.length}
              style={{ height: vs.paddingBottom, padding: 0, border: 0 }}
            />
          </tr>
        )}
      </tbody>
    </table>
  );

  if (fullHeight) {
    return (
      <div
        className={cn(
          "rounded-xl border border-border bg-surface shadow-xs overflow-hidden flex flex-col h-full",
          className,
        )}
      >
        <div
          ref={vs.ref}
          className="flex-1 overflow-auto custom-scrollbar"
          onScroll={vs.onScroll}
        >
          {tableEl}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-xs overflow-hidden",
        className,
      )}
    >
      <div className="overflow-x-auto custom-scrollbar">
        {tableEl}
      </div>
    </div>
  );
}
