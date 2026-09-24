import { useEffect, useId, useRef, useState, type ReactNode } from "react";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A small non-modal popover anchored to its trigger button (disclosure pattern).
 *
 * Keyboard contract: opening from the keyboard moves focus to the first control inside; opening
 * with the pointer focuses the panel itself (so Esc and Tab still work from there) — giving the
 * first control focus after a click drew its focus ring, and a select nobody chose looked selected.
 * Esc closes and returns focus to the trigger; tabbing out or clicking elsewhere closes without
 * stealing focus back.
 */
export function Popover({
  label,
  buttonClassName,
  buttonContent,
  title,
  align = "start",
  children,
}: {
  /** Accessible name for both the trigger and the panel. */
  label: string;
  buttonClassName?: string;
  buttonContent: ReactNode;
  title?: string;
  /** Which trigger edge the panel lines up with; "end" keeps a panel opened at the right edge on screen. */
  align?: "start" | "end";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  /** Whether the last open came from Enter/Space on the trigger rather than a pointer click. */
  const byKeyboard = useRef(false);
  const id = useId();

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // Keep the panel on screen: `align` picks the edge, but on a phone the trigger can sit anywhere
    // once toolbars wrap, so nudge the panel back inside an 8px margin if it still hangs over.
    const el = panel.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const shift = r.left < 8 ? 8 - r.left : r.right > window.innerWidth - 8 ? window.innerWidth - 8 - r.right : 0;
      if (shift) el.style.transform = `translateX(${Math.round(shift)}px)`;
    }
    if (byKeyboard.current) panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    else panel.current?.focus();
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
        onClick={(e) => {
          // A click synthesized from Enter/Space has no pointer press behind it: detail is 0.
          byKeyboard.current = e.detail === 0;
          setOpen((v) => !v);
        }}
      >
        {buttonContent}
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label={label}
          // Focusable by script only: the landing spot after a pointer open (see the contract above).
          tabIndex={-1}
          className="popover"
          data-align={align}
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
