import type { Metadata } from "next";
import { Cabin, Lustria } from "next/font/google";
import "./globals.css";

const cabin = Cabin({
  variable: "--font-cabin",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const lustria = Lustria({
  variable: "--font-lustria",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Grant Radar | GreatGrants.ai",
  description:
    "Research any nonprofit, fund, or funder and surface relevant federal grant opportunities.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cabin.variable} ${lustria.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
