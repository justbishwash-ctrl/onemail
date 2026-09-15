import { randomUrlSafe, sha256Hex } from '../../utils/crypto.ts';
import {
  createTrackedEmail,
  recordEmailOpen,
  getTrackedEmailByTrackingId,
  getTrackingStats,
} from '../../db/queries.ts';
import type { Env } from '../../types/env.ts';

export function generateTrackingId(): string {
  return randomUrlSafe(16);
}

export function buildTrackingPixelUrl(workerUrl: string, trackingId: string): string {
  return `${workerUrl}/t/${trackingId}.png`;
}

export async function registerTrackedEmail(
  env: Env,
  data: {
    userId: string;
    linkedAccountId: string;
    gmailMessageId: string;
    recipientEmail: string;
    subject: string;
  }
): Promise<string> {
  const trackingId = generateTrackingId();
  const recipientHash = await sha256Hex(data.recipientEmail.toLowerCase().trim());
  const subjectPreview = data.subject.slice(0, 100);

  await createTrackedEmail(env.DB, {
    userId: data.userId,
    linkedAccountId: data.linkedAccountId,
    gmailMessageId: data.gmailMessageId,
    trackingId,
    recipientHash,
    subjectPreview,
  });

  return trackingId;
}

export async function processTrackingOpen(
  env: Env,
  trackingId: string,
  request: Request
): Promise<void> {
  // Verify the tracking ID exists before recording
  const tracked = await getTrackedEmailByTrackingId(env.DB, trackingId);
  if (!tracked) return; // silently ignore invalid IDs

  const userAgent = request.headers.get('User-Agent') ?? undefined;
  const cfConnectingIp = request.headers.get('CF-Connecting-IP') ?? '';
  const countryCode = request.headers.get('CF-IPCountry') ?? undefined;

  // Hash IP — never store raw
  const ipHash = cfConnectingIp ? await sha256Hex(cfConnectingIp) : undefined;

  await recordEmailOpen(env.DB, {
    trackingId,
    userAgent,
    ipHash,
    countryCode,
  });
}

export async function getEmailTrackingStatus(
  env: Env,
  trackingId: string
) {
  const tracked = await getTrackedEmailByTrackingId(env.DB, trackingId);
  if (!tracked) return null;

  const stats = await getTrackingStats(env.DB, trackingId);

  return {
    trackingId,
    gmailMessageId: tracked.gmail_message_id,
    subjectPreview: tracked.subject_preview,
    createdAt: tracked.created_at,
    totalOpens: stats.totalOpens,
    firstOpenedAt: stats.firstOpenedAt,
    lastOpenedAt: stats.lastOpenedAt,
    isOpened: stats.totalOpens > 0,
  };
}
