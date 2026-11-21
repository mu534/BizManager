import type { Metadata } from "next";
import { resolveContext } from "@server/auth/resolve-context";
import { getCustomerDetail } from "@server/services/customer.service";
import { Card, PageHeader } from "@components/ui/primitives";
import { AccessDenied } from "@components/layout/states";
import { ActionForm, TextAreaField, TextField } from "@components/forms/action-form";
import { updateCustomerAction } from "../../actions";

export const metadata: Metadata = { title: "Edit customer" };

// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ businessId: string; customerId: string }>;
}) {
  const { businessId, customerId } = await params;
  const ctx = await resolveContext(businessId);
  if (ctx.role === "STAFF") return <AccessDenied businessId={businessId} what="customers" />;
  const c = await getCustomerDetail(ctx, customerId);
  const back = `/app/${businessId}/customers/${customerId}`;

  return (
    <div className="max-w-md">
      <PageHeader
        title="Edit customer"
        description="Balances are not changed here. Record payments from the customer page."
        breadcrumbs={[{ label: "Customers", href: `/app/${businessId}/customers` }, { label: c.name, href: back }, { label: "Edit" }]}
      />
      <Card className="p-5">
        <ActionForm
          action={updateCustomerAction.bind(null, businessId, customerId)}
          submitLabel="Save changes"
          cancelHref={back}
        >
          <TextField name="name" label="Name" required defaultValue={c.name} />
          <TextField name="phone" label="Phone" type="tel" inputMode="numeric" defaultValue={c.phone ?? ""} />
          <TextAreaField name="notes" label="Notes" defaultValue={c.notes ?? ""} />
        </ActionForm>
      </Card>
    </div>
  );
}