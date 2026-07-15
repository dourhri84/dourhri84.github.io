import { useEffect, useRef, useState, type ReactNode } from "react";
import { tooltipFor } from "../../data/tooltips";

interface TooltipProps {
  term: string;
  children?: ReactNode;
}

/**
 * Click-to-toggle tooltip (also shows on hover/focus for desktop mouse
 * users). Many terms are rendered inside a <label> for a form control —
 * relying on CSS :hover/:focus alone breaks there, because clicking the
 * label shifts focus to the associated input/select instead of this span.
 * Toggling via state, and stopping the click from reaching the label,
 * makes it work reliably on click and on touch devices too.
 */
export function Tooltip({ term, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const text = tooltipFor(term);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [open]);

  if (!text) return <>{children ?? term}</>;

  return (
    <span
      ref={ref}
      className={`tooltip-term ${open ? "open" : ""}`}
      tabIndex={0}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => !o);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((o) => !o);
        } else if (e.key === "Escape") {
          setOpen(false);
        }
      }}
    >
      {children ?? term}
      <span className="tooltip-bubble">
        <strong>{term}</strong>
        <br />
        {text}
      </span>
    </span>
  );
}
