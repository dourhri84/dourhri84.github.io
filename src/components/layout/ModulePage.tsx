import type { ReactNode } from "react";

interface ModulePageProps {
  title: string;
  description?: ReactNode;
  canvas: ReactNode;
  panel: ReactNode;
}

/**
 * Standard two-column module page: simulation canvas (center zone) + a
 * Parameters panel (right zone), per cahier des charges §I.8. The
 * surrounding Navigation (left) and Event Log (bottom) zones live in
 * AppShell and wrap every module page.
 */
export function ModulePage({ title, description, canvas, panel }: ModulePageProps) {
  return (
    <div className="module-page">
      <div className="module-page-header">
        <h2>{title}</h2>
        {description && <p className="module-page-description">{description}</p>}
      </div>
      <div className="module-page-body">
        <div className="module-page-canvas card">{canvas}</div>
        <div className="module-page-panel card">{panel}</div>
      </div>
    </div>
  );
}
