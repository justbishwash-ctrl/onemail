/**
 * RFC 2822 / MIME message builder for the Gmail API.
 * Produces base64url-encoded raw message strings.
 *
 * Supports:
 * - multipart/alternative (HTML + plain text)
 * - multipart/mixed (with attachments)
 * - Inline tracking pixel
 * - In-Reply-To / References headers for threading
 * - CC / BCC
 * - UTF-8 encoded subjects (RFC 2047)
 */

import type { GmailSendRequest } from '../../types/gmail.ts';

const BOUNDARY_PREFIX = '==Onemail==';

function generateBoundary(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${BOUNDARY_PREFIX}${rand}`;
}

function encodeHeaderValue(value: string): string {
  // RFC 2047 encoded-word for non-ASCII
  const hasNonAscii = /[^\x00-\x7F]/.test(value);
  if (!hasNonAscii) return value;
  const b64 = btoa(unescape(encodeURIComponent(value)));
  return `=?UTF-8?B?${b64}?=`;
}

function toBase64Url(input: string | Uint8Array): string {
  let bytes: Uint8Array;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = input;
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function buildMimeMessage(
  req: GmailSendRequest,
  trackingPixelUrl?: string
): Promise<string> {
  const lines: string[] = [];
  const mixedBoundary = generateBoundary();

  // ── Headers ────────────────────────────────────────────
  lines.push(`To: ${req.to.join(', ')}`);
  if (req.cc?.length) lines.push(`Cc: ${req.cc.join(', ')}`);
  if (req.bcc?.length) lines.push(`Bcc: ${req.bcc.join(', ')}`);
  lines.push(`Subject: ${encodeHeaderValue(req.subject)}`);
  lines.push('MIME-Version: 1.0');
  lines.push(`Content-Type: multipart/mixed; boundary=${mixedBoundary}`);

  if (req.inReplyTo) lines.push(`In-Reply-To: ${req.inReplyTo}`);
  if (req.references) lines.push(`References: ${req.references}`);

  lines.push('');

  // Inject tracking pixel into HTML body
  let htmlBody = req.htmlBody;
  if (trackingPixelUrl) {
    htmlBody += `\n<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:block;border:0" />`;
  }

  const altBoundary = generateBoundary();

  // ── multipart/mixed ────────────────────────────────────
  lines.push(`--${mixedBoundary}`);
  lines.push(`Content-Type: multipart/alternative; boundary=${altBoundary}`);
  lines.push('');

  // Plain text part
  const plainText = req.plainBody ?? htmlToPlainText(htmlBody);
  lines.push(`--${altBoundary}`);
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: quoted-printable');
  lines.push('');
  lines.push(toQuotedPrintable(plainText));
  lines.push('');

  // HTML part
  lines.push(`--${altBoundary}`);
  lines.push('Content-Type: text/html; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: quoted-printable');
  lines.push('');
  lines.push(toQuotedPrintable(htmlBody));
  lines.push('');
  lines.push(`--${altBoundary}--`);
  lines.push('');

  // ── Attachments ────────────────────────────────────────
  if (req.attachments?.length) {
    for (const att of req.attachments) {
      lines.push(`--${mixedBoundary}`);
      lines.push(`Content-Type: ${att.mimeType}; name="${encodeHeaderValue(att.filename)}"`);
      lines.push('Content-Transfer-Encoding: base64');
      lines.push(`Content-Disposition: attachment; filename="${encodeHeaderValue(att.filename)}"`);
      lines.push('');
      // Split base64 into 76-char lines (RFC 2045)
      const b64 = att.data.replace(/[^A-Za-z0-9+/=]/g, '');
      lines.push(b64.match(/.{1,76}/g)?.join('\n') ?? b64);
      lines.push('');
    }
  }

  lines.push(`--${mixedBoundary}--`);

  return toBase64Url(lines.join('\r\n'));
}

/**
 * Minimal quoted-printable encoder.
 * Encodes non-ASCII and special chars per RFC 2045.
 */
function toQuotedPrintable(input: string): string {
  const lines: string[] = [];
  const raw = input.split('\n');

  for (const line of raw) {
    let encoded = '';
    for (const char of line) {
      const code = char.charCodeAt(0);
      if (
        (code >= 33 && code <= 126 && char !== '=') ||
        char === ' ' ||
        char === '\t'
      ) {
        encoded += char;
      } else {
        encoded += `=${code.toString(16).toUpperCase().padStart(2, '0')}`;
      }
    }
    // Soft line breaks at 76 chars
    while (encoded.length > 76) {
      lines.push(encoded.slice(0, 75) + '=');
      encoded = encoded.slice(75);
    }
    lines.push(encoded);
  }

  return lines.join('\r\n');
}

/**
 * Minimal HTML to plain text converter.
 * Used as fallback when no plain text is provided.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
