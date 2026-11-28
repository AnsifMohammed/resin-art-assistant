import { HeroCarousel } from "@/components/home/HeroCarousel";
import { CollectionQuartet } from "@/components/home/CollectionQuartet";
import { FeaturedPieces } from "@/components/home/FeaturedPieces";
import { ConfiguratorTeaser } from "@/components/home/ConfiguratorTeaser";
import { ProcessStrip } from "@/components/home/ProcessStrip";
import { MaterialsShowcase } from "@/components/home/MaterialsShowcase";
import { TestimonialsCarousel } from "@/components/home/TestimonialsCarousel";
import { InstagramWall } from "@/components/home/InstagramWall";

export default function HomePage() {
  return (
    <div className="flex flex-col w-full">
      <HeroCarousel />
      <CollectionQuartet />
      <FeaturedPieces />
      <ConfiguratorTeaser />
      <ProcessStrip />
      <MaterialsShowcase />
      <TestimonialsCarousel />
      <InstagramWall />
    </div>
  );
}
