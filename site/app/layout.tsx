import type { Metadata } from "next";
import { Fraunces, Archivo } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Basis — a cap rate is three forces wearing one number",
  description:
    "Basis decomposes commercial real-estate price moves into the three forces a cap rate hides — debt cost, income, and required return — read from NYC public records.",
  metadataBase: new URL("https://buildabasis.com"),
  openGraph: {
    title: "Basis — a cap rate is three forces wearing one number",
    description:
      "Decomposing CRE price moves into debt cost, income, and required return, from NYC public records.",
    url: "https://buildabasis.com",
    siteName: "Basis",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Basis — a cap rate is three forces wearing one number",
    description:
      "Decomposing CRE price moves into debt cost, income, and required return, from NYC public records.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${archivo.variable}`}>
      <body
        style={
          {
            "--serif": "var(--font-fraunces), Georgia, serif",
            "--sans": "var(--font-archivo), Helvetica Neue, Arial, sans-serif",
          } as React.CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
