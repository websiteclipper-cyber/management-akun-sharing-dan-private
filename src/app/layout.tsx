import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/locale-context";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-outfit",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "pastipremium.my.id - Premium Account Platform",
  description: "Premium account inventory and auto delivery platform by pastipremium.my.id",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = cookieStore.get("pp_locale")?.value || "id";
  const currency = cookieStore.get("pp_currency")?.value || "IDR";

  return (
    <html lang={locale}>
      <body className={`${inter.variable} ${outfit.variable}`}>
        <LocaleProvider initialLocale={locale} initialCurrency={currency}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
