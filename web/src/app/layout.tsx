import type { Metadata } from "next";
import { Inter, Tektur, Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const tektur = Tektur({
  variable: "--font-tektur",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cifra — Contabilidad Venezuela",
  description:
    "Contabilidad fiscal venezolana: libros, retenciones y SENIAT. Producto de Informática González.",
  applicationName: "Cifra",
  authors: [{ name: "Informática González", url: "https://www.informaticagonzalez.com" }],
  icons: {
    icon: "/brand/ig-logo-blue.png",
    apple: "/brand/ig-logo-blue.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${tektur.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
