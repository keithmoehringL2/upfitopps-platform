import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UpfitOutreach",
  description:
    "Market development platform for commercial vehicle distributors.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Loaded at runtime (not build time) so builds never depend on the
            font CDN. Swap to next/font once the design pass begins. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap"
          rel="stylesheet"
        />
        {/* Phosphor duotone icons — the icon set used across the design handoff. */}
        <link
          href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/duotone/style.css"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
