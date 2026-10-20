import type { Metadata } from "next";
import { adminPageGuard } from "@server/auth/require-admin-page";
import { listPendingPayments, listRecentReviewedPayments } from "@server/services/subscription-payment.service";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, TableWrap, Td, Th } from "@components/ui/primitives";
import { formatDateTime, formatMoney } from "@components/ui/format";
import { ReviewControls } from "./review-controls";

export const metadata: Metadata = { title: "Payments" };
export const instant = false;

export default async function PaymentsPage() {
  await adminPageGuard(["FINANCE"]);
  const [pending, reviewed] = await Promise.all([listPendingPayments(), listRecentReviewedPayments()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment review"
        description="Confirm each transfer against the Telebirr or bank statement before approving. Evidence views are audited."
      />

      <Card>
        <CardHeader title={`Pending (${pending.length})`} />
        {pending.length === 0 ? (
          <EmptyState title="Nothing to review" description="New payment submissions will appear here." />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Submitted</Th>
                  <Th>Business</Th>
                  <Th>Plan</Th>
                  <Th align="right">Amount</Th>
                  <Th>Method / reference</Th>
                  <Th>Receipt</Th>
                  <Th>Decision</Th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => {
                  const amount = formatMoney(p.amountMinor, p.currency);
                  return (
                    <tr key={p.id} className="align-top">
                      <Td>{formatDateTime(p.createdAt)}</Td>
                      <Td>
                        <span className="font-medium text-ink-900">{p.business.name}</span>
                        <span className="block text-xs text-ink-500">{p.submittedBy.email ?? p.submittedBy.name}</span>
                      </Td>
                      <Td>{p.plan.displayName} · {p.billingPeriod === "YEARLY" ? "Yearly" : "Monthly"}</Td>
                      <Td align="right">{amount}</Td>
                      <Td>
                        {p.method === "TELEBIRR" ? "Telebirr" : "Bank"}
                        <span className="block font-mono text-xs text-ink-600">{p.reference}</span>
                      </Td>
                      <Td>
                        <a href={`/api/payments/${p.id}/evidence`} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                          Open receipt
                        </a>
                      </Td>
                      <Td>
                        <ReviewControls
                          paymentId={p.id}
                          summary={`${p.business.name} — ${p.plan.displayName} (${p.billingPeriod.toLowerCase()}), ${amount}, ref ${p.reference}.`}
                        />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHeader title="Recently reviewed" />
        {reviewed.length === 0 ? (
          <p className="px-4 py-5 text-sm text-ink-500 sm:px-5">No reviewed payments yet.</p>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr><Th>Reviewed</Th><Th>Business</Th><Th>Plan</Th><Th align="right">Amount</Th><Th>Outcome</Th></tr>
              </thead>
              <tbody>
                {reviewed.map((p) => (
                  <tr key={p.id}>
                    <Td>{p.reviewedAt ? formatDateTime(p.reviewedAt) : "—"}</Td>
                    <Td>{p.business.name}</Td>
                    <Td>{p.plan.displayName}</Td>
                    <Td align="right">{formatMoney(p.amountMinor, p.currency)}</Td>
                    <Td>
                      <Badge tone={p.status === "APPROVED" ? "success" : "danger"}>{p.status === "APPROVED" ? "Approved" : "Rejected"}</Badge>
                      {p.rejectionReason && <span className="mt-1 block text-xs text-ink-500">{p.rejectionReason}</span>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
