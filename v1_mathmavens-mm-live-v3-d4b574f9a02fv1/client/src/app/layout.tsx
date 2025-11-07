import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { StreamStoreProvider } from "@/providers/stream-store-provider";
import { UserStoreProvider } from "@/providers/user-store-provider";
import { Toaster } from "@/components/ui/sonner";
import { Suspense } from "react";
import LoadingScreen from "@/components/screen/LoadingScreen";

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
        <Suspense fallback={<LoadingScreen />}>
        <UserStoreProvider>
        <StreamStoreProvider>{children}</StreamStoreProvider>
        </UserStoreProvider>
        </Suspense>
        <Toaster richColors position="top-right"/>
      </body>
    </html>
  );
}
