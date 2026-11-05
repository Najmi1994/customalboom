import type { Metadata } from "next";
import "./globals.css";
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/400-italic.css';
import '@fontsource/inter/700-italic.css';
import '@fontsource/lora/400.css';
import '@fontsource/lora/400-italic.css';
import '@fontsource/lora/700.css';
import '@fontsource/lora/700-italic.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/dm-sans/400-italic.css';
import '@fontsource/dm-sans/700-italic.css';

const title = "Custom Album Online Designer & Templates | CustomAlboom.com";
const description = "Design custom photo albums online with flexible templates, private local photos and print-ready exports. Reka album custom anda dengan mudah.";
const socialTitle = "Create Your Custom Album Online | CustomAlboom.com";
const socialDescription = "Design with flexible templates, keep photos private on your computer and export print-ready pages. Reka album anda, cara anda.";

export const metadata: Metadata = {
  metadataBase: new URL("https://customalboom.com"),
  title,
  description,
  applicationName: "CustomAlboom.com",
  keywords: [
    "CustomAlboom",
    "CustomAlboom.com",
    "custom album online",
    "custom album designer",
    "custom album template",
    "online album design",
    "photo album maker",
    "print-ready album",
    "reka album custom",
    "template album custom",
    "design album online",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_MY",
    url: "/",
    siteName: "CustomAlboom.com",
    title: socialTitle,
    description: socialDescription,
    images: [{
      url: "/opengraph-image",
      width: 1200,
      height: 630,
      alt: "CustomAlboom.com custom album designer with wedding, family and travel photo memories",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: socialTitle,
    description: socialDescription,
    images: ["/opengraph-image"],
  },
  icons: {
    icon: { url: "/customalboom-logo.png", type: "image/png", sizes: "512x512" },
    shortcut: "/customalboom-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-MY">
      <body className="antialiased">{children}</body>
    </html>
  );
}
