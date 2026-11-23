export type AccessState = "NONE" | "ACTIVE" | "GRACE" | "READ_ONLY" | "CANCELLED" | "SUSPENDED";

export type PaymentStatus = "PENDING" | "APPROVED" | "REJECTED";

export type StepState = "done" | "current" | "upcoming" | "attention";

export interface StartPageArgs {
  isOwner: boolean;
  accessState: AccessState;
  hasSubmittedPayment: boolean;
}

/**
 * Returns the page slug the app shell should land the user on after sign-in.
 * - Owners with no plan and no pending payment → choose-plan
 * - Everyone else (staff, or already has/had a plan, or payment submitted) → dashboard
 */
export function startPage({ isOwner, accessState, hasSubmittedPayment }: StartPageArgs): "choose-plan" | "dashboard" {
  if (isOwner && accessState === "NONE" && !hasSubmittedPayment) {
    return "choose-plan";
  }
  return "dashboard";
}

export interface PlanFirstStepsResult {
  choose: StepState;
  review: StepState;
  record: StepState;
}

/**
 * Returns the UI step states for the "choose a plan" onboarding card.
 *
 * | latestPayment | choose      | review    | record   |
 * |---------------|-------------|-----------|----------|
 * | null          | current     | upcoming  | upcoming |
 * | PENDING       | done        | current   | upcoming |
 * | REJECTED      | attention   | upcoming  | upcoming |
 * | APPROVED      | done        | done      | current  |
 */
export function planFirstSteps(latestPayment: PaymentStatus | null): PlanFirstStepsResult {
  if (latestPayment === null) {
    return { choose: "current", review: "upcoming", record: "upcoming" };
  }
  if (latestPayment === "PENDING") {
    return { choose: "done", review: "current", record: "upcoming" };
  }
  if (latestPayment === "REJECTED") {
    return { choose: "attention", review: "upcoming", record: "upcoming" };
  }
  // APPROVED
  return { choose: "done", review: "done", record: "current" };
}
