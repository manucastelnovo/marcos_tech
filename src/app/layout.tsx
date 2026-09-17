import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

/**
 * Inter for the interface, as the client's spec asks. The variable name must
 * match what globals.css reads, or the browser silently falls back to serif.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/** Monospace for order numbers, SKUs and IMEIs, which are read character by character. */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MarcosTech — Gestión de servicio técnico",
  description: "Reparaciones, ventas, clientes y stock para MarcosTech",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The counter uses this on a phone. Zooming must stay available.
  maximumScale: 5,
  themeColor: "#0b1f3a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} ${geistMono.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
