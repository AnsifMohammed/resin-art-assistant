import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "text-color": [
        "text-text",
        "text-text-muted",
        "text-primary",
        "text-primary-foreground",
        "text-primary-text",
        "text-primary-soft",
        "text-surface",
        "text-surface-muted",
        "text-bg",
        "text-teal",
        "text-success",
        "text-warning",
        "text-danger",
        "text-info",
      ],
      "font-size": [
        "text-10",
        "text-11",
        "text-12",
        "text-13",
        "text-14",
        "text-15",
        "text-16",
        "text-18",
        "text-20",
        "text-24",
        "text-28",
        "text-32",
        "text-36",
      ],
    },
  },
});

export const cn = (...inputs: ClassValue[]) => customTwMerge(clsx(inputs));
