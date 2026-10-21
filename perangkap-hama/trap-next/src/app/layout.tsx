import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";
import { EWSProvider } from "@/context/EWSContext";
import { AppLayout } from "@/components/AppLayout";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Sistem Pemantau & Kendali Perangkap Hama IoT",
  description: "Platform Monitoring & Kendali Otomatis Perangkap Hama Cerdas Berbasis IoT & Fototaksis UV",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning className={`${plusJakartaSans.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-[var(--bg-app)] text-[var(--text-app)] antialiased">
        <ThemeProvider>
          <EWSProvider>
            <AppLayout>
              {children}
            </AppLayout>
          </EWSProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
