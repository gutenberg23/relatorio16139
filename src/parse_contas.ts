import fs from "fs";

export interface ParsedContasRow {
  tipo: string;
  detalhe: string;
  grupo: string;
  subgrupo: string;
  conta: string;
}

export interface ContasBlock {
  pages: [number, number];
  rows: ParsedContasRow[];
}

const CODE_PREFIX_RE = /^\d+(\.\d+){3,}\s*-/;

export function parseContasTxt(path: string): ContasBlock[] {
  let raw = "";
  try {
    raw = fs.readFileSync(path, "utf-8");
  } catch (err) {
    console.error("Error reading mapping file: " + path, err);
    throw err;
  }

  raw = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks: { pages: [number, number]; rows: ParsedContasRow[] }[] = [];
  let currentPages: [number, number] | null = null;
  let currentRows: ParsedContasRow[] = [];

  const headerRe = /PÁGINAS\s+(\d+)\s+A\s+(\d+)/i;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const m = trimmed.match(headerRe);
    if (m) {
      if (currentPages !== null) {
        blocks.push({ pages: currentPages, rows: currentRows });
      }
      currentPages = [parseInt(m[1], 10), parseInt(m[2], 10)];
      currentRows = [];
      continue;
    }

    if (trimmed.includes(">")) {
      const parts = trimmed.split(">").map(p => p.trim());
      let tipo = "";
      let detalhe = "";
      let grupo = "";
      let subgrupo = "";
      let conta = "";

      if (parts.length >= 5) {
        tipo = parts[0];
        detalhe = parts[1];
        grupo = parts[2];
        subgrupo = parts[3];
        conta = parts.slice(4).join(" > ").trim();
      } else {
        // Pad
        const padded = [...parts, "", "", "", "", ""].slice(0, 5);
        tipo = padded[0];
        detalhe = padded[1];
        grupo = padded[2];
        subgrupo = padded[3];
        conta = padded[4];
      }

      currentRows.push({ tipo, detalhe, grupo, subgrupo, conta });
    }
  }

  if (currentPages !== null) {
    blocks.push({ pages: currentPages, rows: currentRows });
  }

  return fixAnomalies(blocks);
}

function fixAnomalies(blocks: { pages: [number, number]; rows: ParsedContasRow[] }[]): ContasBlock[] {
  const fixed: ContasBlock[] = [];
  let prevLastRow: ParsedContasRow | null = null;

  for (const { pages, rows } of blocks) {
    const newRows: ParsedContasRow[] = [];
    for (const r of rows) {
      const conta = r.conta.trim();
      const subgrupo = r.subgrupo.trim();

      if (!conta && CODE_PREFIX_RE.test(subgrupo)) {
        // level was collapsed: subgrupo actually holds the conta
        const cloned = { ...r };
        cloned.conta = subgrupo;
        cloned.subgrupo = r.grupo;
        newRows.push(cloned);
        prevLastRow = cloned;
        continue;
      }

      if (conta && !CODE_PREFIX_RE.test(conta)) {
        // pure continuation text with no code -> merge into previous row
        if (prevLastRow !== null) {
          prevLastRow.conta = (prevLastRow.conta.trim() + " " + conta).trim();
        }
        continue;
      }

      newRows.push(r);
      prevLastRow = r;
    }
    fixed.push({ pages, rows: newRows });
  }

  return fixed;
}
