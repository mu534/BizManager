import type { Metadata } from "next";
import { resolveContext } from "@server/auth/resolve-context";
import { Alert, Card, PageHeader } from "@components/ui/primitives";
import { AccessDenied } from "@components/layout/states";
import { ActionForm, SelectField, TextField } from "@components/forms/action-form";
import { createAccountAction } from "../actions";

export const metadata: Metadata = { title: "Add account" };

export default async function NewAccountPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId);
  if (ctx.role === "STAFF") return <AccessDenied businessId={businessId} what="account management" />;
  return (
    <div className="max-w-md">
      <PageHeader title="Add account" description="Where money is kept: a till, a Telebirr wallet, a bank account."
        breadcrumbs={[{ label: "Accounts", href: `/app/${businessId}/accounts` }, { label: "New" }]} />
      <Card className="p-5">
        <ActionForm action={createAccountAction.bind(null, businessId)} submitLabel="Create account" cancelHref={`/app/${businessId}/accounts`}>
          <TextField name="name" label="Account name" required placeholder="e.g. Telebirr" />
          <SelectField name="type" label="Type" required defaultValue="CASH" options={[
            { value: "CASH", label: "Cash" }, { value: "MOBILE_MONEY", label: "Mobile money" }, { value: "BANK", label: "Bank" }, { value: "OTHER", label: "Other" },
          ]} />
          <TextField name="openingBalance" label="Opening balance" inputMode="decimal" defaultValue="0" hint="What is in it right now. Recorded as the starting balance, not as income." />
        </ActionForm>
      </Card>
      <div className="mt-4"><Alert tone="info">Accounts only record where money went. BizManager does not connect to Telebirr or any bank.</Alert></div>
    </div>
  );
}
