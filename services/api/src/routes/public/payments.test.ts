import { afterEach, describe, expect, it } from 'vitest';
import {
  getBillingFlowSource,
  getCheckoutPlan,
  getCheckoutPriceId,
  subscriptionFromStripeSubscription,
} from './payments.js';

const originalProPriceId = process.env.STRIPE_PRO_PRICE_ID;
const originalTeamPriceId = process.env.STRIPE_TEAM_PRICE_ID;

afterEach(() => {
  if (originalProPriceId === undefined) {
    delete process.env.STRIPE_PRO_PRICE_ID;
  } else {
    process.env.STRIPE_PRO_PRICE_ID = originalProPriceId;
  }

  if (originalTeamPriceId === undefined) {
    delete process.env.STRIPE_TEAM_PRICE_ID;
  } else {
    process.env.STRIPE_TEAM_PRICE_ID = originalTeamPriceId;
  }
});

describe('payments helpers', () => {
  it('parses checkout plan safely', () => {
    expect(getCheckoutPlan('pro')).toBe('pro');
    expect(getCheckoutPlan('team')).toBe('team');
    expect(getCheckoutPlan('enterprise')).toBeNull();
    expect(getCheckoutPlan(null)).toBeNull();
  });

  it('parses billing flow source safely', () => {
    expect(getBillingFlowSource('account_page')).toBe('account_page');
    expect(getBillingFlowSource('team_workspace')).toBe('team_workspace');
    expect(getBillingFlowSource('dashboard')).toBeNull();
    expect(getBillingFlowSource(null)).toBeNull();
  });

  it('returns configured checkout price ids for pro and team', () => {
    process.env.STRIPE_PRO_PRICE_ID = 'price_pro_123';
    process.env.STRIPE_TEAM_PRICE_ID = 'price_team_123';

    expect(getCheckoutPriceId('pro')).toBe('price_pro_123');
    expect(getCheckoutPriceId('team')).toBe('price_team_123');
  });

  it('prefers active price ids when resolving subscription tier from Stripe subscription', () => {
    process.env.STRIPE_PRO_PRICE_ID = 'price_pro_123';
    process.env.STRIPE_TEAM_PRICE_ID = 'price_team_123';

    expect(
      subscriptionFromStripeSubscription({
        metadata: { plan: 'pro' },
        items: {
          data: [
            {
              price: { id: 'price_team_123' },
            },
          ],
        },
      }),
    ).toBe('team');

    expect(
      subscriptionFromStripeSubscription({
        metadata: { plan: 'team' },
        items: {
          data: [
            {
              price: { id: 'price_pro_123' },
            },
          ],
        },
      }),
    ).toBe('pro');
  });

  it('falls back to metadata when the active price id is unavailable', () => {
    delete process.env.STRIPE_PRO_PRICE_ID;
    delete process.env.STRIPE_TEAM_PRICE_ID;

    expect(
      subscriptionFromStripeSubscription({
        metadata: { plan: 'team' },
        items: { data: [] },
      }),
    ).toBe('team');

    expect(
      subscriptionFromStripeSubscription({
        metadata: {},
        items: { data: [] },
      }),
    ).toBe('pro');
  });
});
