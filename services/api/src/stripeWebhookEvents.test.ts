import type { FastifyInstance } from 'fastify';
import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './buildApp.js';
import { MockStripeWebhookEventsRepository } from './repositories/stripeWebhookEventsRepository.js';
import { handleStripeWebhookEvent } from './routes/public/payments.js';

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
  cancelAtPeriodEnd?: boolean;
}): Stripe.Subscription {
  return {
    id: input.id ?? 'sub_stage_c',
    customer: 'cus_stage_c',
    metadata: { userId: input.userId, plan: 'team', source: 'team_workspace' },
    status: input.status,
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    items: {
      data: [
        {
          price: {
            id: 'price_team_stage_c',
            recurring: { interval: 'month' },
          },
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

describe('Stripe webhook event ledger', () => {
  it('claims once, retries failures, and suppresses processed duplicates', async () => {
    const repo = new MockStripeWebhookEventsRepository();
    const first = await repo.claim({
      eventId: 'evt_ledger',
      eventType: 'customer.subscription.updated',
      livemode: false,
    });
    expect(first).toMatchObject({ acquired: true, record: { attemptCount: 1 } });
    const concurrent = await repo.claim({
      eventId: 'evt_ledger',
      eventType: 'customer.subscription.updated',
      livemode: false,
    });
    expect(concurrent).toMatchObject({ acquired: false, reason: 'in_progress' });
    if (!first.acquired) throw new Error('expected first claim');
    expect(await repo.markFailed('evt_ledger', first.record.claimToken, 'transient failure')).toBe(
      true,
    );

    const retry = await repo.claim({
      eventId: 'evt_ledger',
      eventType: 'customer.subscription.updated',
      livemode: false,
    });
    expect(retry).toMatchObject({ acquired: true, record: { attemptCount: 2 } });
    if (!retry.acquired) throw new Error('expected retry claim');
    expect(await repo.markProcessed('evt_ledger', first.record.claimToken)).toBe(false);
    expect(await repo.markProcessed('evt_ledger', retry.record.claimToken)).toBe(true);
    const duplicate = await repo.claim({
      eventId: 'evt_ledger',
      eventType: 'customer.subscription.updated',
      livemode: false,
    });
    expect(duplicate).toMatchObject({ acquired: false, reason: 'processed' });
  });
});

describe('Stripe webhook lifecycle handling', () => {
  let app: FastifyInstance;
  let userId: string;

  beforeEach(async () => {
    delete process.env.DATABASE_URL;
    process.env.STRIPE_TEAM_PRICE_ID = 'price_team_stage_c';
    app = await buildApp({ logger: false });
    const registered = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `stripe-ledger-${Date.now()}@example.com`,
        password: 'password123',
      },
    });
    userId = (registered.json() as { user: { id: string } }).user.id;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
    delete process.env.STRIPE_TEAM_PRICE_ID;
  });

  it('processes checkout once and records one source-deduplicated funnel event', async () => {
    const currentSubscription = subscription({ userId, status: 'active' });
    const retrieve = vi.fn().mockResolvedValue(currentSubscription);
    const stripe = { subscriptions: { retrieve } } as unknown as Stripe;
    const event = stripeEvent('evt_checkout_once', 'checkout.session.completed', {
      id: 'cs_stage_c',
      client_reference_id: userId,
      metadata: { userId, plan: 'team', source: 'team_workspace' },
      customer: 'cus_stage_c',
      subscription: currentSubscription.id,
    });

    await expect(handleStripeWebhookEvent(app, stripe, event)).resolves.toMatchObject({
      outcome: 'processed',
      attemptCount: 1,
    });
    await expect(handleStripeWebhookEvent(app, stripe, event)).resolves.toMatchObject({
      outcome: 'duplicate',
      attemptCount: 1,
    });
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(await app.usersRepo.getBillingAccount(userId)).toMatchObject({
      subscription: 'team',
      billingStatus: 'active',
      stripeCustomerId: 'cus_stage_c',
    });
    expect(await app.billingFunnelRepo.getAdminMetrics()).toMatchObject({
      checkoutCompletions: 1,
    });
  });

  it('records failure and completes the same event on a later attempt', async () => {
    const currentSubscription = subscription({ userId, status: 'active' });
    const retrieve = vi
      .fn()
      .mockRejectedValueOnce(new Error('Stripe temporarily unavailable'))
      .mockResolvedValueOnce(currentSubscription);
    const stripe = { subscriptions: { retrieve } } as unknown as Stripe;
    const event = stripeEvent('evt_checkout_retry', 'checkout.session.completed', {
      id: 'cs_retry',
      client_reference_id: userId,
      metadata: { userId, plan: 'team' },
      customer: 'cus_stage_c',
      subscription: currentSubscription.id,
    });

    await expect(handleStripeWebhookEvent(app, stripe, event)).rejects.toThrow(
      'Stripe temporarily unavailable',
    );
    expect(await app.stripeWebhookEventsRepo.getById(event.id)).toMatchObject({
      status: 'failed',
      attemptCount: 1,
      lastError: 'Stripe temporarily unavailable',
    });
    await expect(handleStripeWebhookEvent(app, stripe, event)).resolves.toMatchObject({
      outcome: 'processed',
      attemptCount: 2,
    });
    expect(await app.stripeWebhookEventsRepo.getById(event.id)).toMatchObject({
      status: 'processed',
      attemptCount: 2,
      lastError: null,
    });
    expect(await app.billingFunnelRepo.getAdminMetrics()).toMatchObject({
      checkoutCompletions: 1,
    });
  });

  it('applies past-due, recovery, and deletion transitions exactly once', async () => {
    const stripe = {} as Stripe;
    await handleStripeWebhookEvent(
      app,
      stripe,
      stripeEvent(
        'evt_past_due',
        'customer.subscription.updated',
        subscription({ userId, status: 'past_due' }),
      ),
    );
    expect(await app.usersRepo.getBillingAccount(userId)).toMatchObject({
      subscription: 'team',
      billingStatus: 'past_due',
    });

    const recovered = stripeEvent(
      'evt_recovered',
      'customer.subscription.updated',
      subscription({ userId, status: 'active' }),
    );
    await handleStripeWebhookEvent(app, stripe, recovered);
    await handleStripeWebhookEvent(app, stripe, recovered);
    expect(await app.usersRepo.getBillingAccount(userId)).toMatchObject({
      subscription: 'team',
      billingStatus: 'active',
    });
    expect(await app.billingFunnelRepo.getAdminMetrics()).toMatchObject({
      recoveredSubscriptions: 1,
    });

    await handleStripeWebhookEvent(
      app,
      stripe,
      stripeEvent(
        'evt_deleted',
        'customer.subscription.deleted',
        subscription({ userId, status: 'canceled' }),
      ),
    );
    expect(await app.usersRepo.getBillingAccount(userId)).toMatchObject({
      subscription: 'free',
      billingStatus: 'canceled',
      stripeSubscriptionId: null,
    });
  });
});
