/** Result of a server action used by <ActionForm>. Redirects on success instead of returning. */
export interface FormState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Submitted values, echoed back so inputs survive a failed submit. */
  values?: Record<string, string>;
  /** Changes on every submit so inputs remount with the echoed values. */
  nonce?: number;
}
export const INITIAL_FORM_STATE: FormState = { ok: true };
