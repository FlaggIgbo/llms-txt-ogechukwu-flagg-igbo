import crypto from 'node:crypto';

// Results from a lightweight probe.
export interface ProbeResult {
  changed: boolean;
  etag: string | null;
  lastModified: string | null;
  contentHash: string | null;
}

// Compute SHA-256 hash of a text string.
export function hashText(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Lightweight HTTP check to see if a site changed without launching Playwright.
export async function probeWebsiteChanges(
  websiteUrl: string,
  lastEtag?: string | null,
  lastModified?: string | null,
  lastContentHash?: string | null
): Promise<ProbeResult> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };

  // Add conditional headers if previously saved.
  if (lastEtag) {
    headers['If-None-Match'] = lastEtag;
  }
  if (lastModified) {
    headers['If-Modified-Since'] = lastModified;
  }

  try {
    const res = await fetch(websiteUrl, {
      method: 'GET',
      headers,
    });

    // Step 1: Server returned 304 Not Modified.
    if (res.status === 304) {
      return {
        changed: false,
        etag: lastEtag || null,
        lastModified: lastModified || null,
        contentHash: lastContentHash || null,
      };
    }

    if (!res.ok) {
      // If error status, mark as changed so full scraper can handle it.
      return {
        changed: true,
        etag: null,
        lastModified: null,
        contentHash: null,
      };
    }

    const newEtag = res.headers.get('etag');
    const newLastModified = res.headers.get('last-modified');
    const rawHtml = await res.text();

    // Step 2: Check sitemap.xml if response has no cache headers.
    if (!newEtag && !newLastModified) {
      try {
        const origin = new URL(websiteUrl).origin;
        const sitemapRes = await fetch(`${origin}/sitemap.xml`, {
          method: 'HEAD',
          headers: { 'User-Agent': headers['User-Agent'] },
        });
        const sitemapLastMod = sitemapRes.headers.get('last-modified');
        if (sitemapLastMod && lastModified && sitemapLastMod === lastModified) {
          return {
            changed: false,
            etag: null,
            lastModified: sitemapLastMod,
            contentHash: lastContentHash || null,
          };
        }
      } catch {
        // Ignore sitemap error.
      }
    }

    // Step 3: Fast SHA-256 hash comparison of raw HTML.
    const currentHash = hashText(rawHtml);
    const isSameHash = Boolean(lastContentHash && currentHash === lastContentHash);

    return {
      changed: !isSameHash,
      etag: newEtag,
      lastModified: newLastModified,
      contentHash: currentHash,
    };
  } catch {
    // If request fails, trigger full scrape run to log error.
    return {
      changed: true,
      etag: null,
      lastModified: null,
      contentHash: null,
    };
  }
}

