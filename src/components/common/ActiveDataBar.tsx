import { useCassLabStore, rowDisplayLabel } from "../../state/store";
import { useActiveRow } from "../../state/useActiveRow";

export function ActiveDataBar() {
  const { table, row, key, hash } = useActiveRow();
  const allRows = useCassLabStore((s) => s.rows);
  const rows = allRows.filter((r) => !r.tombstonedAt);
  const tables = useCassLabStore((s) => s.tables);
  const setActiveRowId = useCassLabStore((s) => s.setActiveRowId);

  if (!row || !key) {
    return (
      <div className="active-data-bar">
        <span className="hint">No active data. Insert a row in the Insertion module first.</span>
      </div>
    );
  }

  return (
    <div className="active-data-bar">
      <div>
        <span className="active-data-label">Active Data</span>
        {rows.length > 1 ? (
          <select value={row.id} onChange={(e) => setActiveRowId(e.target.value)}>
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {rowDisplayLabel(tables.find((t) => t.id === r.tableId), r)}
              </option>
            ))}
          </select>
        ) : (
          <strong>{rowDisplayLabel(table, row)}</strong>
        )}
        {table && <span className="hint"> — table {table.name}</span>}
      </div>
      {hash && (
        <span className="mono badge badge-info">
          Token: {hash.token.toString()}
        </span>
      )}
    </div>
  );
}
