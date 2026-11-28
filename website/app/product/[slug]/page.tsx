import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PRODUCTS, getProductBySlug } from "@/lib/products";
import { ProductDetailView } from "@/components/product/ProductDetailView";

export async function generateStaticParams() {
  return PRODUCTS.map((product) => ({
    slug: product.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);

  if (!product) {
    return {
      title: "Piece Not Found — Saba Art",
    };
  }

  return {
    title: `${product.name} — Saba Art Studio`,
    description: product.description,
    openGraph: {
      title: `${product.name} — Handmade Resin Art`,
      description: product.tagline,
      type: "website",
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const relatedSameCollection = PRODUCTS.filter(
    (p) => p.slug !== product.slug && p.collection === product.collection
  );
  const related = (
    relatedSameCollection.length >= 3
      ? relatedSameCollection
      : [
          ...relatedSameCollection,
          ...PRODUCTS.filter((p) => p.slug !== product.slug && p.collection !== product.collection),
        ]
  ).slice(0, 4);

  // Schema.org Product JSON-LD
  const minPrice = Math.min(...product.sizes.map((s) => s.price));
  const maxPrice = Math.max(...product.sizes.map((s) => s.price));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images?.[0] || `/brand/product-${product.slug}.svg`,
    brand: {
      "@type": "Brand",
      name: "Saba Art",
    },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "INR",
      lowPrice: minPrice,
      highPrice: maxPrice,
      price: minPrice,
      availability: "https://schema.org/MadeToOrder",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductDetailView product={product} relatedProducts={related} />
    </>
  );
}
