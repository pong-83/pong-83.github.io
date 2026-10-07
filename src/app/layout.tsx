import type { Metadata } from "next";
import "./globals.css";
import "./pong.css";
import "katex/dist/katex.min.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { GoogleAdSense } from "@/components/GoogleAdSense";
import { SiteHeader } from "@/components/pong/SiteHeader";
import { PongFooter } from "@/components/pong/PongFooter";
import { PALETTE_BOOT_SCRIPT } from "@/config/pong";
import { getSiteSettingsMemo, getSiteConfigMemo, listPublishedPostsMemo } from "@/lib/request-memo";

const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400&display=swap";

export async function generateMetadata(): Promise<Metadata> {
  const siteConfig = await getSiteConfigMemo();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://your-username.github.io';

  return {
    title: siteConfig.siteTitle,
    description: siteConfig.siteDescription,
    // Fix Notion S3 image CORS errors by setting referrer policy
    referrer: 'no-referrer',
    openGraph: {
      title: siteConfig.siteTitle,
      description: siteConfig.siteDescription,
      url: siteUrl,
      siteName: siteConfig.siteTitle,
      images: siteConfig.ogImage ? [
        {
          url: siteConfig.ogImage,
          width: 1200,
          height: 630,
          alt: siteConfig.siteTitle,
        },
      ] : undefined,
      locale: 'ko_KR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: siteConfig.siteTitle,
      description: siteConfig.siteDescription,
      images: siteConfig.ogImage ? [siteConfig.ogImage] : undefined,
      creator: siteConfig.twitterHandle || undefined,
    },
    alternates: {
      types: {
        'application/rss+xml': '/rss.xml',
      },
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Notion에서 설정 가져오기
  const settings = await getSiteSettingsMemo();
  const siteConfig = await getSiteConfigMemo();

  const name = settings.name || 'pong';
  let slugs: string[] = [];
  try {
    slugs = (await listPublishedPostsMemo()).map((post) => post.slug);
  } catch {
    slugs = [];
  }

  return (
    <html lang="ko" data-palette="mono" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PALETTE_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS_URL} />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body className="pg antialiased">
        {/* Google Analytics - Notion 설정에 따라 조건부 렌더링 */}
        {siteConfig.enableAnalytics && siteConfig.ga4MeasurementId && (
          <GoogleAnalytics measurementId={siteConfig.ga4MeasurementId} />
        )}

        {/* Google AdSense - afterInteractive 전략으로 최적화 */}
        {siteConfig.enableAdsense && siteConfig.adsensePublisherId && (
          <GoogleAdSense publisherId={siteConfig.adsensePublisherId} />
        )}

        {/* pong 테마는 밝은 화면 하나로 디자인되어 있어 라이트 모드로 고정 */}
        <ThemeProvider defaultTheme="light" storageKey="pong-theme">
          <div id="top" style={{ minHeight: '100vh' }}>
            <SiteHeader name={name} slugs={slugs} />
            {children}
            <PongFooter name={name} />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
