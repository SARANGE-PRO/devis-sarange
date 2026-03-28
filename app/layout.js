import "./globals.css";
import { Inter } from "next/font/google";

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

export const metadata = {
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
        {children}
      </body>
    </html>
  );
}
