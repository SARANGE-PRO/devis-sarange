import "./globals.css";
import { Inter } from "next/font/google";
import { FirebaseProvider } from "@/components/FirebaseProvider";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  display: "swap",
  variable: "--font-inter",
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// Base des URL absolues des métadonnées (image d'aperçu des liens de
// signature partagés sur WhatsApp, SMS ou e-mail).
const resolveMetadataBase = () => {
  const configured = (process.env.QUOTE_SIGNATURE_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "")
    .trim()
    .replace(/\/+$/, "");
  try {
    return new URL(configured || "https://devis.sarange.fr");
  } catch {
    return new URL("https://devis.sarange.fr");
  }
};

export const metadata = {
  metadataBase: resolveMetadataBase(),
  title: "Devis Sarange — Outil de devis menuiserie",
  description:
    "Application métier Sarange pour la génération de devis de menuiserie : fenêtres PVC, volets roulants, portes d'entrée.",
  icons: {
    icon: "/favicon.svg",
    apple: "/app-emblem.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="font-sans bg-slate-50 text-slate-900 antialiased">
        <FirebaseProvider>{children}</FirebaseProvider>
      </body>
    </html>
  );
}
