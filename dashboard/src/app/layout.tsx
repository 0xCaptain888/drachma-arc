import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Drachma Network — AI Agents Collectively Managing Stablecoin Reserves",
  description:
    "A network of AI agents collectively managing stablecoin reserves on Arc. Signal Bus consensus, DrachmaScore leaderboard, autonomous FX hedging, yield optimization, and portfolio rebalancing.",
  keywords: ["stablecoin", "DeFi", "Arc", "USDC", "EURC", "USYC", "yield", "AI agents", "signal bus", "DrachmaScore"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-dark-bg text-white antialiased">
        <Navbar />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}
