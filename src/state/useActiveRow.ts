import { useCassLabStore, rowKeyString } from "./store";
import { computeHash } from "../engine/hashing";

/** Resolves the currently "active" row (shown in the reference UI's
 * ACTIVE DATA bar) plus its owning table and computed hash/token, given the
 * cluster's configured hash width. Falls back to the most recent row. */
export function useActiveRow() {
  const tables = useCassLabStore((s) => s.tables);
  const rows = useCassLabStore((s) => s.rows);
  const activeRowId = useCassLabStore((s) => s.activeRowId);
  const cluster = useCassLabStore((s) => s.cluster);

  const liveRows = rows.filter((r) => !r.tombstonedAt);
  const row = rows.find((r) => r.id === activeRowId) ?? liveRows[liveRows.length - 1];
  const table = row ? tables.find((t) => t.id === row.tableId) : undefined;
  const key = row ? rowKeyString(table, row) : undefined;
  const width = cluster?.config.hashWidth ?? 16;
  const hash = key ? computeHash(key, width) : undefined;

  return { table, row, key, hash, cluster };
}
