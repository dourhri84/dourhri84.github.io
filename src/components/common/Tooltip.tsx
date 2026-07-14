import type { ReactNode } from "react";
import { tooltipFor } from "../../data/tooltips";

interface TooltipProps {
  term: string;
  children?: ReactNode;
}

export function Tooltip({ term, children }: TooltipProps) {
  const text = tooltipFor(term);
  if (!text) return <>{children ?? term}</>;
  return (
    <span className="tooltip-term" tabIndex={0}>
      {children ?? term}
      <span className="tooltip-bubble">
        <strong>{term}</strong>
        <br />
        {text}
      </span>
    </span>
  );
}
