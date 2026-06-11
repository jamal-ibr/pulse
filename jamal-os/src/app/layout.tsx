import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar, MobileNav, TopBar } from "@/components/shell";
import { getSetting } from "@/lib/services/settings";

export const metadata: Metadata = {
  title: "Jamal OS",
  description: "Your private operating system for discipline, strategy, and becoming.",
};

export const viewport: Viewport = {
  themeColor: "#0a0d12",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const dataMode = await getSetting("data_mode", "local_mock");
  return (
    <html lang="en-GB" className="dark">
      <body className="min-h-screen">
        <Sidebar dataMode={dataMode} />
        <TopBar dataMode={dataMode} />
        <main className="px-4 pb-24 pt-4 md:ml-56 md:px-8 md:pb-10 md:pt-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
        <MobileNav />
      </body>
    </html>
  );
}
