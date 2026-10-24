import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { DemoBoot } from "@/components/shell/DemoBoot";
import { AppShell } from "@/components/shell/AppShell";
import { MotionRoot } from "@/components/shell/MotionRoot";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "GTM OS",
  description: "A go-to-market operating system: research, offer, content, paid media, capture, sales floor, attribution and AI ops in one cockpit.",
  icons: {
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0b0c1a"/><polygon points="50,14 82,32 82,68 50,86 18,68 18,32" fill="none" stroke="#00e5ff" stroke-width="7"/><circle cx="50" cy="50" r="10" fill="#ff3df5"/></svg>'
      ),
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} dark h-full antialiased`}>
      <body className="h-full overflow-hidden bg-background text-foreground">
        <DemoBoot />
        <MotionRoot />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
