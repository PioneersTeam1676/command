"use client";
import * as React from "react";
import { useId } from "react";
import { Field } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useFormState } from "@/components/form";

type Common = { name: string; label: string; help?: string; className?: string };

function useErr(name: string) {
  const s = useFormState();
  // Unique per field instance, so two forms on one page can both have a "name" field without clashing ids.
  const uid = useId().replace(/:/g, "");
  return { error: s.fieldErrors?.[name], kept: s.values?.[name], id: `f-${name}-${uid}` };
}

export function TextField({
  name,
  label,
  help,
  className,
  defaultValue,
  ...props
}: Common & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "className">) {
  const { error, kept, id } = useErr(name);
  return (
    <Field label={label} htmlFor={id} help={help} error={error} className={className}>
      <Input
        id={id}
        name={name}
        defaultValue={props.type === "password" ? undefined : (kept ?? defaultValue)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined}
        {...props}
      />
    </Field>
  );
}

export function TextAreaField({
  name,
  label,
  help,
  className,
  defaultValue,
  ...props
}: Common & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name" | "className">) {
  const { error, kept, id } = useErr(name);
  return (
    <Field label={label} htmlFor={id} help={help} error={error} className={className}>
      <Textarea
        id={id}
        name={name}
        defaultValue={kept ?? defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : help ? `${id}-help` : undefined}
        {...props}
      />
    </Field>
  );
}

export function SelectField({
  name,
  label,
  help,
  className,
  options,
  defaultValue,
  ...props
}: Common & {
  options: readonly (string | { value: string; label: string })[];
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name" | "className">) {
  const { error, kept, id } = useErr(name);
  return (
    <Field label={label} htmlFor={id} help={help} error={error} className={className}>
      <Select id={id} name={name} defaultValue={kept ?? defaultValue} aria-invalid={error ? true : undefined} {...props}>
        {options.map((o) => {
          const v = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          );
        })}
      </Select>
    </Field>
  );
}
