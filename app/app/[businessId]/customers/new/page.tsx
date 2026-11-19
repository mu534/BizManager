import type { Metadata } from "next";
import { resolveContext } from "@server/auth/resolve-context";
import { Card, PageHeader } from "@components/ui/primitives";
import { AccessDenied } from "@components/layout/states";
import { ActionForm, TextAreaField, TextField } from "@components/forms/action-form";
import { createCustomerAction } from "../actions";

export const metadata: Metadata = { title: "Add customer" };

// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function NewCustomerPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId);
  if (ctx.role === "STAFF") return <AccessDenied businessId={businessId} what="customers" />;
  return (
    <div className="max-w-md">
      <PageHeader
        title="Add customer"
        description="Keep a name and phone number so you know who owes you."
        breadcrumbs={[{ label: "Customers", href: `/app/${businessId}/customers` }, { label: "New" }]}
      />
      <Card className="p-5">
        <ActionForm
          action={createCustomerAction.bind(null, businessId)}
          submitLabel="Add customer"
          cancelHref={`/app/${businessId}/customers`}
        >
          <TextField name="name" label="Name" required placeholder="e.g. Abebe Kebede" />
          <TextField name="phone" label="Phone" type="tel" inputMode="numeric" placeholder="e.g. 0911 00 00 00" />
          <TextAreaField name="notes" label="Notes" hint="Optional. Anything that helps you remember this customer." />
        </ActionForm>
      </Card>
    </div>
  );
}