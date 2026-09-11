import "server-only";
import { prisma } from "@/shared/infrastructure/prisma";

export type BrandCatalogEntry = { name: string; models: string[] };

/**
 * Feeds the intake comboboxes. Free text is always accepted on top of this, so
 * an unlisted device never blocks the counter.
 */
export async function getDeviceCatalog(): Promise<BrandCatalogEntry[]> {
  const brands = await prisma.deviceBrand.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      name: true,
      models: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { name: true },
      },
    },
  });

  return brands.map((brand) => ({
    name: brand.name,
    models: brand.models.map((model) => model.name),
  }));
}

export type TechnicianOption = { id: string; fullName: string };

export async function listTechnicians(): Promise<TechnicianOption[]> {
  return prisma.user.findMany({
    where: { role: "TECHNICIAN", isActive: true, deletedAt: null },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });
}

export type WhatsAppTemplateOption = { key: string; label: string; body: string };

export async function listWhatsAppTemplates(): Promise<WhatsAppTemplateOption[]> {
  return prisma.whatsAppTemplate.findMany({
    orderBy: { label: "asc" },
    select: { key: true, label: true, body: true },
  });
}
