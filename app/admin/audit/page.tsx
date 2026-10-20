import type { Metadata } from "next";
import { adminPageGuard } from "@server/auth/require-admin-page";
import { listAuditLog } from "@server/services/platform-admin.service";
import { Card, EmptyState, PageHeader, Table, TableWrap, Td, Th } from "@components/ui/primitives";
import { formatDateTime } from "@components/ui/format";

export const metadata: Metadata = { title: "Audit log" };
export const instant = false;

export default async function AuditPage() {
  await adminPageGuard(["FINANCE", "SUPPORT"]);
  const rows = await listAuditLog(100);
  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Append-only record of sensitive platform actions. Rows cannot be edited or deleted." />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No activity yet" description="Payment reviews, pricing changes and status changes are recorded here." />
        ) : (
          <TableWrap>
            <Table>
              <thead><tr><Th>When</Th><Th>Action</Th><Th>Target</Th><Th>Actor</Th><Th>Details</Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <Td>{formatDateTime(r.createdAt)}</Td>
                    <Td><span className="font-mono text-xs">{r.action}</span></Td>
                    <Td>{r.targetType}<span className="block font-mono text-xs text-ink-500">{r.targetId.slice(0, 8)}</span></Td>
                    <Td><span className="font-mono text-xs">{r.actorUserId.slice(0, 8)}</span></Td>
                    <Td><pre className="max-w-md overflow-x-auto whitespace-pre-wrap text-xs text-ink-600">{r.metadata ? JSON.stringify(r.metadata) : "—"}</pre></Td>
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
