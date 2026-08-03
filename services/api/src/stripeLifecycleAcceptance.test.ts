import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './buildApp.js';
import { handleStripeWebhookEvent } from './routes/public/payments.js';

const PRO_PRICE_ID = 'price_pro_lifecycle';
const TEAM_PRICE_ID = 'price_team_lifecycle';
const WEBHOOK_SECRET = 'whsec_lifecycle_test_secret';

function stripeEvent(id: string, type: Stripe.Event.Type, object: object): Stripe.Event {
  return {
    id,
    object: 'event',
    api_version: '2026-03-25.basil',
    created: Math.floor(Date.now() / 1000),
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
  } as Stripe.Event;
}

function subscription(input: {
  id?: string;
  userId: string;
  status: Stripe.Subscription.Status;
  priceId?: string;
  metadataPlan?: 'pro' | 'team';
  cancelAtPeriodEnd?: boolean;
  interval?: 'month' | 'year';
}): Stripe.Subscription {
  return {
    id: input.id ?? 'sub_lifecycle',
    customer: 'cus_lifecycle',
    metadata: {
      userId: input.userId,
      plan: input.metadataPlan ?? 'pro',
      source: 'account_page',
    },
    status: input.status,
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    items: {
      data: [
        {
          price: {
            id: input.priceId ?? PRO_PRICE_ID,
            recurring: { interval: input.interval ?? 'month' },
          },
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

describe('Stripe subscription lifecycle acceptance (synthetic events)', () => {
  let app: FastifyInstance;
  let userId: string;

  beforeEach(async () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';
    process.env.RATE_LIMIT_ENABLED = 'false';
    process.env.STRIPE_SECRET_KEY = 'sk_test_lifecycle_key';
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.STRIPE_PRO_PRICE_ID = PRO_PRICE_ID;
    process.env.STRIPE_TEAM_PRICE_ID = TEAM_PRICE_ID;
    app = await buildApp({ logger: false });
    const registered = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `stripe-lifecycle-${Date.now()}@example.com`,
        password: 'password123',
      },
    });
    userId = (registered.json() as { user: { id: string } }).user.id;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_PRO_PRICE_ID;
    delete process.env.STRIPE_TEAM_PRICE_ID;
  });

  it('walks checkout, upgrade, downgrade, past-due, recovery, pending-cancel, and deletion', async () => {
    const stripe = {
      subscriptions: {
        retrieve: vi
          .fn()
          .mockResolvedValue(subscription({ userId, status: 'active', priceId: PRO_PRICE_ID })),
      },
    } as unknown as Stripe;

    // 1. Checkout completes on Pro.
    await handleStripeWebhookEvent(
      app,
      stripe,
      stripeEvent('evt_lc_checkout', 'checkout.session.completed', {
        id: 'cs_lifecycle',
        client_reference_id: userId,
        metadata: { userId, plan: 'pro', source: 'account_page' },
        customer: 'cus_lifecycle',
        subscription: 'sub_lifecycle',
      }),
    );
    expect(await app.usersRepo.getBillingAccount(userId)).toMatchObject({
      subscription: 'pro',
      billingStatus: 'active',
      billingInterval: 'month',
      stripeCustomerId: 'cus_lifecycle',
      entitlements: expect.objectContaining({
        canExportReports: true,
        canUseTeamWorkspace: false,
      }),
    });

    // 2. Upgrade to Team (price id changes).
    await handleStripeWebhookEvent(
      app,
      {} as Stripe,
      stripeEvent(
        'evt_lc_upgrade',
        'customer.subscription.updated',
        subscription({ userId, status: 'active', priceId: TEAM_PRICE_ID }),
      ),
    );
    expect(await app.usersRepo.getBillingAccount(userId)).toMatchObject({
      subscription: 'team',
      billingStatus: 'active',
      entitlements: expect.objectContaining({ canUseTeamWorkspace: true }),
    });

    // 3. Downgrade back to Pro.
    await handleStripeWebhookEvent(
      app,
      {} as Stripe,
      stripeEvent(
        'evt_lc_downgrade',
        'customer.subscription.updated',
        subscription({ userId, status: 'active', priceId: PRO_PRICE_ID }),
      ),
    );
    expect(await app.usersRepo.getBillingAccount(userId)).toMatchObject({
      subscription: 'pro',
      entitlements: expect.objectContaining({ canUseTeamWorkspace: false }),
    });

    // 4. Payment failure drives past-due; paid entitlements survive the grace window.
    await handleStripeWebhookEvent(
      app,
      {} as Stripe,
      stripeEvent(
        'evt_lc_past_due',
        'customer.subscription.updated',
        subscription({ userId, status: 'past_due', priceId: PRO_PRICE_ID }),
      ),
    );
    expect(await app.usersRepo.getBillingAccount(userId)).toMatchObject({
      subscription: 'pro',
      billingStatus: 'past_due',
      entitlements: expect.objectContaining({ canExportReports: true }),
    });

    // 5. Recovery emits exactly one funnel event.
    await handleStripeWebhookEvent(
      app,
      {} as Stripe,
      stripeEvent(
        'evt_lc_recovered',
        'customer.subscription.updated',
        subscription({ userId, status: 'active', priceId: PRO_PRICE_ID }),
      ),
    );
    expect(await app.billingFunnelRepo.getAdminMetrics()).toMatchObject({
      recoveredSubscriptions: 1,
    });

    // 6. User schedules cancellation at period end; access is retained meanwhile.
    await handleStripeWebhookEvent(
      app,
      {} as Stripe,
      stripeEvent(
        'evt_lc_pending_cancel',
        'customer.subscription.updated',
        subscription({ userId, status: 'active', priceId: PRO_PRICE_ID, cancelAtPeriodEnd: true }),
      ),
    );
    expect(await app.usersRepo.getBillingAccount(userId)).toMatchObject({
      subscription: 'pro',
      billingStatus: 'active',
      cancelAtPeriodEnd: true,
      entitlements: expect.objectContaining({ canExportReports: true }),
    });

    // 7. Resuming before period end counts as a second recovery.
    await handleStripeWebhookEvent(
      app,
      {} as Stripe,
      stripeEvent(
        'evt_lc_resumed',
        'customer.subscription.updated',
        subscription({ userId, status: 'active', priceId: PRO_PRICE_ID, cancelAtPeriodEnd: false }),
      ),
    );
    expect(await app.usersRepo.getBillingAccount(userId)).toMatchObject({
      cancelAtPeriodEnd: false,
    });
    expect(await app.billingFunnelRepo.getAdminMetrics()).toMatchObject({
      recoveredSubscriptions: 2,
    });

    // 8. Final deletion lands on free/canceled with paid entitlements revoked.
    await handleStripeWebhookEvent(
      app,
      {} as Stripe,
      stripeEvent(
        'evt_lc_deleted',
        'customer.subscription.deleted',
        subscription({ userId, status: 'canceled', priceId: PRO_PRICE_ID }),
      ),
    );
    expect(await app.usersRepo.getBillingAccount(userId)).toMatchObject({
      subscription: 'free',
      billingStatus: 'canceled',
      stripeSubscriptionId: null,
      entitlements: expect.objectContaining({
        canExportReports: false,
        canUseWatchlist: false,
      }),
    });
  });

  it('trusts the active price id over stale plan metadata', async () => {
    await handleStripeWebhookEvent(
      app,
      {} as Stripe,
      stripeEvent(
        'evt_lc_metadata_conflict',
        'customer.subscription.updated',
        subscription({
          userId,
          status: 'active',
          priceId: PRO_PRICE_ID,
          metadataPlan: 'team',
        }),
      ),
    );
    expect(await app.usersRepo.getBillingAccount(userId)).toMatchObject({
      subscription: 'pro',
    });
  });

  it('maps yearly billing intervals from the subscription price', async () => {
    await handleStripeWebhookEvent(
      app,
      {} as Stripe,
      stripeEvent(
        'evt_lc_yearly',
        'customer.subscription.updated',
        subscription({ userId, status: 'active', priceId: PRO_PRICE_ID, interval: 'year' }),
      ),
    );
    expect(await app.usersRepo.getBillingAccount(userId)).toMatchObject({
      subscription: 'pro',
      billingInterval: 'year',
    });
  });

  describe('HTTP webhook endpoint with real signature verification', () => {
    function signedHeaders(payload: string): { 'stripe-signature': string } {
      const stripe = new Stripe('sk_test_lifecycle_key');
      return {
        'stripe-signature': stripe.webhooks.generateTestHeaderString({
          payload,
          secret: WEBHOOK_SECRET,
        }),
      };
    }

    it('accepts a signed subscription event, applies it, and flags replays as duplicates', async () => {
      const payload = JSON.stringify(
        stripeEvent(
          'evt_lc_http',
          'customer.subscription.updated',
          subscription({ userId, status: 'past_due', priceId: PRO_PRICE_ID }),
        ),
      );

      const first = await app.inject({
        method: 'POST',
        url: '/v1/payments/webhook',
        headers: { 'content-type': 'application/json', ...signedHeaders(payload) },
        payload,
      });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ received: true, duplicate: false });
      expect(await app.usersRepo.getBillingAccount(userId)).toMatchObject({
        subscription: 'pro',
        billingStatus: 'past_due',
      });

      // Stripe redelivery of the same event id must be acknowledged but not reapplied.
      const replay = await app.inject({
        method: 'POST',
        url: '/v1/payments/webhook',
        headers: { 'content-type': 'application/json', ...signedHeaders(payload) },
        payload,
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.json()).toMatchObject({ received: true, duplicate: true, attemptCount: 1 });
    });

    it('rejects missing, invalid, and tampered signatures', async () => {
      const payload = JSON.stringify(
        stripeEvent(
          'evt_lc_bad_sig',
          'customer.subscription.updated',
          subscription({ userId, status: 'active', priceId: TEAM_PRICE_ID }),
        ),
      );

      const missing = await app.inject({
        method: 'POST',
        url: '/v1/payments/webhook',
        headers: { 'content-type': 'application/json' },
        payload,
      });
      expect(missing.statusCode).toBe(400);
      expect(missing.json()).toMatchObject({ error: 'missing_stripe_signature' });

      const invalid = await app.inject({
        method: 'POST',
        url: '/v1/payments/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 't=1,v1=deadbeef',
        },
        payload,
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({ error: 'webhook_verification_failed' });

      // Valid signature over a different body must not authorize a tampered payload.
      const tampered = await app.inject({
        method: 'POST',
        url: '/v1/payments/webhook',
        headers: { 'content-type': 'application/json', ...signedHeaders(payload) },
        payload: payload.replace('"past_due"', '"active"').replace(TEAM_PRICE_ID, PRO_PRICE_ID),
      });
      expect(tampered.statusCode).toBe(400);
      expect(tampered.json()).toMatchObject({ error: 'webhook_verification_failed' });

      // None of the rejected requests may touch billing state.
      expect(await app.usersRepo.getBillingAccount(userId)).toMatchObject({
        subscription: 'free',
      });
    });
  });
});
