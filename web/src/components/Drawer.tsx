import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Side drawer (modal dialog), used by Diagnostics (widget options open in place instead). It opens below the
 * sticky preview so every change stays visible while it is made.
 *
 * Keyboard contract (WAI-ARIA dialog): focus moves inside on open (to an `autoFocus` element if the
 * content has one, else the first control), Tab/Shift+Tab cycle within, Esc closes from anywhere,
 * and focus returns to whatever opened the drawer.
 */
export function Drawer({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  // Remember the opener at mount so focus can go back to it on close.
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);

  useEffect(() => {
    const el = panel.current;
    if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const back = opener.current;
    return () => {
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    };
  }, []);

  // Esc is handled on the window so it works even when focus drifted to the page (e.g. a click on
  // the preview toolbar, which stays usable while a drawer is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        ref={panel}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== "Tab" || !panel.current) return;
          const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
          if (items.length === 0) return;
          const first = items[0]!;
          const last = items[items.length - 1]!;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        {children}
      </aside>
    </div>
  );
}
