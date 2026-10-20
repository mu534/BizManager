import type { Metadata } from "next";
import { adminPageGuard } from "@server/auth/require-admin-page";
import { listBusinesses } from "@server/services/platform-admin.service";
import { Badge, Card, EmptyState, PageHeader, Table, TableWrap, Td, Th, type Tone } from "@components/ui/primitives";
import { formatDate } from "@components/ui/format";
import { StatusForm } from "./status-form";

export const metadata: Metadata = { title: "Businesses" };
export const instant = false;

const STATE: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  GRACE: { label: "Grace", tone: "warning" },
  READ_ONLY: { label: "Read-only", tone: "danger" },
  NONE: { label: "No plan", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
};

const FALLBACK_STATE: { label: string; tone: Tone } = { label: "Unknown", tone: "neutral" };

export default async function BusinessesPage() {
  const admin = await adminPageGuard(["SUPPORT"]);
  const rows = await listBusinesses();
  const canChangeStatus = admin.role === "SUPER_ADMIN";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Businesses"
        description="Account and subscription status only. Sales, expenses and financial reports of a business are not visible from this console."
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No businesses yet" description="Businesses appear here after owners complete setup." />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Business</Th><Th>Owner</Th><Th>Plan</Th><Th>Access</Th><Th>Period ends</Th><Th>Joined</Th>
                  {canChangeStatus && <Th>Account status</Th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const st = STATE[b.accessState] ?? FALLBACK_STATE;
                  return (
                    <tr key={b.id} className="align-top">
                      <Td><span className="font-medium text-ink-900">{b.name}</span><span className="block text-xs text-ink-500">{b.country}</span></Td>
                      <Td>{b.ownerEmail ?? "—"}</Td>
                      <Td>{b.planName ?? "—"}</Td>
                      <Td><Badge tone={st.tone}>{st.label}</Badge></Td>
                      <Td>{b.periodEndsAt ? formatDate(b.periodEndsAt) : "—"}</Td>
                      <Td>{formatDate(b.createdAt)}</Td>
                      {canChangeStatus && <Td><StatusForm businessId={b.id} current={b.status} /></Td>}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
      <p className="text-xs text-ink-500">Showing the 100 most recent businesses.</p>
    </div>
  );
}
