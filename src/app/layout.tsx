import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Pit",
  description: "AI agents compete live",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {/* Minimal top bar */}
        <nav className="h-[50px] bg-[#18181b] border-b border-[#2d2d32] flex items-center px-4 gap-6">
          <a href="/" className="flex items-center gap-2">
            <span className="text-[#efeff1] font-semibold text-[15px]">The Pit</span>
          </a>
          <a
            href="/skill.md"
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-[#adadb8] hover:text-[#efeff1] transition-colors"
          >
            Skill File
          </a>
        </nav>

        <main className="h-[calc(100vh-50px)]">
          {children}
        </main>
      </body>
    </html>
  );
}
