import { ArrowUpRight } from "lucide-react";
import { Instagram } from "@/components/ui/Icons";
import { BRAND } from "@/lib/copy";

export function InstagramWall() {
  const mockPosts = [
    { id: "p1", tag: "Layer 3 wave foam curing", color: "linear-gradient(135deg, #0E7C7B 0%, #16131F 100%)" },
    { id: "p2", tag: "Preserving crimson bridal petals", color: "linear-gradient(135deg, #7C5BD9 0%, #0C0A14 100%)" },
    { id: "p3", tag: "Hand sanding teak wood edges", color: "linear-gradient(135deg, #FAF8F5 0%, #E8E3DB 100%)" },
    { id: "p4", tag: "Custom 16-inch clock delivery", color: "linear-gradient(135deg, #E8912B 0%, #C9A227 100%)" },
  ];

  return (
    <section className="relative mx-auto w-full max-w-[1920px] px-6 sm:px-10 lg:px-16 2xl:px-24 py-20 md:py-28 border-t border-[var(--border)]">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Studio Journal
          </span>
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl mt-2">
            Live from the Coimbatore workshop.
          </h2>
        </div>
        <a
          href={BRAND.instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-tertiary text-sm mt-4 md:mt-0"
        >
          <Instagram className="h-4 w-4" />
          <span>Follow {BRAND.instagram}</span>
          <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {mockPosts.map((post) => (
          <a
            key={post.id}
            href={BRAND.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative aspect-square overflow-hidden rounded-2xl border border-[var(--border)] p-4 flex flex-col justify-end transition-transform duration-300 hover:scale-[1.02]"
            style={{ background: post.color }}
          >
            <div className="glass-surface p-3 rounded-lg border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="text-xs font-medium text-white line-clamp-1">{post.tag}</p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
