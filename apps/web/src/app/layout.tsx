import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GraphGuard Dashboard",
  description: "Continuous evaluation and release-safety for AI agent graphs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
