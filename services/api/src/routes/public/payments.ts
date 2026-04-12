import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import { config } from '../../config/index.js';
import { verifyAccessToken } from '../../auth/tokens.js';
import { PgUsersRepository } from '../../repositories/usersRepository.js';
import { getPool } from '../../db/pool.js';

function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m?.[1] ?? null;
}

function getRepo(): PgUsersRepository | null {
  const pool = getPool();
  return pool ? new PgUsersRepository(pool) : null;
}

export async function paymentsRoutes(app: FastifyInstance) {
  // Add content-type parser for raw body (webhook needs it)
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req: FastifyRequest, body: Buffer, done: (err: Error | null, body: Buffer) => void) => {
      done(null, body);
    },
  );

  // ── POST /v1/payments/checkout ─────────────────────────────────────────────
  app.post('/checkout', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!config.hasStripe) {
      return reply.code(503).send({ error: 'stripe_not_configured' });
    }

    const token = extractBearer(request.headers.authorization);
    if (!token) return reply.code(401).send({ error: 'unauthorized' });

    const payload = verifyAccessToken(token);
    if (!payload) return reply.code(401).send({ error: 'invalid_token' });

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

    // Only allow users to create checkout for themselves
    if (payload.sub !== userId) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const stripe = new Stripe(config.stripe.secretKey);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: config.stripe.proPriceId, quantity: 1 }],
      client_reference_id: userId,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/account?upgraded=1`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/account`,
    });

    return reply.send({ url: session.url });
  });

  // ── POST /v1/payments/webhook ──────────────────────────────────────────────
  app.post('/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!config.hasStripe) {
      return reply.code(503).send({ error: 'stripe_not_configured' });
    }

    const sig = request.headers['stripe-signature'];
    if (!sig || typeof sig !== 'string') {
      return reply.code(400).send({ error: 'missing_stripe_signature' });
    }

    const rawBody = request.body as Buffer;
    const stripe = new Stripe(config.stripe.secretKey);

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, config.stripe.webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'webhook_verification_failed';
      return reply.code(400).send({ error: 'webhook_verification_failed', details: message });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      if (!userId) {
        app.log.warn({ eventId: event.id }, 'checkout.session.completed missing client_reference_id');
        return reply.send({ received: true });
      }

      const repo = getRepo();
      if (!repo) {
        app.log.error('database_unavailable when processing webhook');
        return reply.code(503).send({ error: 'database_unavailable' });
      }

      await repo.setSubscription(userId, 'pro');
      app.log.info({ userId }, 'User upgraded to pro via Stripe checkout');
    }

    return reply.send({ received: true });
  });
}
