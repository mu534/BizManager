"use client";

import { useState, useTransition } from "react";
import { Button } from "@components/ui/button";
import { Select } from "@components/ui/field";
import { ConfirmDialog } from "@components/ui/dialog";
import { useToast } from "@components/ui/toast";
import { updateMemberAction } from "./actions";

interface Props {
  businessId: string;
  memberId: string;
  name: string;
  role: "MANAGER" | "STAFF";
  status: "ACTIVE" | "INACTIVE";
  hasReportAccess: boolean;
}

export function MemberControls({ businessId, memberId, name, role, status, hasReportAccess }: Props) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirmOff, setConfirmOff] = useState(false);

  function run(change: { role?: "MANAGER" | "STAFF"; financialReportAccess?: boolean; status?: "ACTIVE" | "INACTIVE" }) {
    start(async () => {
      const r = await updateMemberAction(businessId, { memberId, ...change });
      toast.show(r.message, r.ok ? "success" : "danger");
    });
  }

  const active = status === "ACTIVE";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label={`Role for ${name}`}
        value={role}
        disabled={pending || !active}
        onChange={(e) => run({ role: e.target.value === "STAFF" ? "STAFF" : "MANAGER" })}
        className="h-8 w-28 text-[13px]"
      >
        <option value="MANAGER">Manager</option>
        <option value="STAFF">Staff</option>
      </Select>

      {role === "MANAGER" && active && (
        <Button
          size="sm"
          variant={hasReportAccess ? "secondary" : "primary"}
          loading={pending}
          onClick={() => run({ financialReportAccess: !hasReportAccess })}
        >
          {hasReportAccess ? "Revoke report access" : "Grant report access"}
        </Button>
      )}

      {active ? (
        <Button size="sm" variant="danger" disabled={pending} onClick={() => setConfirmOff(true)}>
          Deactivate
        </Button>
      ) : (
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run({ status: "ACTIVE" })}>
          Reactivate
        </Button>
      )}

      <ConfirmDialog
        open={confirmOff}
        onCancel={() => setConfirmOff(false)}
        onConfirm={() => {
          setConfirmOff(false);
          run({ status: "INACTIVE" });
        }}
        title={`Deactivate ${name}?`}
        description="They will lose access to this business immediately. Their past records stay. You can reactivate them later; report access would need to be granted again."
        confirmLabel="Deactivate"
      />
    </div>
  );
}
