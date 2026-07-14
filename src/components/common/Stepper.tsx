import { Fragment } from "react";
import type { OperationStep } from "../../domain/types";

interface StepperProps {
  steps: OperationStep[];
  activeIndex: number;
  onChange: (index: number) => void;
  accent?: string;
}

export function Stepper({ steps, activeIndex, onChange, accent }: StepperProps) {
  const current = steps[activeIndex];
  return (
    <div className="stepper" style={accent ? ({ ["--stepper-accent" as string]: accent }) : undefined}>
      <div className="stepper-track">
        {steps.map((step, i) => (
          <Fragment key={step.key}>
            <button
              className={`stepper-node ${i < activeIndex ? "done" : ""} ${i === activeIndex ? "current" : ""}`}
              onClick={() => onChange(i)}
              title={step.label}
            >
              {i < activeIndex ? "✓" : i + 1}
            </button>
            {i < steps.length - 1 && <span className={`stepper-line ${i < activeIndex ? "done" : ""}`} />}
          </Fragment>
        ))}
      </div>
      <div className="stepper-labels">
        {steps.map((step, i) => (
          <span key={step.key} className={i === activeIndex ? "current" : ""}>
            {step.label}
          </span>
        ))}
      </div>
      {current && (
        <div className="stepper-description">
          <div className="stepper-description-text">
            <strong>{current.label} — </strong>
            {current.description}
          </div>
          <div className="stepper-controls">
            <button className="btn" disabled={activeIndex === 0} onClick={() => onChange(activeIndex - 1)}>
              ◀ Prev
            </button>
            <button
              className="btn btn-primary"
              disabled={activeIndex === steps.length - 1}
              onClick={() => onChange(activeIndex + 1)}
            >
              Next ▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
