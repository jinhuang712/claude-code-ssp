import { useEffect, useRef, useState } from "react";

/**
 * Text input that keeps a local draft while focused.
 *
 * Driving the value straight from the store re-renders the whole config on every keystroke, which
 * interrupts IME composition (Chinese/Japanese input) and can swallow characters. The store is still
 * updated on every change; the draft just owns the caret until focus leaves.
 */
export function TextField({
  value,
  onChange,
  className,
  disabled,
  placeholder,
  ariaLabel,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  return (
    <input
      className={className}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      id={id}
      value={draft}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setDraft(value);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}
