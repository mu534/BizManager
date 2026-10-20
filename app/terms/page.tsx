import type { Metadata } from "next";
import { LegalPage } from "@components/marketing/legal-page";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="October 2026 (draft)">
      <section>
        <h2>The service</h2>
        <p>
          BizManager is business-management software for retail shops: inventory, sales, expenses, money accounts and
          reports. Reports are management reports built from what you record. They are <strong>not</strong> certified
          accounting statements and do not calculate taxes.
        </p>
      </section>
      <section>
        <h2>Your account</h2>
        <p>
          You are responsible for the accuracy of what you record and for keeping your sign-in secure. The owner decides
          who may join the business and who may see financial reports.
        </p>
      </section>
      <section>
        <h2>Subscriptions and manual payment</h2>
        <ul>
          <li>Plans are billed monthly or yearly at the prices shown in the app when you pay.</li>
          <li>Payment is made by Telebirr or bank transfer. You submit the transaction reference and a receipt; a BizManager administrator verifies it. Nothing is activated automatically and a pending submission does not grant access.</li>
          <li>A payment can be rejected with a reason, and you may submit again.</li>
          <li>Approved payments grant the plan for the paid period. Renewing before or during the grace period continues from the previous end date.</li>
        </ul>
      </section>
      <section>
        <h2>When a subscription ends</h2>
        <ul>
          <li>You have a <strong>3-day grace period</strong> after the end date during which everything keeps working.</li>
          <li>After that the business becomes <strong>read-only</strong>: you can view and export your data but cannot record new transactions.</li>
          <li>Your data is not deleted because a subscription ended. Sales or expenses saved on your device while offline are kept and synchronized after you renew.</li>
        </ul>
      </section>
      <section>
        <h2>Offline use</h2>
        <p>
          Sales and expenses can be recorded without internet using data already loaded on your device and are sent when
          you are online again. Items that cannot be applied safely (for example, because stock is no longer
          available) are kept and shown to you rather than deleted.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <p>
          Do not attempt to access another business’s data, upload malicious files, or misuse the payment-submission
          process. We may suspend a business for abuse; suspended businesses keep read-only access and export.
        </p>
      </section>
      <section>
        <h2>Availability and changes</h2>
        <p>
          We work to keep the service available but do not promise uninterrupted operation. We may change these terms
          and the plans; changes to prices apply to payments made after the change.
        </p>
      </section>
    </LegalPage>
  );
}
