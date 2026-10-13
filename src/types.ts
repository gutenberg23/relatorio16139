export interface Discrepancy {
  row_index: number;
  conta: string;
  field: string;
  expected: number;
  found: number;
  diff: number;
  message: string;
  pages: number[];
}

export interface BlockError {
  pages: number[];
  message: string;
}

export interface ExtractionResult {
  rows: any[];
  discrepancies: Discrepancy[];
  emission_date: string | null;
  total_pages: number;
  blocks_ok: number;
  blocks_total: number;
  page_block_errors: string[];
}

export interface Job {
  id: string;
  extraction_type: string;
  filename: string;
  status: "queued" | "processing" | "done" | "error";
  created_at: string;
  block_index: number;
  block_total: number;
  rows_so_far: number;
  blocks_ok: number;
  discrepancies: Discrepancy[];
  block_errors: BlockError[];
  error: string | null;
  result: ExtractionResult | null;
  csv_path: string | null;
}

export interface BatchFileItem {
  id: string;
  filename: string;
  size: number;
  status: "queued" | "processing" | "done" | "error";
  progress: number;
  block_index: number;
  block_total: number;
  rows_count: number;
  discrepancies_count: number;
  error: string | null;
  uf?: string;
  ano?: string;
  csv_filename?: string;
}

export interface BatchJob {
  id: string;
  extraction_type: string;
  status: "queued" | "processing" | "done" | "error";
  created_at: string;
  total_files: number;
  completed_files: number;
  failed_files: number;
  files: BatchFileItem[];
  zip_filename?: string;
  zip_path?: string | null;
  error?: string | null;
}

export interface MonthData {
  pactuado: number;
  executado: number;
  pct_exec: number;
}

export interface LeafRow {
  conta: string;
  pactuado_total: number;
  executado_total: number;
  pct_exec_total: string | number;
  row_index: number;
  months: Record<string, MonthData>;
}

export interface TreeNode {
  name: string;
  level: string;
  children: any[]; // Since TreeNode nested structure can have recursively updated TreeNode[] after mapping conversion
  leaf_rows: LeafRow[];
  pactuado_total: number;
  executado_total: number;
  pct_exec_total: number;
  months: Record<string, MonthData>;
}

export const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export const BRAZILIAN_UFS = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
];

export function detectUfAndYearFromFilename(filename: string): { uf: string | null; ano: string | null } {
  if (!filename) return { uf: null, ano: null };

  const validUFs = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
    "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
    "RS", "RO", "RR", "SC", "SP", "SE", "TO"
  ];
  const ufPattern = validUFs.join("|");

  // Remove extension (e.g. .pdf)
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

  // 1. Direct pattern: UF + Year (e.g., "RJ2023", "RJ_2023", "RJ-2023", "16139_RJ2023")
  const ufYearRegex = new RegExp(`(?:^|[^a-zA-Z0-9])(${ufPattern})[\\s_\\-]?((?:19|20)\\d{2})(?:[^a-zA-Z0-9]|$)`, "i");
  const matchUfYear = nameWithoutExt.match(ufYearRegex);
  if (matchUfYear) {
    return {
      uf: matchUfYear[1].toUpperCase(),
      ano: matchUfYear[2],
    };
  }

  // 2. Inverse pattern: Year + UF (e.g., "2023RJ", "2023_RJ", "2023-RJ")
  const yearUfRegex = new RegExp(`(?:^|[^a-zA-Z0-9])((?:19|20)\\d{2})[\\s_\\-]?(${ufPattern})(?:[^a-zA-Z0-9]|$)`, "i");
  const matchYearUf = nameWithoutExt.match(yearUfRegex);
  if (matchYearUf) {
    return {
      uf: matchYearUf[2].toUpperCase(),
      ano: matchYearUf[1],
    };
  }

  // 3. Isolated year and isolated UF anywhere in filename
  let detectedAno: string | null = null;
  const yearMatch = nameWithoutExt.match(/\b((?:19|20)\d{2})\b/);
  if (yearMatch) {
    detectedAno = yearMatch[1];
  }

  let detectedUf: string | null = null;
  const tokens = nameWithoutExt.split(/[^a-zA-Z0-9]+/);
  for (const token of tokens) {
    const upper = token.toUpperCase();
    if (validUFs.includes(upper)) {
      detectedUf = upper;
      break;
    }
  }

  return {
    uf: detectedUf,
    ano: detectedAno,
  };
}

export const CSV_COLUMNS = [
  "Tipo", "Detalhe", "Grupo", "Subgrupo", "Conta Contábil",
  ...MONTHS.flatMap(m => [`Pactuado-${m}`, `Executado-${m}`, `%Exec-${m}`]),
  "Pactuado-TOTAL", "Executado-TOTAL", "%Exec-TOTAL"
];
