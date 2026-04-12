import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Stripe from 'stripe';
import type { BillingInterval, BillingStatus, SubscriptionTier } from '@sg/shared/billing';
import { config } from '../../config/index.js';
import { verifyAccessToken } from '../../auth/tokens.js';

function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1] ?? null;
}

function getStripe(): Stripe {
  return new Stripe(config.stripe.secretKey);
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

function subscriptionFromMetadata(metadata: Stripe.Metadata | null | undefined): SubscriptionTier {
  return metadata?.plan === 'team' ? 'team' : 'pro';
}

function stripeStatusToBillingStatus(status: Stripe.Subscription.Status): BillingStatus {
  if (status === 'trialing') return 'trialing';
  if (status === 'active') return 'active';
  if (status === 'past_due' || status === 'unpaid') return 'past_due';
  if (status === 'canceled' || status === 'incomplete_expired') return 'canceled';
  return 'inactive';
}

function stripeIntervalToBillingInterval(
  value: Stripe.Price.Recurring.Interval | null | undefined,
): BillingInterval | null {
  if (value === 'month' || value === 'year') return value;
  return null;
}

function getCurrentPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const raw = (subscription as Stripe.Subscription & { current_period_end?: number })
    .current_period_end;
  return typeof raw === 'number' ? new Date(raw * 1000) : null;
}

async function requireAuthedUser(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const token = extractBearer(request.headers.authorization);
  if (!token) {
    reply.code(401).send({ error: 'unauthorized' });
    return null;
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    reply.code(401).send({ error: 'invalid_token' });
    return null;
  }

  const user = await app.usersRepo.getBillingAccount(payload.sub);
  if (!user) {
    reply.code(404).send({ error: 'user_not_found' });
    return null;
  }

  return user;
}

async function applyStripeSubscriptionToUser(
  app: FastifyInstance,
  userId: string,
  subscription: Stripe.Subscription,
  customerId: string | null,
) {
  await app.usersRepo.updateBillingAccount(userId, {
    subscription: subscriptionFromMetadata(subscription.metadata),
    billingStatus: stripeStatusToBillingStatus(subscription.status),
    billingInterval: stripeIntervalToBillingInterval(
      subscription.items.data[0]?.price.recurring?.interval,
    ),
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: getCurrentPeriodEnd(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

async function findUserIdFromStripeContext(
  app: FastifyInstance,
  customerId: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  metadata: Stripe.Metadata | null | undefined,
): Promise<string | null> {
  if (metadata?.userId) return metadata.userId;
  const normalizedCustomerId = typeof customerId === 'string' ? customerId : customerId?.id;
  if (!normalizedCustomerId) return null;
  const account = await app.usersRepo.getBillingAccountByStripeCustomerId(normalizedCustomerId);
  return account?.id ?? null;
}

export async function paymentsRoutes(app: FastifyInstance) {
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req: FastifyRequest, body: Buffer, done: (err: Error | null, body: Buffer) => void) => {
      done(null, body);
    },
  );

  app.post('/checkout', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!config.hasStripe) {
      return reply.code(503).send({ error: 'stripe_not_configured' });
    }
    if (!config.stripe.proPriceId) {
      return reply.code(503).send({ error: 'stripe_price_not_configured' });
    }

    const user = await requireAuthedUser(app, request, reply);
    if (!user) return reply;

    const rawBody = request.body as Buffer;
    let userId: string;
    try {
      const parsed = JSON.parse(rawBody.toString()) as { userId?: unknown };
      if (typeof parsed.userId !== 'string' || !parsed.userId) {
        return reply.code(400).send({ error: 'invalid_body', details: 'userId is required' });
      }
      userId = parsed.userId;
    } catch {
      return reply.code(400).send({ error: 'invalid_body' });
    }

    if (user.id !== userId) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const stripe = getStripe();
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.displayName ?? undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await app.usersRepo.updateBillingAccount(user.id, {
        stripeCustomerId: customerId,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: config.stripe.proPriceId, quantity: 1 }],
      client_reference_id: user.id,
      metadata: { userId: user.id, plan: 'pro' },
      subscription_data: {
        metadata: { userId: user.id, plan: 'pro' },
      },
      success_url: `${getAppUrl()}/auth/account?upgraded=1`,
      cancel_url: `${getAppUrl()}/auth/account`,
    });

    return reply.send({ url: session.url });
  });

  app.post('/portal', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!config.hasStripe) {
      return reply.code(503).send({ error: 'stripe_not_configured' });
    }

    const user = await requireAuthedUser(app, request, reply);
    if (!user) return reply;

    if (!user.stripeCustomerId) {
      return reply.code(409).send({ error: 'billing_portal_unavailable' });
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${getAppUrl()}/auth/account`,
    });

    return reply.send({ url: session.url });
  });

  app.post('/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!config.hasStripe) {
      return reply.code(503).send({ error: 'stripe_not_configured' });
    }

    const sig = request.headers['stripe-signature'];
    if (!sig || typeof sig !== 'string') {
      return reply.code(400).send({ error: 'missing_stripe_signature' });
    }

    const rawBody = request.body as Buffer;
    const stripe = getStripe();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, config.stripe.webhookSecret);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'webhook_verification_failed';
      return reply.code(400).send({ error: 'webhook_verification_failed', details: message });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id ?? session.metadata?.userId ?? null;
      const customerId =
        typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
      if (userId && customerId) {
        await app.usersRepo.updateBillingAccount(userId, {
          stripeCustomerId: customerId,
        });
      }
      if (userId && typeof session.subscription === 'string') {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await applyStripeSubscriptionToUser(app, userId, subscription, customerId);
      }
    }

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated'
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = await findUserIdFromStripeContext(
        app,
        subscription.customer,
        subscription.metadata,
      );
      const customerId =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : (subscription.customer?.id ?? null);
      if (userId) {
        await applyStripeSubscriptionToUser(app, userId, subscription, customerId);
      } else {
        app.log.warn({ eventId: event.id }, 'subscription event missing identifiable user');
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = await findUserIdFromStripeContext(
        app,
        subscription.customer,
        subscription.metadata,
      );
      const customerId =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : (subscription.customer?.id ?? null);
      if (userId) {
        await app.usersRepo.updateBillingAccount(userId, {
          subscription: 'free',
          billingStatus: 'canceled',
          billingInterval: null,
          stripeCustomerId: customerId,
          stripeSubscriptionId: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        });
      }
    }

    return reply.send({ received: true });
  });
}
