import type { Metadata } from "next";
import { LegalPage } from "@components/marketing/legal-page";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="October 2026 (draft)">
      <section>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Account:</strong> your name, email address and sign-in identity (provided through Firebase Authentication, including Google sign-in if you choose it).</li>
          <li><strong>Business records you enter:</strong> products, stock movements, sales, returns, expenses, money accounts and their transactions, and the people you add to your business.</li>
          <li><strong>Subscription payments:</strong> the plan, amount, method, the transaction reference you type and the receipt image or PDF you upload.</li>
          <li><strong>Operational logs:</strong> an audit trail of sensitive actions (such as payment reviews and permission changes) and synchronization records for offline transactions.</li>
        </ul>
      </section>
      <section>
        <h2>Where it is stored</h2>
        <ul>
          <li>Business records are stored in a PostgreSQL database operated for BizManager.</li>
          <li>Receipts are stored as private files in Firebase Storage. They are not publicly reachable.</li>
          <li>On your device, BizManager keeps a sign-in session cookie, a language preference cookie, and — to support offline use — a local copy of your product list and any sales or expenses that have not yet synced.</li>
        </ul>
      </section>
      <section>
        <h2>Who can see it</h2>
        <ul>
          <li><strong>Your business:</strong> the owner can see everything. Managers and staff see only what their role and the owner’s grants allow.</li>
          <li><strong>BizManager operators:</strong> can see account and subscription status and payment evidence needed to verify a payment. They cannot browse your sales, expenses or financial reports. Each view of payment evidence is logged.</li>
          <li>We do not sell your data.</li>
        </ul>
      </section>
      <section>
        <h2>Retention and deletion</h2>
        <p>
          Your business records are kept while your account exists and are <strong>not deleted</strong> if a subscription
          expires; you keep read-only access and can export your data. To ask for correction or deletion of your data,
          contact support.
        </p>
      </section>
      <section>
        <h2>Service providers</h2>
        <p>
          BizManager relies on Google Firebase (authentication and file storage) and a database and hosting provider.
          The specific hosting provider and region will be listed here before launch.
        </p>
      </section>
      <section>
        <h2>What this draft does not claim</h2>
        <p>
          This page makes no statement about certifications, regulatory compliance, backup schedules or specific
          encryption beyond what our infrastructure providers supply. Those must be confirmed and documented before
          launch.
        </p>
      </section>
    </LegalPage>
  );
}
