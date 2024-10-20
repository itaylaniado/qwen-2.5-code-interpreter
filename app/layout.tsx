import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { Github, Twitter } from "lucide-react";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
const alphaLyrae = localFont({
  src: "./fonts/AlphaLyrae-Medium.woff",
  variable: "--font-alpha-lyrae",
});

export const metadata: Metadata = {
  title: "Qwen-2.5 Coder - Code Interpreter",
  description: "Qwen-2.5 Coder - Code Interpreter",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${alphaLyrae.variable} antialiased bg-background text-foreground`}
      >
        <nav className="bg-muted bg-opacity-80 backdrop-blur-sm fixed top-0 left-0 right-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-end h-16">
              <div className="flex items-center space-x-4">
                <Link href="https://github.com/cfahlgren1/qwen-2.5-code-interpreter" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  <Github className="w-5 h-5" />
                </Link>
                <Link href="https://twitter.com/calebfahlgren" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  <Twitter className="w-5 h-5" />
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <main className="pt-16">
          {children}
        </main>
      </body>
    </html>
  );
}
