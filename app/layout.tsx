import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Track-Man",
  description: "Track-Man Event Operations",
  metadataBase: new URL("https://track-man.vercel.app"),
  openGraph: {
    title: "Track-Man",
    description: "Track-Man Event Operations",
    siteName: "Track-Man",
  },
  twitter: {
    card: "summary_large_image",
    title: "Track-Man",
    description: "Track-Man Event Operations",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body className="min-h-screen text-foreground bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
