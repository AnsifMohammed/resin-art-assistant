import type { Metadata } from "next";
import "./globals.css";
import { StoreLayout } from "@/components/layout/StoreLayout";

export const metadata: Metadata = {
  title: "Saba Art — Handmade Resin Art Studio in Coimbatore",
  description:
    "Bespoke ocean wave clocks, bridal bouquet preservation, and custom resin decor poured by hand to order in Coimbatore, Tamil Nadu.",
  metadataBase: new URL("https://sabaart.in"),
  icons: {
    icon: "/brand/saba-logo.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Saba Art — Handmade Resin Art Studio",
    description:
      "Handmade resin art pieces poured by hand to order in Coimbatore. Preserved botanicals, ocean clocks, and custom heirloom gifts.",
    locale: "en_IN",
    type: "website",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
        alt: "Saba Art Handcrafted Resin Art Studio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Saba Art — Handmade Resin Art Studio in Coimbatore",
    description:
      "Bespoke ocean wave clocks, bridal bouquet preservation, and custom resin decor poured by hand to order in Coimbatore, Tamil Nadu.",
    images: ["/brand/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600..700;1,9..144,600..700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">
        <StoreLayout>{children}</StoreLayout>
      </body>
    </html>
  );
}
