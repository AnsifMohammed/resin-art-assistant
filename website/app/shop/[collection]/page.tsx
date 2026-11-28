import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { COLLECTIONS, getProductsByCollection } from "@/lib/products";
import { ProductCard } from "@/components/product/ProductCard";
import { ResinSwirl } from "@/components/textures/ResinSwirl";

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ collection: string }>;
}) {
  const { collection } = await params;
  const currentCollection = COLLECTIONS.find((c) => c.slug === collection);

  if (!currentCollection) {
    notFound();
  }

  const products = getProductsByCollection(currentCollection.name);

  return (
    <div className="relative min-h-screen py-16">
      <ResinSwirl opacity={0.04} />

      <div className="relative mx-auto w-full max-w-[1920px] px-6 sm:px-10 lg:px-16 2xl:px-24">
        <div className="mb-6">
          <Link
            href="/shop"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to all pieces
          </Link>
        </div>

        <div className="max-w-2xl mb-12">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Collection
          </span>
          <h1 className="font-serif text-4xl font-bold tracking-tight text-[var(--text)] sm:text-5xl mt-2">
            {currentCollection.name}
          </h1>
          <p className="mt-3 text-base text-[var(--text-muted)] leading-relaxed">
            {currentCollection.description}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 sm:gap-8">
          {products.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      </div>
    </div>
  );
}
