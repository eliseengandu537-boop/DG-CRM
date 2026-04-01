import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

const CHUNK_RETRY_SCRIPT = `
(() => {
  const retryKey = '__dg_next_chunk_retry_count__';
  const maxRetries = 4;
  let reloadScheduled = false;

  const getRetryCount = () => {
    try {
      return Number(sessionStorage.getItem(retryKey) || '0');
    } catch {
      return 0;
    }
  };

  const setRetryCount = (value) => {
    try {
      sessionStorage.setItem(retryKey, String(value));
    } catch {}
  };

  const clearRetryCount = () => {
    try {
      sessionStorage.removeItem(retryKey);
    } catch {}
  };

  const isNextStaticAsset = (value) => String(value || '').includes('/_next/static/');

  const scheduleReload = () => {
    if (reloadScheduled) return;

    const currentRetryCount = getRetryCount();
    if (currentRetryCount >= maxRetries) return;

    reloadScheduled = true;
    const nextRetryCount = currentRetryCount + 1;
    setRetryCount(nextRetryCount);

    const delay = Math.min(600 * nextRetryCount, 2500);
    window.setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.set('__next_chunk_retry__', String(Date.now()));
      window.location.replace(url.toString());
    }, delay);
  };

  window.addEventListener(
    'error',
    (event) => {
      const target = event && event.target;
      if (!target) return;

      const src =
        (target instanceof HTMLScriptElement && target.src) ||
        (target instanceof HTMLLinkElement && target.href) ||
        '';

      if (!isNextStaticAsset(src)) return;
      scheduleReload();
    },
    true
  );

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event && event.reason;
    const message = String(reason && reason.message ? reason.message : reason || '');
    if (
      message.includes('ChunkLoadError') ||
      message.includes('Loading chunk') ||
      message.includes('Failed to fetch dynamically imported module')
    ) {
      scheduleReload();
    }
  });

  window.addEventListener('load', () => {
    window.setTimeout(() => {
      reloadScheduled = false;
      clearRetryCount();
    }, 5000);
  });
})();
`;

export const metadata: Metadata = {
  title: "DG Property CRM",
  description: "Comprehensive Real Estate Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="text-stone-950 bg-stone-100 antialiased">
        <script dangerouslySetInnerHTML={{ __html: CHUNK_RETRY_SCRIPT }} />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
