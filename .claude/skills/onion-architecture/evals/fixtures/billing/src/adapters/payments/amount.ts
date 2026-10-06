export function toMinorUnits(amountCents: number, currency: 'usd' | 'eur'): number {
  const factor = currency === 'usd' || currency === 'eur' ? 1 : 100;
  return Math.round(amountCents * factor);
}

export function describeCharge(invoiceId: string, amountCents: number): string {
  return `Invoice ${invoiceId} (${(amountCents / 100).toFixed(2)})`;
}
