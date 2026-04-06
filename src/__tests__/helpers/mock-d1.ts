// ---------------------------------------------------------------------------
// In-memory D1 mock for testing
// ---------------------------------------------------------------------------
//
// A minimal mock that supports the SQL patterns used by the Cloudflare
// ingestion and reporting backends. Uses direct table manipulation for
// inserts/updates and basic SQL parsing for SELECT queries.
// ---------------------------------------------------------------------------

import type { D1Database, D1PreparedStatement, D1Result, D1ExecResult } from "../../backends/cloudflare/d1.js";

interface TableRow {
	[key: string]: string | number | null;
}

interface Table {
	rows: TableRow[];
	primaryKey: string[];
}

export function createMockD1(): D1Database & { _tables: Map<string, Table>; _reset(): void } {
	const tables = new Map<string, Table>();

	function getOrCreateTable(name: string): Table {
		let table = tables.get(name);
		if (!table) {
			table = { rows: [], primaryKey: [] };
			tables.set(name, table);
		}
		return table;
	}

	function findRowIndex(table: Table, keyValues: Record<string, unknown>): number {
		return table.rows.findIndex((row) =>
			table.primaryKey.every((col) => row[col] === keyValues[col]),
		);
	}

	// -----------------------------------------------------------------------
	// CREATE TABLE
	// -----------------------------------------------------------------------

	function parseCreateTable(sql: string): void {
		const nameMatch = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
		if (!nameMatch) return;
		const tableName = nameMatch[1];

		// Extract PRIMARY KEY columns
		const pkMatch = sql.match(/PRIMARY KEY\s*\(([^)]+)\)/i);
		const pk = pkMatch ? pkMatch[1].split(",").map((s) => s.trim()) : [];

		if (!tables.has(tableName)) {
			tables.set(tableName, { rows: [], primaryKey: pk });
		}
	}

	// -----------------------------------------------------------------------
	// INSERT
	// -----------------------------------------------------------------------

	function executeInsert(sql: string, params: unknown[]): D1Result {
		const isOrIgnore = /INSERT OR IGNORE/i.test(sql);
		const hasOnConflict = /ON CONFLICT/i.test(sql);

		// Extract table name and columns
		const tableMatch = sql.match(/INTO\s+(\w+)\s*\(([^)]+)\)/i);
		if (!tableMatch) return { success: false };

		const tableName = tableMatch[1];
		const columns = tableMatch[2].split(",").map((s) => s.trim());
		const table = getOrCreateTable(tableName);

		// Build row from params
		const newRow: TableRow = {};
		columns.forEach((col, i) => {
			newRow[col] = params[i] as string | number | null;
		});

		const existingIdx = findRowIndex(table, newRow);

		if (existingIdx >= 0) {
			if (isOrIgnore) return { success: true };
			if (hasOnConflict) {
				const existing = table.rows[existingIdx];
				applyOnConflict(sql, existing, newRow);
				return { success: true };
			}
			return { success: false };
		}

		table.rows.push(newRow);
		return { success: true };
	}

	function applyOnConflict(sql: string, existing: TableRow, excluded: TableRow): void {
		const doUpdateMatch = sql.match(/DO UPDATE SET\s+([\s\S]+)$/i);
		if (!doUpdateMatch) return;

		const assignments = splitTopLevel(doUpdateMatch[1], ",");
		for (const assignment of assignments) {
			const eqIdx = assignment.indexOf("=");
			if (eqIdx < 0) continue;
			const col = assignment.slice(0, eqIdx).trim();
			const expr = assignment.slice(eqIdx + 1).trim();

			// CASE WHEN table.col = '' THEN excluded.col ELSE table.col END
			const caseMatch = expr.match(
				/CASE\s+WHEN\s+\w+\.(\w+)\s*=\s*'([^']*)'\s+THEN\s+excluded\.(\w+)\s+ELSE\s+\w+\.(\w+)\s+END/i,
			);
			if (caseMatch) {
				existing[col] = existing[caseMatch[1]] === caseMatch[2]
					? (excluded[caseMatch[3]] ?? null)
					: (existing[caseMatch[4]] ?? null);
				continue;
			}

			// col + 1  (count = count + 1)
			const incrMatch = expr.match(/(\w+)\s*\+\s*1/);
			if (incrMatch) {
				existing[col] = ((existing[incrMatch[1]] as number) || 0) + 1;
				continue;
			}
		}
	}

	// -----------------------------------------------------------------------
	// UPDATE
	// -----------------------------------------------------------------------

	function executeUpdate(sql: string, params: unknown[]): D1Result {
		const match = sql.match(/UPDATE\s+(\w+)\s+SET\s+([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i);
		if (!match) return { success: false };

		const tableName = match[1];
		const setClause = match[2];
		const whereClause = match[3];
		const table = tables.get(tableName);
		if (!table) return { success: true };

		// Split params: count ? in SET and WHERE
		const setAssignments = splitTopLevel(setClause, ",");
		let setParamCount = 0;
		for (const a of setAssignments) {
			setParamCount += (a.match(/\?/g) || []).length;
		}

		const setParams = params.slice(0, setParamCount);
		const whereParams = params.slice(setParamCount);

		// Filter rows by WHERE
		const matchingRows = filterByWhere(table.rows, whereClause, whereParams);

		// Apply SET to matching rows
		for (const row of matchingRows) {
			let pIdx = 0;
			for (const assignment of setAssignments) {
				const eqIdx = assignment.indexOf("=");
				if (eqIdx < 0) continue;
				const col = assignment.slice(0, eqIdx).trim();
				const expr = assignment.slice(eqIdx + 1).trim();

				// col = col + ? (parameterized increment)
				if (/\w+\s*\+\s*\?/.test(expr)) {
					const srcMatch = expr.match(/(\w+)\s*\+\s*\?/);
					if (srcMatch) {
						row[col] = ((row[srcMatch[1]] as number) || 0) + (setParams[pIdx] as number);
						pIdx++;
					}
					continue;
				}

				// col = col + 1 (literal increment)
				const incrMatch = expr.match(/(\w+)\s*\+\s*(\d+)/);
				if (incrMatch) {
					row[col] = ((row[incrMatch[1]] as number) || 0) + parseInt(incrMatch[2], 10);
					continue;
				}
			}
		}

		return { success: true };
	}

	// -----------------------------------------------------------------------
	// SELECT
	// -----------------------------------------------------------------------

	function executeSelect(sql: string, params: unknown[]): D1Result {
		const fromMatch = sql.match(/FROM\s+(\w+)/i);
		if (!fromMatch) return { success: true, results: [] };

		const tableName = fromMatch[1];
		const table = tables.get(tableName);
		if (!table) return { success: true, results: [] };

		let rows = [...table.rows];
		let paramIdx = 0;

		// WHERE filtering
		const whereMatch = sql.match(/WHERE\s+([\s\S]*?)(?:\s+GROUP\s+|\s+ORDER\s+|\s+LIMIT\s+|$)/i);
		if (whereMatch) {
			const result = applyWhere(rows, whereMatch[1], params, paramIdx);
			rows = result.rows;
			paramIdx = result.nextParamIdx;
		}

		// GROUP BY / aggregation
		const groupMatch = sql.match(/GROUP BY\s+([\w.,\s]+?)(?:\s+HAVING|\s+ORDER|\s+LIMIT|$)/i);
		const hasAggregates = /\b(SUM|COUNT|COALESCE|MAX)\s*\(/i.test(sql);

		if (groupMatch || hasAggregates) {
			const groupCols = groupMatch
				? groupMatch[1].split(",").map((s) => s.trim().replace(/^\w+\./, ""))
				: [];
			rows = aggregate(sql, rows, groupCols);
		}

		// ORDER BY
		const orderMatch = sql.match(/ORDER BY\s+([\s\S]+?)(?:\s+LIMIT|$)/i);
		if (orderMatch) {
			applyOrderBy(rows, orderMatch[1]);
		}

		// LIMIT
		const limitMatch = sql.match(/LIMIT\s+\?/i);
		if (limitMatch) {
			rows = rows.slice(0, params[paramIdx++] as number);
		}

		return { success: true, results: rows };
	}

	function applyWhere(
		rows: TableRow[],
		whereClause: string,
		params: unknown[],
		startIdx: number,
	): { rows: TableRow[]; nextParamIdx: number } {
		let paramIdx = startIdx;
		const conditions = whereClause.split(/\s+AND\s+/i);

		for (const cond of conditions) {
			const trimmed = cond.trim();

			// col IN (?, ?, ...)
			const inMatch = trimmed.match(/(\w+(?:\.\w+)?)\s+IN\s*\(([^)]+)\)/i);
			if (inMatch) {
				const col = inMatch[1].replace(/^\w+\./, "");
				const placeholders = inMatch[2].split(",").map((s) => s.trim());
				const values: unknown[] = [];
				for (const p of placeholders) {
					if (p.trim() === "?") values.push(params[paramIdx++]);
				}
				rows = rows.filter((r) => values.includes(r[col]));
				continue;
			}

			// col >= ?
			const gteMatch = trimmed.match(/(\w+(?:\.\w+)?)\s*>=\s*\?/);
			if (gteMatch) {
				const col = gteMatch[1].replace(/^\w+\./, "");
				const val = params[paramIdx++];
				rows = rows.filter((r) => (r[col] ?? "") >= (val as string | number));
				continue;
			}

			// col <= ?
			const lteMatch = trimmed.match(/(\w+(?:\.\w+)?)\s*<=\s*\?/);
			if (lteMatch) {
				const col = lteMatch[1].replace(/^\w+\./, "");
				const val = params[paramIdx++];
				rows = rows.filter((r) => (r[col] ?? "") <= (val as string | number));
				continue;
			}

			// col = ?
			const eqMatch = trimmed.match(/(\w+(?:\.\w+)?)\s*=\s*\?/);
			if (eqMatch) {
				const col = eqMatch[1].replace(/^\w+\./, "");
				const val = params[paramIdx++];
				rows = rows.filter((r) => r[col] === val);
				continue;
			}
		}

		return { rows, nextParamIdx: paramIdx };
	}

	function aggregate(sql: string, rows: TableRow[], groupCols: string[]): TableRow[] {
		// Build groups
		const groups = new Map<string, TableRow[]>();

		if (groupCols.length === 0) {
			groups.set("__all__", rows);
		} else {
			for (const row of rows) {
				const key = groupCols.map((c) => String(row[c] ?? "")).join("\x00");
				const group = groups.get(key) ?? [];
				group.push(row);
				groups.set(key, group);
			}
		}

		if (groups.size === 0 && groupCols.length === 0) {
			// No rows, but we still need to return a single row with zeros for aggregates
			groups.set("__all__", []);
		}

		const selectMatch = sql.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
		if (!selectMatch) return [];

		const selectItems = splitTopLevel(selectMatch[1], ",");
		const result: TableRow[] = [];

		for (const groupRows of groups.values()) {
			const outRow: TableRow = {};

			// Copy group columns from first row
			if (groupRows.length > 0) {
				for (const col of groupCols) {
					outRow[col] = groupRows[0][col] ?? null;
				}
			}

			for (const item of selectItems) {
				const aliasMatch = item.match(/\s+as\s+(\w+)\s*$/i);
				const alias = aliasMatch ? aliasMatch[1] : null;
				const expr = (aliasMatch ? item.slice(0, aliasMatch.index) : item).trim();

				// COALESCE(SUM(col), default)
				const coalesceSumMatch = expr.match(/COALESCE\s*\(\s*SUM\s*\(\s*(\w+)\s*\)\s*,\s*(\d+)\s*\)/i);
				if (coalesceSumMatch) {
					const col = coalesceSumMatch[1];
					const def = parseInt(coalesceSumMatch[2], 10);
					const sum = groupRows.reduce((s, r) => s + ((r[col] as number) || 0), 0);
					outRow[alias ?? col] = groupRows.length === 0 ? def : sum;
					continue;
				}

				// SUM(col)
				const sumMatch = expr.match(/^SUM\s*\(\s*(\w+)\s*\)$/i);
				if (sumMatch) {
					const col = sumMatch[1];
					outRow[alias ?? col] = groupRows.reduce((s, r) => s + ((r[col] as number) || 0), 0);
					continue;
				}

				// COUNT(DISTINCT col)
				const countDistinctMatch = expr.match(/COUNT\s*\(\s*DISTINCT\s+(\w+)\s*\)/i);
				if (countDistinctMatch) {
					const col = countDistinctMatch[1];
					const distinct = new Set(groupRows.map((r) => r[col]).filter((v) => v != null));
					outRow[alias ?? "count"] = distinct.size;
					continue;
				}

				// MAX(col)
				const maxMatch = expr.match(/^MAX\s*\(\s*(\w+)\s*\)$/i);
				if (maxMatch) {
					const col = maxMatch[1];
					let max: string | number | null = null;
					for (const r of groupRows) {
						const v = r[col];
						if (v != null && (max === null || v > max)) max = v;
					}
					outRow[alias ?? col] = max ?? "";
					continue;
				}

				// Plain column (possibly qualified: table.col)
				const plainCol = expr.replace(/^\w+\./, "");
				if (!(/\(/.test(expr)) && groupRows.length > 0) {
					outRow[alias ?? plainCol] = groupRows[0][plainCol] ?? null;
				}
			}

			result.push(outRow);
		}

		return result;
	}

	function applyOrderBy(rows: TableRow[], orderClause: string): void {
		const parts = orderClause.split(",").map((s) => s.trim());
		// Apply in reverse order for stable multi-column sort
		for (const part of parts.reverse()) {
			const tokens = part.split(/\s+/);
			const col = tokens[0].replace(/^\w+\./, "");
			const desc = tokens[1]?.toUpperCase() === "DESC";
			rows.sort((a, b) => {
				const va = a[col] ?? 0;
				const vb = b[col] ?? 0;
				if (va < vb) return desc ? 1 : -1;
				if (va > vb) return desc ? -1 : 1;
				return 0;
			});
		}
	}

	// -----------------------------------------------------------------------
	// Utilities
	// -----------------------------------------------------------------------

	function splitTopLevel(str: string, delimiter: string): string[] {
		const results: string[] = [];
		let depth = 0;
		let current = "";
		for (const ch of str) {
			if (ch === "(") depth++;
			else if (ch === ")") depth--;
			else if (ch === delimiter && depth === 0) {
				results.push(current.trim());
				current = "";
				continue;
			}
			current += ch;
		}
		if (current.trim()) results.push(current.trim());
		return results;
	}

	function filterByWhere(rows: TableRow[], whereClause: string, params: unknown[]): TableRow[] {
		const conditions = whereClause.split(/\s+AND\s+/i);
		let paramIdx = 0;
		let filtered = rows;

		for (const cond of conditions) {
			const trimmed = cond.trim();
			const eqMatch = trimmed.match(/(\w+)\s*=\s*\?/);
			if (eqMatch) {
				const col = eqMatch[1];
				const val = params[paramIdx++];
				filtered = filtered.filter((r) => r[col] === val);
			}
		}

		return filtered;
	}

	// -----------------------------------------------------------------------
	// Statement execution dispatcher
	// -----------------------------------------------------------------------

	function executeStatement(sql: string, params: unknown[]): D1Result {
		const trimmed = sql.trim();
		if (/^CREATE TABLE/i.test(trimmed)) {
			parseCreateTable(trimmed);
			return { success: true };
		}
		if (/^INSERT/i.test(trimmed)) return executeInsert(trimmed, params);
		if (/^UPDATE/i.test(trimmed)) return executeUpdate(trimmed, params);
		if (/^SELECT/i.test(trimmed)) return executeSelect(trimmed, params);
		return { success: true };
	}

	function createPreparedStatement(sql: string): D1PreparedStatement {
		let boundParams: unknown[] = [];

		const stmt: D1PreparedStatement = {
			bind(...values: unknown[]) {
				boundParams = values;
				return stmt;
			},
			async first<T>(colName?: string): Promise<T | null> {
				const result = executeStatement(sql, boundParams);
				const rows = result.results as TableRow[] | undefined;
				if (!rows?.length) return null;
				if (colName) return (rows[0][colName] ?? null) as T;
				return rows[0] as T;
			},
			async run<T>(): Promise<D1Result<T>> {
				return executeStatement(sql, boundParams) as D1Result<T>;
			},
			async all<T>(): Promise<D1Result<T>> {
				return executeStatement(sql, boundParams) as D1Result<T>;
			},
		};

		return stmt;
	}

	return {
		prepare(query: string) {
			return createPreparedStatement(query);
		},
		async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
			const results: D1Result<T>[] = [];
			for (const stmt of statements) {
				results.push(await stmt.run<T>());
			}
			return results;
		},
		async exec(query: string): Promise<D1ExecResult> {
			const statements = query.split(";").map((s) => s.trim()).filter(Boolean);
			for (const sql of statements) {
				executeStatement(sql, []);
			}
			return { count: statements.length, duration: 0 };
		},
		_tables: tables,
		_reset() {
			tables.clear();
		},
	};
}
