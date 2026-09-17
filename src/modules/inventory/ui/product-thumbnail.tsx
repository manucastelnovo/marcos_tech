import Image from "next/image";
import {
  BatteryFull,
  Cable,
  Camera,
  Cpu,
  Headphones,
  Layers,
  Package,
  Plug,
  PlugZap,
  Shield,
  Smartphone,
  Spline,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PRODUCT_CATEGORY_LABEL, type ProductCategory } from "../domain/product";

const CATEGORY_ICON: Record<ProductCategory, React.ComponentType<{ className?: string }>> = {
  SCREEN: Smartphone,
  BATTERY: BatteryFull,
  BOARD: Cpu,
  CAMERA: Camera,
  CONNECTOR: Plug,
  FLEX: Spline,
  CHARGER: PlugZap,
  CABLE: Cable,
  CASE: Shield,
  GLASS: Layers,
  ACCESSORY: Headphones,
  OTHER: Package,
};

export function CategoryIcon({
  category,
  className,
}: {
  category: ProductCategory;
  className?: string;
}) {
  const Icon = CATEGORY_ICON[category];
  return <Icon className={className} />;
}

/**
 * The product's picture, or its category icon when it has none. Most parts
 * are recognised by name, so a missing picture is normal, not an error.
 */
export function ProductThumbnail({
  imageUrl,
  name,
  category,
  sizes,
  className,
}: {
  imageUrl: string | null;
  name: string;
  category: ProductCategory;
  sizes: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-muted text-muted-foreground relative flex items-center justify-center overflow-hidden",
        className,
      )}
    >
      {imageUrl ? (
        <Image src={imageUrl} alt={name} fill sizes={sizes} className="object-cover" unoptimized />
      ) : (
        <CategoryIcon category={category} className="size-1/3 max-h-10 max-w-10" />
      )}
      <span className="sr-only">{imageUrl ? null : PRODUCT_CATEGORY_LABEL[category]}</span>
    </div>
  );
}
