"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

const LENGTH = 6;

export function OtpInput({
  name = "token",
  value,
  onChange,
  disabled,
  autoComplete = "one-time-code",
}: {
  name?: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  autoComplete?: string;
}) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] || "");

  function focusAt(index: number) {
    const node = inputs.current[Math.max(0, Math.min(LENGTH - 1, index))];
    node?.focus();
    node?.select();
  }

  function setDigits(next: string) {
    onChange(next.replace(/\D/g, "").slice(0, LENGTH));
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    setDigits(event.clipboardData.getData("text"));
    focusAt(LENGTH - 1);
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      const next = `${value.slice(0, index - 1)}${value.slice(index)}`;
      setDigits(next);
      focusAt(index - 1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusAt(index - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusAt(index + 1);
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={value} />
      <div className="flex justify-between gap-2">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(node) => {
              inputs.current[index] = node;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? autoComplete : "off"}
            aria-label={`Dígito ${index + 1} de ${LENGTH}`}
            maxLength={1}
            disabled={disabled}
            value={digit}
            onPaste={onPaste}
            onKeyDown={(event) => onKeyDown(index, event)}
            onChange={(event) => {
              const raw = event.target.value.replace(/\D/g, "");
              if (raw.length > 1) {
                setDigits(raw);
                focusAt(Math.min(raw.length, LENGTH) - 1);
                return;
              }
              const next = `${value.slice(0, index)}${raw}${value.slice(index + 1)}`;
              setDigits(next);
              if (raw) focusAt(index + 1);
            }}
            id={`otp-${index}`}
            className="h-12 w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white text-center font-mono text-lg text-[var(--color-foreground)] focus:border-[var(--brand-accent)] focus:outline-none focus:ring-[3px] focus:ring-[color-mix(in_srgb,var(--brand-accent)_18%,transparent)]"
          />
        ))}
      </div>
    </div>
  );
}
