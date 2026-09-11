import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Development seed.
 *
 * The three accounts below exist so the shop can be walked through end to end
 * on day one. Change these passwords before this reaches a real counter.
 */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SEED_USERS = [
  {
    email: "admin@marcostech.py",
    fullName: "Marcos Administrador",
    role: "ADMIN" as const,
    password: "Admin-2026-MT",
  },
  {
    email: "vendedor@marcostech.py",
    fullName: "Ana Vendedora",
    role: "SELLER" as const,
    password: "Vendedor-2026-MT",
  },
  {
    email: "tecnico@marcostech.py",
    fullName: "Luis Técnico",
    role: "TECHNICIAN" as const,
    password: "Tecnico-2026-MT",
  },
];

/** Catalogue for the intake comboboxes. Free text is always allowed on top. */
const DEVICE_CATALOG: Record<string, string[]> = {
  Apple: [
    "iPhone 11", "iPhone 11 Pro", "iPhone 12", "iPhone 12 Pro", "iPhone 13",
    "iPhone 13 Pro", "iPhone 14", "iPhone 14 Pro", "iPhone 15", "iPhone 15 Pro",
    "iPhone 16", "iPhone SE", "iPad 9", "iPad 10", "iPad Air", "iPad Pro 11",
  ],
  Samsung: [
    "Galaxy A14", "Galaxy A15", "Galaxy A24", "Galaxy A34", "Galaxy A54",
    "Galaxy S21", "Galaxy S22", "Galaxy S23", "Galaxy S24", "Galaxy M14",
    "Galaxy Tab A8", "Galaxy Tab S9",
  ],
  Xiaomi: [
    "Redmi 12", "Redmi 13C", "Redmi Note 11", "Redmi Note 12", "Redmi Note 13",
    "Poco X5", "Poco X6", "Xiaomi 13", "Xiaomi 14", "Redmi Pad",
  ],
  Motorola: ["Moto G13", "Moto G23", "Moto G54", "Moto G84", "Moto E13", "Edge 40"],
  Huawei: ["Y9", "P30 Lite", "Nova 9", "Nova 11", "MatePad T10"],
  Realme: ["C53", "C55", "Note 50", "11 Pro"],
  Infinix: ["Hot 30", "Hot 40", "Note 30", "Smart 8"],
  Tecno: ["Spark 10", "Spark 20", "Camon 20"],
  LG: ["K42", "K52", "K62"],
  Nokia: ["G21", "C32"],
};

const WHATSAPP_TEMPLATES = [
  {
    key: "received",
    label: "Recibimos tu equipo",
    body: "Hola {{cliente}}, recibimos tu {{equipo}} en MarcosTech. Tu número de orden es {{orden}}. Te avisamos apenas tengamos novedades.",
  },
  {
    key: "in_diagnosis",
    label: "En diagnóstico",
    body: "Hola {{cliente}}, tu {{equipo}} (orden {{orden}}) está en diagnóstico. En breve te pasamos el presupuesto.",
  },
  {
    key: "quote_ready",
    label: "Presupuesto disponible",
    body: "Hola {{cliente}}, ya tenemos el presupuesto de tu {{equipo}} (orden {{orden}}): {{total}}. ¿Lo aprobamos?",
  },
  {
    key: "approved",
    label: "Reparación aprobada",
    body: "Hola {{cliente}}, gracias por aprobar la reparación de tu {{equipo}}. Empezamos a trabajar en la orden {{orden}}.",
  },
  {
    key: "ready",
    label: "Listo para retirar",
    body: "Hola {{cliente}}, tu {{equipo}} ya está listo para retirar. Orden {{orden}}. Saldo pendiente: {{saldo}}. Te esperamos.",
  },
  {
    key: "pickup_reminder",
    label: "Recordatorio de retiro",
    body: "Hola {{cliente}}, te recordamos que tu {{equipo}} (orden {{orden}}) sigue esperando en el local. ¿Cuándo pasás a retirarlo?",
  },
];

/**
 * A starting catalogue so the stock screens are usable on day one. Quantities
 * stay at zero on purpose: real units enter through a purchase, which is what
 * establishes their cost.
 */
const PRODUCTS = [
  { sku: "PANT-IP13", name: "Pantalla iPhone 13 OLED", category: "SCREEN" as const, compatibility: "iPhone 13", salePrice: "1450000", minStock: 2, tracksSerial: true },
  { sku: "PANT-IP12", name: "Pantalla iPhone 12 OLED", category: "SCREEN" as const, compatibility: "iPhone 12 / 12 Pro", salePrice: "1250000", minStock: 2, tracksSerial: true },
  { sku: "PANT-A54", name: "Pantalla Galaxy A54", category: "SCREEN" as const, compatibility: "Galaxy A54", salePrice: "780000", minStock: 2, tracksSerial: true },
  { sku: "PANT-RN12", name: "Pantalla Redmi Note 12", category: "SCREEN" as const, compatibility: "Redmi Note 12", salePrice: "420000", minStock: 3, tracksSerial: false },
  { sku: "BAT-IP13", name: "Batería iPhone 13", category: "BATTERY" as const, compatibility: "iPhone 13", salePrice: "480000", minStock: 3, tracksSerial: true },
  { sku: "BAT-A54", name: "Batería Galaxy A54", category: "BATTERY" as const, compatibility: "Galaxy A54", salePrice: "280000", minStock: 3, tracksSerial: false },
  { sku: "PIN-IP13", name: "Pin de carga iPhone 13", category: "CONNECTOR" as const, compatibility: "iPhone 13", salePrice: "180000", minStock: 5, tracksSerial: false },
  { sku: "PIN-TIPOC", name: "Pin de carga tipo C genérico", category: "CONNECTOR" as const, compatibility: "Varios Android", salePrice: "90000", minStock: 10, tracksSerial: false },
  { sku: "FLEX-IP13", name: "Flex de botón encendido iPhone 13", category: "FLEX" as const, compatibility: "iPhone 13", salePrice: "150000", minStock: 3, tracksSerial: false },
  { sku: "CAM-IP12", name: "Cámara trasera iPhone 12", category: "CAMERA" as const, compatibility: "iPhone 12", salePrice: "520000", minStock: 1, tracksSerial: true },
  { sku: "VID-IP13", name: "Vidrio templado iPhone 13", category: "GLASS" as const, compatibility: "iPhone 13 / 14", salePrice: "45000", minStock: 20, tracksSerial: false },
  { sku: "FUN-IP13", name: "Funda silicona iPhone 13", category: "CASE" as const, compatibility: "iPhone 13", salePrice: "60000", minStock: 15, tracksSerial: false },
  { sku: "CARG-20W", name: "Cargador 20W USB-C", category: "CHARGER" as const, compatibility: "Universal", salePrice: "120000", minStock: 10, tracksSerial: false },
  { sku: "CAB-LIGHT", name: "Cable Lightning 1m", category: "CABLE" as const, compatibility: "iPhone", salePrice: "55000", minStock: 15, tracksSerial: false },
  { sku: "CAB-TIPOC", name: "Cable tipo C 1m", category: "CABLE" as const, compatibility: "Android", salePrice: "45000", minStock: 20, tracksSerial: false },
];

async function main() {
  console.log("Seeding MarcosTech...");

  for (const user of SEED_USERS) {
    const passwordHash = await bcrypt.hash(user.password, 12);
    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        passwordHash,
      },
      update: { fullName: user.fullName, role: user.role },
    });
    console.log(`  user  ${user.email} (${user.role})`);
  }

  for (const [brandName, models] of Object.entries(DEVICE_CATALOG)) {
    const brand = await prisma.deviceBrand.upsert({
      where: { name: brandName },
      create: { name: brandName },
      update: {},
    });

    for (const modelName of models) {
      await prisma.deviceModel.upsert({
        where: { brandId_name: { brandId: brand.id, name: modelName } },
        create: { brandId: brand.id, name: modelName },
        update: {},
      });
    }
    console.log(`  brand ${brandName} (${models.length} modelos)`);
  }

  for (const product of PRODUCTS) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      create: {
        sku: product.sku,
        name: product.name,
        category: product.category,
        compatibility: product.compatibility,
        salePrice: product.salePrice,
        minStock: product.minStock,
        tracksSerial: product.tracksSerial,
        currency: "PYG",
      },
      // Never touch quantity or averageCost here: those belong to the ledger.
      update: {
        name: product.name,
        category: product.category,
        compatibility: product.compatibility,
        minStock: product.minStock,
      },
    });
  }
  console.log(`  ${PRODUCTS.length} productos de stock`);

  for (const template of WHATSAPP_TEMPLATES) {
    await prisma.whatsAppTemplate.upsert({
      where: { key: template.key },
      create: template,
      update: { label: template.label },
    });
  }
  console.log(`  ${WHATSAPP_TEMPLATES.length} plantillas de WhatsApp`);

  console.log("\nCuentas de desarrollo:");
  for (const user of SEED_USERS) {
    console.log(`  ${user.role.padEnd(11)} ${user.email}  ${user.password}`);
  }
  console.log("\nCambiá estas contraseñas antes de usar el sistema en el local.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
