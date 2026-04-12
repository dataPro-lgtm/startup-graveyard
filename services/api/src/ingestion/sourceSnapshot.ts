import { createHash } from 'node:crypto';

const MAX_TEXT_LENGTH = 20_000;
const MAX_EXCERPT_LENGTH = 480;

function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const raw = match?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
  return raw ? clip(raw, 800) : null;
}

function normalizeCompanyName(title: string | null, fallbackUrl: string): string {
  const cleanedTitle =
    title
      ?.split(/[-—–:·|]/)
      .map((part) => part.trim())
      .find(Boolean) ?? '';
  if (cleanedTitle) return clip(cleanedTitle, 200);

  try {
    const host = new URL(fallbackUrl).hostname.replace(/^www\./i, '');
    return clip(host, 200);
  } catch {
    return 'Untitled Source';
  }
}

function publisherFromUrl(urlInput: string): string | null {
  try {
    return new URL(urlInput).hostname.replace(/^www\./i, '') || null;
  } catch {
    return null;
  }
}

export type CapturedSourceSnapshot = {
  sourceUrl: string;
  finalUrl: string;
  httpStatus: number;
  contentType: string | null;
  title: string | null;
  companyName: string;
  publisher: string | null;
  snapshotText: string;
  excerpt: string | null;
  contentSha256: string;
  metadata: Record<string, unknown>;
};

export async function captureSourceSnapshot(
  urlInput: string,
): Promise<{ ok: true; snapshot: CapturedSourceSnapshot } | { ok: false; error: string }> {
  try {
    const url = new URL(urlInput.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, error: '仅支持 http/https' };
    }

    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'StartupGraveyardIngestion/1.0',
        accept: 'text/html,text/plain;q=0.9,*/*;q=0.5',
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const finalUrl = res.url || url.toString();
    const contentType = res.headers.get('content-type');
    const isHtml = (contentType ?? '').toLowerCase().includes('html');
    const rawBody = await res.text();
    const title = isHtml ? extractTitle(rawBody) : null;
    const normalizedText = clip(
      isHtml ? stripHtml(rawBody) : rawBody.replace(/\s+/g, ' ').trim(),
      MAX_TEXT_LENGTH,
    );
    const excerpt = normalizedText ? clip(normalizedText, MAX_EXCERPT_LENGTH) : null;
    const contentSha256 = createHash('sha256').update(normalizedText).digest('hex');

    return {
      ok: true,
      snapshot: {
        sourceUrl: url.toString(),
        finalUrl,
        httpStatus: res.status,
        contentType,
        title,
        companyName: normalizeCompanyName(title, finalUrl),
        publisher: publisherFromUrl(finalUrl),
        snapshotText: normalizedText,
        excerpt,
        contentSha256,
        metadata: {
          byteLength: Buffer.byteLength(rawBody, 'utf8'),
          textLength: normalizedText.length,
          titleDetected: Boolean(title),
        },
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}
