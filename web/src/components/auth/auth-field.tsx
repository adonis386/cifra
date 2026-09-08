"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { FieldError, Input, Label } from "@/components/ui";

type AuthFieldProps = {
  id: string;
  name: string;
  label: string;
  hint?: ReactNode;
  validate?: (value: string) => string;
  defaultValue?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name" | "placeholder">;

export function AuthField({
  id,
  name,
  label,
  hint,
  validate,
  defaultValue = "",
  onBlur,
  onChange,
  ...inputProps
}: AuthFieldProps) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState("");

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...inputProps}
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          if (error && validate) {
            const nextError = validate(next);
            if (!nextError) setError("");
          }
          onChange?.(event);
        }}
        onBlur={(event) => {
          if (validate) setError(validate(event.target.value));
          onBlur?.(event);
        }}
      />
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-[var(--color-muted-foreground)]">
          {hint}
        </p>
      ) : null}
      <span id={`${id}-error`}>
        <FieldError message={error} />
      </span>
    </div>
  );
}
