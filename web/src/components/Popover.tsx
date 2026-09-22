import { useEffect, useId, useRef, useState, type ReactNode } from "react";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A small non-modal popover anchored to its trigger button (disclosure pattern).
 *
 * Keyboard contract: opening moves focus to the first control inside; Esc closes and returns focus
 * to the trigger; tabbing out or clicking elsewhere closes without stealing focus back.
 */
export function Popover({
  label,
  buttonClassName,
  buttonContent,
  title,
  children,
}: {
  /** Accessible name for both the trigger and the panel. */
  label: string;
  buttonClassName?: string;
  buttonContent: ReactNode;
  title?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <span
      ref={wrap}
      className="popover-wrap"
      onBlur={(e) => {
        // Focus left the whole widget (Tab past the last control): close quietly.
        if (open && !wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={buttonClassName}
        aria-label={label}
        title={title ?? label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {buttonContent}
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label={label}
          className="popover"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
        >
          {children(() => close())}
        </div>
      )}
    </span>
  );
}
