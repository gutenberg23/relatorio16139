import { ExtractionResult, TreeNode, LeafRow, CSV_COLUMNS, MONTHS, MonthData } from "./types.js";
import { toNumber } from "./extractor_16139.js";

export function writeCsv(result: ExtractionResult, uf?: string, ano?: string): string {
  /**
   * Serializes the extracted rows to CSV with ';' delimiter and a UTF-8 BOM
   * prefix so that it opens cleanly in Portuguese Excel (PT-BR locale).
   * Includes 'UF' and 'Ano' columns when provided.
   */
  const columns = (uf && ano) ? ["UF", "Ano", ...CSV_COLUMNS] : CSV_COLUMNS;
  const headers = columns.join(";");
  const lines = [headers];

  for (const r of result.rows) {
    const values: string[] = [];
    if (uf && ano) {
      values.push(uf, ano);
    }

    for (const col of CSV_COLUMNS) {
      const val = r[col];
      if (val === undefined || val === null) {
        values.push("");
        continue;
      }
      // Escape semicolons and double quotes if present, but since these are numeric or specific categories, standard string mapping is fine
      const str = String(val);
      if (str.includes(";") || str.includes("\"") || str.includes("\n")) {
        values.push(`"${str.replace(/"/g, '""')}"`);
      } else {
        values.push(str);
      }
    }
    lines.push(values.join(";"));
  }

  // Prepend the UTF-8 BOM
  return "\ufeff" + lines.join("\r\n");
}

function emptyNode(name: string, level: string): TreeNode {
  const months: Record<string, MonthData> = {};
  for (const m of MONTHS) {
    months[m] = { pactuado: 0.0, executado: 0.0, pct_exec: 0.0 };
  }

  return {
    name,
    level,
    children: [], // Temporarily treated as dictionary then mapped to list during rollup
    leaf_rows: [],
    pactuado_total: 0.0,
    executado_total: 0.0,
    pct_exec_total: 0.0,
    months,
  };
}

export function buildTree(result: ExtractionResult): any {
  /**
   * Builds a nested Tipo -> Detalhe -> Grupo -> Subgrupo hierarchy and accumulates Pactuado-TOTAL and Executado-TOTAL values.
   */
  // We'll use intermediate dictionary maps for children during building
  const root: any = emptyNode("ROOT", "root");
  root.childrenMap = {};

  for (const r of result.rows) {
    const tipo = r["Tipo"];
    const detalhe = r["Detalhe"];
    const grupo = r["Grupo"];
    const subgrupo = r["Subgrupo"];

    let node = root;

    const path = [
      { key: tipo, level: "tipo" },
      { key: detalhe, level: "detalhe" },
      { key: grupo, level: "grupo" },
      { key: subgrupo, level: "subgrupo" },
    ];

    for (const step of path) {
      if (!node.childrenMap) {
        node.childrenMap = {};
      }
      if (!node.childrenMap[step.key]) {
        const child = emptyNode(step.key, step.level);
        child.children = [];
        (child as any).childrenMap = {};
        node.childrenMap[step.key] = child;
      }
      node = node.childrenMap[step.key];
    }

    const pac = toNumber(r["Pactuado-TOTAL"]) || 0.0;
    const exe = toNumber(r["Executado-TOTAL"]) || 0.0;

    const rowMonths: Record<string, MonthData> = {};
    for (const m of MONTHS) {
      rowMonths[m] = {
        pactuado: toNumber(r[`Pactuado-${m}`]) || 0.0,
        executado: toNumber(r[`Executado-${m}`]) || 0.0,
        pct_exec: toNumber(r[`%Exec-${m}`]) || 0.0,
      };
    }

    node.leaf_rows.push({
      conta: r["Conta Contábil"],
      pactuado_total: pac,
      executado_total: exe,
      pct_exec_total: r["%Exec-TOTAL"],
      row_index: r["_row_index"],
      months: rowMonths,
    });
  }

  function rollup(node: any) {
    let pacSum = node.leaf_rows.reduce((sum: number, l: LeafRow) => sum + l.pactuado_total, 0.0);
    let exeSum = node.leaf_rows.reduce((sum: number, l: LeafRow) => sum + l.executado_total, 0.0);

    const monthSums: Record<string, { pactuado: number, executado: number }> = {};
    for (const m of MONTHS) {
      monthSums[m] = {
        pactuado: node.leaf_rows.reduce((sum: number, l: LeafRow) => sum + l.months[m].pactuado, 0.0),
        executado: node.leaf_rows.reduce((sum: number, l: LeafRow) => sum + l.months[m].executado, 0.0),
      };
    }

    const childrenKeys = Object.keys(node.childrenMap || {});
    const childrenList = [];

    for (const key of childrenKeys) {
      const child = node.childrenMap[key];
      rollup(child);
      pacSum += child.pactuado_total;
      exeSum += child.executado_total;
      for (const m of MONTHS) {
        monthSums[m].pactuado += child.months[m].pactuado;
        monthSums[m].executado += child.months[m].executado;
      }
      childrenList.push(child);
    }

    node.children = childrenList;
    delete node.childrenMap; // Clean up intermediate map

    node.pactuado_total = Math.round(pacSum * 100) / 100;
    node.executado_total = Math.round(exeSum * 100) / 100;
    node.pct_exec_total = pacSum > 0 ? Math.round((exeSum / pacSum * 100) * 100) / 100 : 0.0;
    
    for (const m of MONTHS) {
      node.months[m].pactuado = Math.round(monthSums[m].pactuado * 100) / 100;
      node.months[m].executado = Math.round(monthSums[m].executado * 100) / 100;
      node.months[m].pct_exec = monthSums[m].pactuado > 0 
        ? Math.round((monthSums[m].executado / monthSums[m].pactuado * 100) * 100) / 100 
        : 0.0;
    }
  }

  rollup(root);
  return root;
}
