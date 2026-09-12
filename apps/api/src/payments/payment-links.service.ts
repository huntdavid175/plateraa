import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  and,
  asc,
  eq,
  isNull,
  lt,
  moolreAccounts,
  or,
  orders,
  paymentLinks,
  payments,
  providerEvents,
  sql,
  tenantSettings,
  tenants,
  withPlatform,
  withTenant,
  type Tx,
} from '@plateraa/db';
import { amountDue, sub, type Pesewas } from '@plateraa/shared';
import { ulid } from 'ulid';
import { recordAudit } from '../audit/audit';
import { ENV, type Env } from '../config/env';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { addToAmountPaid, startPrepIfPaid } from '../sync/handlers/money';
import type { HandlerContext, TenantInfo } from '../sync/sync.types';
import {
  MOOLRE,
  MOOLRE_CALLBACK_IPS,
  MoolreError,
  linkMessage,
  type MoolreAccount,
  type MoolreApi,
} from './moolre';
import { openSecret } from './secrets';

/** Tries at making and texting a link before it's marked as failed. */
const MAX_ATTEMPTS = 5;
/** A link being worked on is left alone by anyone else for this long. */
const CLAIM_MS = 2 * 60_000;
/** An open link is checked with Moolre this often, in case its callback never arrives. */
const CHECK_EVERY_MS = 3 * 60_000;
/** Moolre may confirm a payment a little after the link itself has expired. */
const EXPIRY_GRACE_MS = 10 * 60_000;
const TICK_MS = 60_000;

type Outcome = 'PAID' | 'PENDING' | 'FAILED' | 'EXPIRED' | 'UNKNOWN';

/**
 * What a Moolre refusal means for the counter, in words, with Moolre's own code so the cause can
 * be looked up. `stage`: whether making the link or texting it failed.
 */
export function failureWords(error: unknown, stage: 'link' | 'text' = 'link'): string {
  if (!(error instanceof MoolreError)) return "The link couldn't be made. Send it again.";
  const detail = `(Moolre ${error.code}: ${error.message.replace(/\.+$/, '')})`.slice(0, 120);
  switch (error.code) {
    case 'NOT_CONNECTED':
      return "This business hasn't connected its Moolre account yet.";
    case 'NOT_SET_UP':
    case 'SMS_NOT_SET_UP':
      return "Payment links aren't set up on the server yet.";
    case 'ASMS07':
      return "The text couldn't go: the sender name isn't approved by Moolre yet.";
    case 'INP02':
      return 'Moolre already has this link. Send a new one.';
    case 'UNREACHABLE':
      return "Moolre couldn't be reached. Send the link again.";
    default:
      if (error.code.startsWith('AIN')) {
        return stage === 'text'
          ? `Moolre didn't accept Plateraa's SMS key ${detail}.`
          : `Moolre didn't accept this business's account details ${detail}.`;
      }
      return `Moolre said: ${error.message}`.slice(0, 160);
  }
}

async function tenantInfo(tx: Tx, tenantId: string): Promise<TenantInfo> {
  const [row] = await tx
    .select({
      timezone: tenants.timezone,
      requirePaymentBeforePrep: tenantSettings.requirePaymentBeforePrep,
    })
    .from(tenants)
    .leftJoin(tenantSettings, eq(tenantSettings.tenantId, tenants.id));
  return {
    id: tenantId,
    timezone: row?.timezone ?? 'Africa/Accra',
    requirePaymentBeforePrep: row?.requirePaymentBeforePrep ?? true,
  };
}

/**
 * Payment links after the tablet asks for one (plan.md §2.5): make the link in the vendor's own
 * Moolre account, text it, and record the money once Moolre confirms it. Callbacks are only a
 * nudge: the money counts once Moolre's status check says it's paid. Open links are also checked
 * every few minutes, in case a callback never comes.
 */
@Injectable()
export class PaymentLinks implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PaymentLinks.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private readonly pending = new Set<Promise<unknown>>();

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(ENV) private readonly env: Env,
    @Inject(MOOLRE) private readonly moolre: MoolreApi,
  ) {}

  onApplicationBootstrap() {
    if (!this.env.RUN_PAYMENT_LINKS) return;
    this.timer = setInterval(() => this.sendSoon(), TICK_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Sends what's queued and checks what's open, soon, and never twice at once. */
  sendSoon(): void {
    if (!this.env.RUN_PAYMENT_LINKS) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = this.work()
      .catch((error: unknown) => this.logger.error('Payment link work failed', error as Error))
      .finally(() => {
        this.running = null;
        if (this.again) {
          this.again = false;
          this.sendSoon();
        }
      });
  }

  /** Waits for anything started in the background (tests). */
  async settle(): Promise<void> {
    while (this.running || this.pending.size) {
      await Promise.allSettled([this.running, ...this.pending]);
    }
  }

  async work(): Promise<void> {
    await this.sendQueued();
    await this.checkOpen();
  }

  private get db() {
    return this.database.db;
  }

  private callbackUrl() {
    return `${this.env.BETTER_AUTH_URL}/api/payments/moolre/callback`;
  }

  private credentials(account: typeof moolreAccounts.$inferSelect | undefined): MoolreAccount {
    if (!account) {
      throw new MoolreError('NOT_CONNECTED', 'No Moolre account for this business', false);
    }
    if (!this.env.SECRETS_KEY) {
      throw new MoolreError('NOT_SET_UP', 'SECRETS_KEY is not set on the server', false);
    }
    return {
      apiUser: account.apiUser,
      publicKey: openSecret(account.publicKey, this.env.SECRETS_KEY),
      accountNumber: account.accountNumber,
      email: account.email,
    };
  }

  private async sendQueued(): Promise<void> {
    const queued = await withPlatform(this.db, (tx) =>
      tx
        .select({ id: paymentLinks.id, tenantId: paymentLinks.tenantId })
        .from(paymentLinks)
        .where(
          and(
            eq(paymentLinks.status, 'QUEUED'),
            or(
              isNull(paymentLinks.checkedAt),
              lt(paymentLinks.checkedAt, new Date(Date.now() - CLAIM_MS)),
            ),
          ),
        )
        .orderBy(asc(paymentLinks.createdAt))
        .limit(20),
    );
    for (const link of queued) await this.send(link.tenantId, link.id);
  }

  /** Makes the link (once) and texts it. Claimed first, so two servers never text it twice. */
  async send(tenantId: string, linkId: string): Promise<void> {
    const claimed = await withTenant(this.db, tenantId, async (tx) => {
      const [link] = await tx
        .update(paymentLinks)
        .set({ attempts: sql`${paymentLinks.attempts} + 1`, checkedAt: new Date() })
        .where(
          and(
            eq(paymentLinks.id, linkId),
            eq(paymentLinks.status, 'QUEUED'),
            or(
              isNull(paymentLinks.checkedAt),
              lt(paymentLinks.checkedAt, new Date(Date.now() - CLAIM_MS)),
            ),
          ),
        )
        .returning();
      if (!link) return null;
      const [order] = await tx.select().from(orders).where(eq(orders.id, link.orderId));
      const [business] = await tx.select({ name: tenants.name }).from(tenants);
      const [account] = await tx.select().from(moolreAccounts);
      return { link, order: order!, business: business!, account };
    });
    if (!claimed) return;
    const { link, order, business, account } = claimed;

    const fail = (failure: string) =>
      withTenant(this.db, tenantId, (tx) =>
        tx
          .update(paymentLinks)
          .set({ status: 'FAILED', failure })
          .where(and(eq(paymentLinks.id, link.id), eq(paymentLinks.status, 'QUEUED'))),
      );

    if (
      order.status === 'CANCELLED' ||
      order.status === 'REFUNDED' ||
      sub(amountDue(order), order.amountPaid) <= 0
    ) {
      await fail('The order was paid or cancelled before the link went out.');
      return;
    }

    let stage: 'link' | 'text' = 'link';
    try {
      const credentials = this.credentials(account);
      let url = link.url;
      if (!url) {
        const created = await this.moolre.createLink(credentials, {
          reference: link.id,
          amount: link.amount,
          callbackUrl: this.callbackUrl(),
          expiresInMinutes: this.env.PAYMENT_LINK_MINUTES,
        });
        url = created.url;
        // Kept at once: if the text fails and is tried again, the same link is sent.
        await withTenant(this.db, tenantId, (tx) =>
          tx
            .update(paymentLinks)
            .set({ url, providerReference: created.reference })
            .where(eq(paymentLinks.id, link.id)),
        );
      }
      stage = 'text';
      await this.moolre.sendSms({
        phone: link.phone,
        message: linkMessage(business.name, order.displayNumber, link.amount, url),
        ref: link.id,
      });
      const sentAt = new Date();
      await withTenant(this.db, tenantId, (tx) =>
        tx
          .update(paymentLinks)
          .set({
            status: 'SENT',
            failure: null,
            sentAt,
            expiresAt: new Date(sentAt.getTime() + this.env.PAYMENT_LINK_MINUTES * 60_000),
          })
          .where(and(eq(paymentLinks.id, link.id), eq(paymentLinks.status, 'QUEUED'))),
      );
    } catch (error) {
      // A temporary problem: the claim lapses and a later round tries again, same reference.
      if (error instanceof MoolreError && error.retryable && link.attempts < MAX_ATTEMPTS) return;
      if (error instanceof MoolreError) {
        this.logger.warn(
          `Payment link ${link.id}: ${stage} failed, ${error.code} ${error.message}`,
        );
      } else {
        this.logger.error(`Payment link ${link.id} failed`, error as Error);
      }
      await fail(failureWords(error, stage));
    }
  }

  private async checkOpen(): Promise<void> {
    const open = await withPlatform(this.db, (tx) =>
      tx
        .select({ id: paymentLinks.id, tenantId: paymentLinks.tenantId })
        .from(paymentLinks)
        .where(
          and(
            eq(paymentLinks.status, 'SENT'),
            or(
              isNull(paymentLinks.checkedAt),
              lt(paymentLinks.checkedAt, new Date(Date.now() - CHECK_EVERY_MS)),
            ),
          ),
        )
        .limit(50),
    );
    for (const link of open) await this.verify(link.tenantId, link.id);
  }

  /** Asks Moolre whether the link was paid, and records the money if it was. */
  async verify(tenantId: string, linkId: string): Promise<Outcome> {
    const { link, account } = await withTenant(this.db, tenantId, async (tx) => {
      const [found] = await tx
        .update(paymentLinks)
        .set({ checkedAt: new Date() })
        .where(eq(paymentLinks.id, linkId))
        .returning();
      const [moolre] = await tx.select().from(moolreAccounts);
      return { link: found, account: moolre };
    });
    if (!link) return 'UNKNOWN';
    if (link.status === 'PAID') return 'PAID';

    let status;
    try {
      status = await this.moolre.paymentStatus(this.credentials(account), link.id);
    } catch (error) {
      this.logger.warn(`Couldn't check payment link ${link.id}: ${(error as Error).message}`);
      return 'UNKNOWN';
    }
    if (status?.state === 'PAID') {
      await this.confirm(tenantId, link.id, status.amount ?? link.amount, status.transactionId);
      return 'PAID';
    }
    if (
      link.status === 'SENT' &&
      link.expiresAt &&
      Date.now() > link.expiresAt.getTime() + EXPIRY_GRACE_MS
    ) {
      await withTenant(this.db, tenantId, (tx) =>
        tx
          .update(paymentLinks)
          .set({ status: 'EXPIRED', failure: 'Not paid in time. Send a new link.' })
          .where(and(eq(paymentLinks.id, link.id), eq(paymentLinks.status, 'SENT'))),
      );
      return 'EXPIRED';
    }
    return status?.state ?? 'PENDING';
  }

  /**
   * Records the money once Moolre confirms it. The order is paid, and with pay before prep it
   * goes to the kitchen. Safe to call twice: a paid link is left alone.
   */
  async confirm(
    tenantId: string,
    linkId: string,
    amount: Pesewas,
    transactionId: string | null,
  ): Promise<void> {
    await withTenant(this.db, tenantId, async (tx) => {
      const [link] = await tx
        .select()
        .from(paymentLinks)
        .where(eq(paymentLinks.id, linkId))
        .for('update');
      if (!link || link.status === 'PAID') return;
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, link.orderId))
        .for('update');
      if (!order) return;

      const now = new Date();
      const paymentId = ulid();
      const ctx: HandlerContext = {
        tx,
        tenant: await tenantInfo(tx, tenantId),
        device: {
          id: (link.deviceId ?? order.deviceId)!,
          tenantId,
          locationId: order.locationId,
          code: '',
        },
        staff: { staffId: link.requestedBy, role: 'STAFF', capabilities: new Set() },
        command: { deviceTs: now.toISOString() },
      };

      await tx.insert(payments).values({
        id: paymentId,
        tenantId,
        orderId: order.id,
        method: 'LINK',
        status: 'CONFIRMED',
        amount,
        collectedBy: link.requestedBy,
        deviceId: link.deviceId,
        createdAtDevice: now,
      });
      const amountPaid = await addToAmountPaid(ctx, order.id, amount);
      await startPrepIfPaid(ctx, order, amountPaid);
      await tx
        .update(paymentLinks)
        .set({ status: 'PAID', paidAt: now, paymentId, failure: null })
        .where(eq(paymentLinks.id, link.id));
      await recordAudit(tx, {
        tenantId,
        actorPlatform: 'moolre',
        action: 'payment.recorded',
        entityType: 'payment',
        entityId: paymentId,
        after: { orderId: order.id, method: 'LINK', amount, linkId: link.id, transactionId },
      });
    });
  }

  /** Stores a Moolre callback exactly as it came, before anything acts on it. */
  async record(payload: unknown, sourceIp: string | null) {
    const data = (payload as { data?: { externalref?: unknown } } | null)?.data;
    const reference = typeof data?.externalref === 'string' ? data.externalref : null;
    const [link] = reference
      ? await withPlatform(this.db, (tx) =>
          tx
            .select({ id: paymentLinks.id, tenantId: paymentLinks.tenantId })
            .from(paymentLinks)
            .where(eq(paymentLinks.id, reference)),
        )
      : [];
    const eventId = ulid();
    await withPlatform(this.db, (tx) =>
      tx.insert(providerEvents).values({
        id: eventId,
        tenantId: link?.tenantId ?? null,
        provider: 'MOOLRE',
        reference,
        sourceIp,
        payload: payload ?? {},
      }),
    );
    if (sourceIp && !MOOLRE_CALLBACK_IPS.has(sourceIp)) {
      this.logger.warn(`Moolre callback from an unexpected address: ${sourceIp}`);
    }
    return { eventId, link: link ?? null };
  }

  /** Checks the payment a callback mentions with Moolre, in the background. */
  process(event: { eventId: string; link: { id: string; tenantId: string } | null }): void {
    const work = (async () => {
      const outcome = event.link
        ? await this.verify(event.link.tenantId, event.link.id)
        : 'UNKNOWN';
      await withPlatform(this.db, (tx) =>
        tx
          .update(providerEvents)
          .set({ processedAt: new Date(), outcome: event.link ? outcome : 'UNKNOWN_REFERENCE' })
          .where(eq(providerEvents.id, event.eventId)),
      );
    })().catch((error: unknown) =>
      this.logger.error(`Moolre callback ${event.eventId} failed`, error as Error),
    );
    this.pending.add(work);
    void work.finally(() => this.pending.delete(work));
  }
}
