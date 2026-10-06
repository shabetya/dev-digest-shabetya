import Stripe from 'stripe';
import type { PaymentGateway, ChargeResult } from '../../vendor/shared/adapters.js';

export class StripeGateway implements PaymentGateway {
  private client: Stripe;

  constructor(apiKey: string) {
    this.client = new Stripe(apiKey);
  }

  async charge(customerRef: string, amountCents: number, description: string): Promise<ChargeResult> {
    const intent = await this.client.paymentIntents.create({
      customer: customerRef,
      amount: amountCents,
      currency: 'usd',
      description,
      confirm: true,
    });
    return { id: intent.id, chargedAt: new Date(intent.created * 1000) };
  }
}
