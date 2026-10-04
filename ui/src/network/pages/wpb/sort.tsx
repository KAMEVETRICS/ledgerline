import type { SortState } from "./format";

export function SortTh({
  label,
  col,
  sort,
  onSort,
  first = "desc",
  numeric,
}: {
  label: string;
  col: string;
  sort: SortState;
  onSort: (col: string, first: "asc" | "desc") => void;
  first?: "asc" | "desc";
  numeric?: boolean;
}) {
  const active = sort.col === col;
  const aria = active ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th className={numeric ? "r" : undefined} aria-sort={aria} scope="col">
      <button type="button" className="wpb-th" onClick={() => onSort(col, first)}>
        {label}
        {active ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}
