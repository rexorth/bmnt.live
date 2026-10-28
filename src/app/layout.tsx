import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import Link from "next/link";
import { TimeModeToggle } from "@/components/time";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://bmnt.live"),
  title: { default: "bmnt.live: badminton schedules, draws and streams", template: "%s · bmnt.live" },
  description:
    "Professional badminton in one place: tournament calendar, draws, live scores, match times in your timezone, and where to watch.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              bmnt<span className="text-accent">.live</span>
            </Link>
            <nav className="flex gap-4 text-sm text-muted">
              <Link href="/tournaments" className="hover:text-ink">
                Tournaments
              </Link>
            </nav>
            <form action="/search" className="order-last w-full sm:order-none sm:ml-auto sm:w-72">
              <input
                type="search"
                name="q"
                placeholder="Player, tournament or date"
                aria-label="Search"
                className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none placeholder:text-muted focus:border-accent"
              />
            </form>
            <div className="ml-auto sm:ml-0">
              <TimeModeToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted">
            Schedules and results come from public BWF data; videos from public YouTube channels. Not affiliated with
            the BWF.
          </div>
        </footer>
      </body>
    </html>
  );
}
