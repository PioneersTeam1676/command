import { ActionForm, SubmitButton } from "@/components/form";
import { TextField } from "@/components/form-fields";
import type { FormState } from "@/lib/form";

type Group = { id: string; name: string };

/** One form for adding and editing. On edit, blank password / secret fields keep what is stored. */
export function LoginForm({
  action,
  groups,
  initial,
  submitLabel,
  resetOnSuccess,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  groups: Group[];
  initial?: { id: string; label: string; email: string; groupIds: string[] };
  submitLabel: string;
  resetOnSuccess?: boolean;
}) {
  const editing = Boolean(initial);
  return (
    <ActionForm action={action} className="space-y-3" resetOnSuccess={resetOnSuccess}>
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="label" label="Name" defaultValue={initial?.label} required maxLength={80} />
        <TextField name="email" label="Email address" type="text" autoComplete="off" defaultValue={initial?.email} required maxLength={200} />
        <TextField
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required={!editing}
          maxLength={500}
          help={editing ? "Leave blank to keep the current password." : undefined}
        />
        <TextField
          name="totpSecret"
          label="Authenticator secret"
          type="password"
          autoComplete="off"
          required={!editing}
          help={editing ? "Leave blank to keep the current secret." : "The setup key shown next to the QR code (letters and numbers), or the otpauth:// link."}
        />
      </div>
      <fieldset className="space-y-1 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Who can use it</legend>
        {groups.length === 0 ? (
          <p className="text-sm text-muted">Make a group first on the Groups page.</p>
        ) : (
          groups.map((g) => (
            <label key={g.id} className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" name="groupIds" value={g.id} defaultChecked={initial?.groupIds.includes(g.id)} className="size-4 accent-foreground" />
              {g.name}
            </label>
          ))
        )}
        <p className="pt-1 text-xs text-muted">Admins can always see every shared login.</p>
      </fieldset>
      <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
