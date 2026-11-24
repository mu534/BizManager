import "server-only";
import { after } from "next/server";
import { prisma } from "@server/db/prisma";
import { buildPaymentAlertText } from "@shared/admin-alert-text";
import { siteUrl } from "@shared/site-url";
import { sendTelegram, telegramConfig } from "@server/services/telegram";

async function alertNewPayment(paymentId: string): Promise<void> {
  try {
    const cfg = telegramConfig();
    if (!cfg) return;
    const p = await prisma.subscriptionPayment.findUnique({
      where: { id: paymentId },
      include: { business: { select: { name: true } }, plan: { select: { displayName: true } } },
    });
    if (!p) return;
    await sendTelegram(
      cfg,
      buildPaymentAlertText({
        businessName: p.business.name,
        planName: p.plan.displayName,
        billingPeriod: p.billingPeriod,
        amountMinor: p.amountMinor,
        currency: p.currency,
        method: p.method,
        reference: p.reference,
        appUrl: siteUrl(),
      }),
    );
  } catch (err) {
    console.error("[admin-alert] new-payment alert failed", err);
  }
}

/**
 * Tell the admin team a payment is waiting. Runs after the response is sent, so a
 * Telegram outage can never make a customer's submission fail or feel slow.
 */
export function scheduleNewPaymentAlert(paymentId: string): void {
  if (!telegramConfig()) return;
  const run = () => alertNewPayment(paymentId);
  try {
    after(run);
  } catch {
    void run();
  }
}