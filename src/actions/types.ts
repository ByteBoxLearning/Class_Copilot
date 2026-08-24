// Shared Server Action result type. Every action returns this shape so client
// components can consume a consistent { ok, error, fieldErrors } contract
// (typically via useActionState/useFormState).
export type ActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
};
