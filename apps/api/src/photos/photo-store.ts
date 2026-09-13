import { ServiceUnavailableException } from '@nestjs/common';
import { AwsClient } from 'aws4fetch';
import type { Env } from '../config/env';

export const PHOTO_STORE = Symbol('PHOTO_STORE');

/** What the dashboard sends: a picture it has already made small (see app.setup.ts). */
export const PHOTO_TYPES = ['image/webp', 'image/jpeg', 'image/png'];

/** Where menu and store photos are kept (Cloudflare R2), behind an interface so tests can swap it. */
export interface PhotoStore {
  /** Whether photos can be kept at all: the R2 settings are there. */
  readonly ready: boolean;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** The public address of a kept photo. */
  urlOf(key: string): string;
}

type R2Settings = Pick<
  Env,
  'R2_ACCOUNT_ID' | 'R2_ACCESS_KEY_ID' | 'R2_SECRET_ACCESS_KEY' | 'R2_BUCKET' | 'R2_PUBLIC_URL'
>;

/** What an R2 refusal means, in words, so a wrong setting is easy to find. */
function refusal(status: number): string {
  if (status === 401 || status === 403) {
    return `Photo storage refused the key (${status}): check R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY, and that the token covers this bucket`;
  }
  if (status === 404)
    return 'Photo storage has no such bucket (404): check R2_BUCKET and R2_ACCOUNT_ID';
  return `Photo storage didn't take the photo (${status})`;
}

/**
 * Cloudflare R2, through its S3 interface. Requests are signed with the bucket-only token from
 * the settings; photos are served to customers from the bucket's public address, which costs
 * nothing per download.
 */
export class R2PhotoStore implements PhotoStore {
  private readonly client: AwsClient | null;
  private readonly bucketUrl: string;

  constructor(private readonly settings: R2Settings) {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL } = settings;
    this.client =
      R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_URL
        ? new AwsClient({
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
            service: 's3',
            region: 'auto',
          })
        : null;
    this.bucketUrl = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${settings.R2_BUCKET}`;
  }

  get ready() {
    return this.client !== null;
  }

  private get signer() {
    if (!this.client)
      throw new ServiceUnavailableException("Photos aren't set up on the server yet");
    return this.client;
  }

  async put(key: string, bytes: Uint8Array, contentType: string) {
    const response = await this.signer.fetch(`${this.bucketUrl}/${key}`, {
      method: 'PUT',
      body: bytes,
      // Each photo has its own name, so browsers may keep it for good.
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
    if (!response.ok) throw new Error(refusal(response.status));
  }

  async remove(key: string) {
    const response = await this.signer.fetch(`${this.bucketUrl}/${key}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) throw new Error(refusal(response.status));
  }

  urlOf(key: string) {
    return `${this.settings.R2_PUBLIC_URL ?? ''}/${key}`;
  }
}
