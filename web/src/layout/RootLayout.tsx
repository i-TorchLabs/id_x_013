import type { Metadata } from "next";
import { Providers } from "@/layout/Providers";
import "@/assets/styles/globals.css";

export const metadata: Metadata = {
    title: "TorchLabs",
    description:
        "Upload Excel/CSV files, parse data, and create database tables with ease.",
    icons: {
        icon: "/favicon.ico",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="antialiased">
            <body className="h-screen overflow-hidden">
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
