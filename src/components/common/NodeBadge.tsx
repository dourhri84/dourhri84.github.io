interface NodeBadgeProps {
  status: "UP" | "DOWN";
}

export function NodeBadge({ status }: NodeBadgeProps) {
  return <span className={`badge ${status === "UP" ? "badge-success" : "badge-danger"}`}>{status}</span>;
}
