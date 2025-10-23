import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { StreamStoreProvider } from "@/providers/stream-store-provider";
import { UserStoreProvider } from "@/providers/user-store-provider";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MM LIVE",
  description: "Your Live Classroom, Connected.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <UserStoreProvider>
        <StreamStoreProvider>{children}</StreamStoreProvider>
        </UserStoreProvider>
        <Toaster richColors position="top-right"/>
      </body>
    </html>
  );
}
