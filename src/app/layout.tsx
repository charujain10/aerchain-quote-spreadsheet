import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kill the Quote Spreadsheet",
  description: "RFx co-pilot, messy vendor replies read by a model, and a grounded quote analyst: corrugated packaging demo",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
