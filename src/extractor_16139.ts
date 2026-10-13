import fs from "fs";
import PDFParser from "pdf2json";
import { parseContasTxt, ContasBlock } from "./parse_contas.js";
import { Discrepancy, BlockError, ExtractionResult, MONTHS } from "./types.js";

const CODE_RE = /^\d+(\.\d+){3,}$/;
const VALUE_RE = /^-?[\d.]+,\d{2}$/;
const OVERFLOW_RE = /^\*+$/;

export function toNumber(raw: string): number | null {
  if (!raw) return null;
  if (OVERFLOW_RE.test(raw)) return null;
  const txt = raw.replace(/\./g, "").replace(",", ".");
  const val = parseFloat(txt);
  return isNaN(val) ? null : val;
}

interface Word {
  text: string;
  x: number;
  y: number;
}

function clusterRows(words: Word[], gap = 0.3): Word[][] {
  words.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 0.001) {
      return a.y - b.y;
    }
    return a.x - b.x;
  });

  const rows: Word[][] = [];
  let current: Word[] = [];
  let lastY: number | null = null;

  for (const w of words) {
    if (lastY === null || Math.abs(w.y - lastY) <= gap) {
      current.push(w);
    } else {
      rows.push(current);
      current = [w];
    }
    lastY = w.y;
  }
  if (current.length > 0) {
    rows.push(current);
  }
  return rows;
}

export function safeDecodeURIComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch (e) {
    try {
      return decodeURIComponent(str.replace(/%(?![0-9a-fA-F]{2})/g, "%25"));
    } catch (e2) {
      return str;
    }
  }
}

export function extractCodeRows(page: any): { code: string; values: string[]; y: number }[] {
  const words: Word[] = [];
  for (const t of page.Texts || []) {
    const decoded = safeDecodeURIComponent(t.R[0].T);
    const swords = decoded.split(/\s+/).filter(Boolean);
    if (swords.length === 1) {
      words.push({ text: swords[0], x: t.x, y: t.y });
    } else {
      const totalW = t.w || 0;
      const step = swords.length > 1 ? totalW / (swords.length - 1) : 0;
      swords.forEach((word, idx) => {
        words.push({ text: word, x: t.x + idx * step, y: t.y });
      });
    }
  }

  const rows = clusterRows(words, 0.3);
  const result: { code: string; values: string[]; y: number }[] = [];

  for (const row of rows) {
    const codeTokens = row.filter(w => CODE_RE.test(w.text)).map(w => w.text);
    if (codeTokens.length === 0) continue;

    const valueWords = row.filter(w => VALUE_RE.test(w.text) || OVERFLOW_RE.test(w.text));
    if (valueWords.length === 0) continue;

    valueWords.sort((a, b) => a.x - b.x);

    const values = valueWords.map(w => w.text);
    const minY = Math.min(...row.map(w => w.y));

    result.push({ code: codeTokens[0], values, y: minY });
  }

  return result;
}

export function parsePdfAsync(pdfPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    pdfParser.on("pdfParser_dataError", (errData: any) => {
      reject(errData.parserError);
    });
    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      resolve(pdfData);
    });
    pdfParser.loadPDF(pdfPath);
  });
}

export async function extractReport(
  pdfPath: string,
  contasPath: string,
  tolerance = 0.02,
  progressCb?: (
    blockIndex: number,
    blockTotal: number,
    pageRange: [number, number],
    blockError: string | null,
    blockDiscrepancies: Discrepancy[],
    rowsSoFar: number
  ) => void
): Promise<ExtractionResult> {
  const blocks = parseContasTxt(contasPath);
  const pdfData = await parsePdfAsync(pdfPath);

  const totalPages = pdfData.Pages.length;
  const blocksTotal = blocks.length;

  // Extract emission date from the first page text elements
  let emissionDate: string | null = null;
  if (pdfData.Pages[0]) {
    const firstPageTexts = pdfData.Pages[0].Texts.map((t: any) => safeDecodeURIComponent(t.R[0].T)).join(" ");
    const match = firstPageTexts.match(/Emitido\s+em\s+(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})/i);
    if (match) emissionDate = match[1];
  }

  const result: ExtractionResult = {
    rows: [],
    discrepancies: [],
    emission_date: emissionDate,
    total_pages: totalPages,
    blocks_ok: 0,
    blocks_total: blocksTotal,
    page_block_errors: [],
  };

  let rowCounter = 0;

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex];
    const [p0, p1] = block.pages;

    if (p1 > totalPages) {
      const err = `Bloco de páginas ${p0}-${p1} está fora do intervalo do PDF (${totalPages} páginas).`;
      result.page_block_errors.push(err);
      if (progressCb) {
        progressCb(blockIndex + 1, blocksTotal, [p0, p1], err, [], result.rows.length);
      }
      continue;
    }

    const page1Rows = extractCodeRows(pdfData.Pages[p0 - 1]); // JAN-ABR
    const page2Rows = extractCodeRows(pdfData.Pages[p0]);     // MAI-AGO
    const page3Rows = extractCodeRows(pdfData.Pages[p0 + 1]); // SET-DEZ + TOTAL

    const nExpected = block.rows.length;
    const nFound = [page1Rows.length, page2Rows.length, page3Rows.length];

    let blockError: string | null = null;
    let n = nExpected;

    if (!(nFound[0] === nExpected && nFound[1] === nExpected && nFound[2] === nExpected)) {
      blockError = `Bloco de páginas ${p0}-${p1}: esperado ${nExpected} contas, encontrado [${nFound.join(", ")}] nas páginas ${p0}/${p0+1}/${p0+2}.`;
      result.page_block_errors.push(blockError);
      n = Math.min(nExpected, ...nFound);
    } else {
      result.blocks_ok++;
    }

    const blockDiscrepancies: Discrepancy[] = [];

    for (let i = 0; i < n; i++) {
      const meta = block.rows[i];
      const vals1 = page1Rows[i] ? page1Rows[i].values : [];
      const vals2 = page2Rows[i] ? page2Rows[i].values : [];
      const vals3 = page3Rows[i] ? page3Rows[i].values : [];

      let allVals = [...vals1, ...vals2, ...vals3];
      if (allVals.length < 39) {
        allVals = [...allVals, ...Array(39 - allVals.length).fill("")];
      } else if (allVals.length > 39) {
        allVals = allVals.slice(0, 39);
      }

      const rowOut: any = {
        Tipo: meta.tipo,
        Detalhe: meta.detalhe,
        Grupo: meta.grupo,
        Subgrupo: meta.subgrupo,
        "Conta Contábil": meta.conta,
        _source_pages: [p0, p0 + 1, p0 + 2],
        _row_index: rowCounter,
      };

      let idx = 0;
      for (const m of MONTHS) {
        rowOut[`Pactuado-${m}`] = allVals[idx++];
        rowOut[`Executado-${m}`] = allVals[idx++];
        rowOut[`%Exec-${m}`] = allVals[idx++];
      }

      rowOut["Pactuado-TOTAL"] = allVals[idx++];
      rowOut["Executado-TOTAL"] = allVals[idx++];
      rowOut["%Exec-TOTAL"] = allVals[idx++];

      result.rows.push(rowOut);

      // --- Sum validation: sum(months) == total
      for (const metric of ["Pactuado", "Executado"]) {
        const monthVals = MONTHS.map(m => toNumber(rowOut[`${metric}-${m}`]));
        const totalVal = toNumber(rowOut[`${metric}-TOTAL`]);

        if (monthVals.some(v => v === null) || totalVal === null) {
          continue;
        }

        const computed = Math.round(monthVals.reduce((sum, v) => sum! + v!, 0) * 100) / 100;
        if (Math.abs(computed - totalVal) > tolerance) {
          const disc: Discrepancy = {
            row_index: rowCounter,
            conta: meta.conta,
            field: `${metric}-TOTAL`,
            expected: computed,
            found: totalVal,
            diff: Math.round((totalVal - computed) * 100) / 100,
            message: `Soma de ${metric} (Jan..Dez) = ${computed.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} mas coluna TOTAL = ${totalVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (dif. ${(totalVal - computed).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`,
            pages: [p0, p0 + 1, p0 + 2],
          };
          result.discrepancies.push(disc);
          blockDiscrepancies.push(disc);
        }
      }

      // --- %Exec validation: %Exec = Executado / Pactuado * 100
      for (const m of [...MONTHS, "TOTAL"]) {
        const p = toNumber(rowOut[`Pactuado-${m}`]);
        const e = toNumber(rowOut[`Executado-${m}`]);
        const pcVal = toNumber(rowOut[`%Exec-${m}`]);

        if (p === null || e === null || pcVal === null) {
          continue;
        }
        if (p === 0) continue; // Skip when pactuado is 0

        const expectedPct = Math.round((e / p * 100) * 100) / 100;
        if (Math.abs(expectedPct - pcVal) > 0.5) {
          const disc: Discrepancy = {
            row_index: rowCounter,
            conta: meta.conta,
            field: `%Exec-${m}`,
            expected: expectedPct,
            found: pcVal,
            diff: Math.round((pcVal - expectedPct) * 100) / 100,
            message: `%Exec-${m} esperado ≈${expectedPct.toFixed(2)}% (Executado/Pactuado) mas encontrado ${pcVal.toFixed(2)}%`,
            pages: [p0, p0 + 1, p0 + 2],
          };
          result.discrepancies.push(disc);
          blockDiscrepancies.push(disc);
        }
      }

      rowCounter++;
    }

    if (progressCb) {
      progressCb(
        blockIndex + 1,
        blocksTotal,
        [p0, p1],
        blockError,
        blockDiscrepancies,
        result.rows.length
      );
    }
  }

  return result;
}

