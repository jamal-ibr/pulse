import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar, MobileNav, TopBar } from "@/components/shell";
import { RegisterServiceWorker } from "@/components/register-sw";
import { getSetting } from "@/lib/services/settings";

export const metadata: Metadata = {
  title: "Jamal OS",
  description: "Your private operating system for discipline, strategy, and becoming.",
  appleWebApp: {
    capable: true,
    title: "Jamal OS",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#040c14",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
