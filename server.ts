import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import crypto from "crypto";
import JSZip from "jszip";
import { createServer as createViteServer } from "vite";
import { extractReport } from "./src/extractor_16139.js";
import { writeCsv, buildTree } from "./src/csv_and_tree.js";
import { Job, BatchJob, BatchFileItem, Discrepancy, detectUfAndYearFromFilename } from "./src/types.js";

const app = express();
const PORT = 3000;

const BASE_DIR = process.cwd();
const UPLOAD_DIR = path.join(BASE_DIR, "uploads");
const OUTPUT_DIR = path.join(BASE_DIR, "outputs");
const MAPPINGS_DIR = path.join(BASE_DIR, "src", "mappings");

// Create directories if they do not exist
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const EXTRACTION_TYPES = {
  "16139": {
    code: "16.1.3.9",
    title: "Execução Mensal do Plano de Aplicação (Pactuado x Executado)",
    description:
      "Extrai dados de execução contábil e demonstrações financeiras do relatório AF5110 - 16.1.3.9 (ADM_FIN_ORC_PLANO_APLICACAO), agrupando por Tipo > Detalhe > Grupo > Subgrupo > Conta Contábil, com validação cruzada de totais e painel de divergências em tempo real.",
    mapping_file: path.join(MAPPINGS_DIR, "16139_contas.txt"),
    enabled: true,
  },
};

const JOBS: Record<string, Job> = {};
const BATCH_JOBS: Record<string, BatchJob> = {};

// Configure Multer for Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB limit matching python
});

// Helper to create a new job entry
function createNewJob(extractionType: string, originalFilename: string): string {
  const jobId = crypto.randomUUID().replace(/-/g, "");
  JOBS[jobId] = {
    id: jobId,
    extraction_type: extractionType,
    filename: originalFilename,
    status: "queued",
    created_at: new Date().toISOString(),
    block_index: 0,
    block_total: 0,
    rows_so_far: 0,
    blocks_ok: 0,
    discrepancies: [],
    block_errors: [],
    error: null,
    result: null,
    csv_path: null,
  };
  return jobId;
}

// Background processing of the upload
async function runJob(jobId: string, pdfPath: string, mappingPath: string) {
  const job = JOBS[jobId];
  if (!job) return;

  job.status = "processing";

  const progressCb = (
    blockIndex: number,
    blockTotal: number,
    pageRange: [number, number],
    blockError: string | null,
    blockDiscrepancies: Discrepancy[],
    rowsSoFar: number
  ) => {
    job.block_index = blockIndex;
    job.block_total = blockTotal;
    job.rows_so_far = rowsSoFar;

    if (blockError === null) {
      job.blocks_ok++;
    } else {
      job.block_errors.push({
        pages: pageRange,
        message: blockError,
      });
    }

    for (const d of blockDiscrepancies) {
      job.discrepancies.push({
        row_index: d.row_index,
        conta: d.conta,
        field: d.field,
        expected: d.expected,
        found: d.found,
        diff: d.diff,
        message: d.message,
        pages: pageRange,
      });
    }
  };

  try {
    const result = await extractReport(pdfPath, mappingPath, 0.02, progressCb);
    const csvBytes = writeCsv(result);
    const csvPath = path.join(OUTPUT_DIR, `${jobId}.csv`);
    fs.writeFileSync(csvPath, csvBytes, "utf-8");

    job.status = "done";
    job.result = result;
    job.csv_path = csvPath;
  } catch (err: any) {
    console.error("Job execution error: ", err);
    job.status = "error";
    job.error = `${err.message || err}\n${err.stack || ""}`;
  }
}

// ----------------------------------------------------------------------------
// Batch Job Execution
// ----------------------------------------------------------------------------

async function runBatchJob(
  batchId: string,
  mappingPath: string,
  fileMetaList: Array<{ id: string; originalname: string; savedPath: string; uf?: string; ano?: string }>
) {
  const batch = BATCH_JOBS[batchId];
  if (!batch) return;

  batch.status = "processing";
  const zip = new JSZip();

  // Concurrency pool (process up to 2 files concurrently to balance speed and CPU)
  const CONCURRENCY = 2;
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < fileMetaList.length) {
      const idx = nextIdx++;
      const fileMeta = fileMetaList[idx];
      const item = batch.files.find((f) => f.id === fileMeta.id);
      if (!item) continue;

      item.status = "processing";

      const progressCb = (
        blockIndex: number,
        blockTotal: number,
        pageRange: [number, number],
        blockError: string | null,
        blockDiscrepancies: Discrepancy[],
        rowsSoFar: number
      ) => {
        item.block_index = blockIndex;
        item.block_total = blockTotal;
        item.progress = Math.round((blockIndex / Math.max(blockTotal, 1)) * 100);
        item.rows_count = rowsSoFar;
        item.discrepancies_count += blockDiscrepancies.length;
      };

      try {
        const result = await extractReport(fileMeta.savedPath, mappingPath, 0.02, progressCb);
        
        let uf = fileMeta.uf;
        let ano = fileMeta.ano;
        if (!uf || !ano) {
          const detected = detectUfAndYearFromFilename(fileMeta.originalname);
          if (!uf && detected.uf) uf = detected.uf;
          if (!ano && detected.ano) ano = detected.ano;
        }

        const baseName = path.basename(fileMeta.originalname, path.extname(fileMeta.originalname));
        const filePrefix = (uf && ano) ? `16139_${uf}_${ano}_` : `16139_`;
        const csvFilename = `${filePrefix}${baseName}.csv`;

        const csvContent = writeCsv(result, uf, ano);
        const csvPath = path.join(OUTPUT_DIR, `${fileMeta.id}.csv`);
        fs.writeFileSync(csvPath, csvContent, "utf-8");

        zip.file(csvFilename, csvContent);

        item.status = "done";
        item.progress = 100;
        item.rows_count = result.rows.length;
        item.discrepancies_count = result.discrepancies.length;
        item.uf = uf;
        item.ano = ano;
        item.csv_filename = csvFilename;

        batch.completed_files++;
      } catch (err: any) {
        console.error(`Error processing batch file ${fileMeta.originalname}:`, err);
        item.status = "error";
        item.error = err.message || "Erro durante o processamento do PDF.";
        batch.failed_files++;
      }
    }
  }

  const workers = [];
  for (let w = 0; w < Math.min(CONCURRENCY, fileMetaList.length); w++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  try {
    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const zipFilename = `extracao_lote_16139_${new Date().toISOString().slice(0, 10)}.zip`;
    const zipPath = path.join(OUTPUT_DIR, `batch_${batchId}.zip`);
    fs.writeFileSync(zipPath, zipBuffer);

    batch.status = "done";
    batch.zip_path = zipPath;
    batch.zip_filename = zipFilename;
  } catch (err: any) {
    console.error("Error generating batch zip:", err);
    batch.status = "error";
    batch.error = "Erro ao compilar arquivo ZIP: " + (err.message || err);
  }
}

// ----------------------------------------------------------------------------
// API Endpoints
// ----------------------------------------------------------------------------

app.get("/api/extraction-types", (req, res) => {
  res.json(EXTRACTION_TYPES);
});

app.post(
  "/api/extracao/16139/upload",
  upload.fields([
    { name: "pdf_file", maxCount: 1 },
    { name: "mapping_file", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const pdfFile = files?.pdf_file?.[0];
      const customMappingFile = files?.mapping_file?.[0];

      if (!pdfFile) {
        res.status(400).json({ error: "Selecione um arquivo PDF para enviar." });
        return;
      }

      if (!pdfFile.originalname.toLowerCase().endsWith(".pdf")) {
        res.status(400).json({ error: "O arquivo enviado precisa ser um PDF." });
        return;
      }

      const jobId = createNewJob("16139", pdfFile.originalname);
      const pdfPath = path.join(UPLOAD_DIR, `${jobId}.pdf`);

      // Rename uploaded file to match job ID pattern
      fs.renameSync(pdfFile.path, pdfPath);

      let mappingPath = EXTRACTION_TYPES["16139"].mapping_file;

      if (customMappingFile) {
        mappingPath = path.join(UPLOAD_DIR, `${jobId}_mapping.txt`);
        fs.renameSync(customMappingFile.path, mappingPath);
      }

      // Start asynchronous job parsing
      runJob(jobId, pdfPath, mappingPath);

      res.json({ job_id: jobId });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Erro no processamento do upload: " + err.message });
    }
  }
);

app.get("/api/job/:job_id/status", (req, res) => {
  const job = JOBS[req.params.job_id];
  if (!job) {
    res.status(404).json({ error: "Job não encontrado" });
    return;
  }

  const payload: any = {
    id: job.id,
    status: job.status,
    filename: job.filename,
    block_index: job.block_index,
    block_total: job.block_total,
    blocks_ok: job.blocks_ok,
    rows_so_far: job.rows_so_far,
    discrepancies: job.discrepancies.slice(-200), // Cap discrepancy payload size
    discrepancies_count: job.discrepancies.length,
    block_errors: job.block_errors,
    error: job.error,
  };

  if (job.status === "done" && job.result) {
    const r = job.result;
    payload.summary = {
      emission_date: r.emission_date,
      total_pages: r.total_pages,
      blocks_ok: r.blocks_ok,
      blocks_total: r.blocks_total,
      total_rows: r.rows.length,
      total_discrepancies: r.discrepancies.length,
    };
  }

  res.json(payload);
});

app.get("/api/job/:job_id/tree", (req, res) => {
  const job = JOBS[req.params.job_id];
  if (!job || job.status !== "done" || !job.result) {
    res.status(409).json({ error: "Resultado ainda não disponível" });
    return;
  }
  const tree = buildTree(job.result);
  res.json(tree);
});

app.get("/api/job/:job_id/rows", (req, res) => {
  const job = JOBS[req.params.job_id];
  if (!job || job.status !== "done" || !job.result) {
    res.status(409).json({ error: "Resultado ainda não disponível" });
    return;
  }

  const query = (req.query.q as string || "").trim().toLowerCase();
  const rows: any[] = [];

  for (const r of job.result.rows) {
    if (
      query &&
      !r["Conta Contábil"].toLowerCase().includes(query) &&
      !r["Tipo"].toLowerCase().includes(query) &&
      !r["Detalhe"].toLowerCase().includes(query) &&
      !r["Grupo"].toLowerCase().includes(query) &&
      !r["Subgrupo"].toLowerCase().includes(query)
    ) {
      continue;
    }

    const cleanRow: any = {};
    for (const key of Object.keys(r)) {
      if (!key.startsWith("_")) {
        cleanRow[key] = r[key];
      }
    }
    cleanRow.row_index = r._row_index;
    rows.push(cleanRow);

    if (rows.length >= 500) {
      break;
    }
  }

  res.json(rows);
});

app.get("/api/job/:job_id/download-csv", (req, res) => {
  const job = JOBS[req.params.job_id];
  if (!job || job.status !== "done" || !job.result) {
    res.status(404).send("Arquivo não encontrado ou processamento incompleto.");
    return;
  }

  let uf = req.query.uf ? String(req.query.uf).trim().toUpperCase() : undefined;
  let ano = req.query.ano ? String(req.query.ano).trim() : undefined;

  // If not provided in query params, attempt detection from filename
  if (!uf || !ano) {
    const auto = detectUfAndYearFromFilename(job.filename);
    if (!uf && auto.uf) uf = auto.uf;
    if (!ano && auto.ano) ano = auto.ano;
  }

  const baseName = path.basename(job.filename, path.extname(job.filename));
  const filePrefix = (uf && ano) ? `16139_${uf}_${ano}_` : `16139_`;

  const csvContent = writeCsv(job.result, uf, ano);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filePrefix + baseName)}.csv"`);
  res.send(csvContent);
});

// ----------------------------------------------------------------------------
// Batch Endpoints
// ----------------------------------------------------------------------------

app.post(
  "/api/extracao/16139/batch-upload",
  upload.fields([
    { name: "pdf_files", maxCount: 100 },
    { name: "mapping_file", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const pdfFiles = files?.pdf_files || [];
      const customMappingFile = files?.mapping_file?.[0];

      if (!pdfFiles || pdfFiles.length === 0) {
        res.status(400).json({ error: "Selecione ao menos um arquivo PDF para o processamento em lote." });
        return;
      }

      const invalid = pdfFiles.find((f) => !f.originalname.toLowerCase().endsWith(".pdf"));
      if (invalid) {
        res.status(400).json({ error: `O arquivo "${invalid.originalname}" não é um PDF válido.` });
        return;
      }

      const batchId = crypto.randomUUID().replace(/-/g, "");

      let mappingPath = EXTRACTION_TYPES["16139"].mapping_file;
      if (customMappingFile) {
        mappingPath = path.join(UPLOAD_DIR, `batch_${batchId}_mapping.txt`);
        fs.renameSync(customMappingFile.path, mappingPath);
      }

      // Read any UF/Ano overrides if passed as JSON string
      let overrides: Record<string, { uf?: string; ano?: string }> = {};
      if (req.body?.overrides) {
        try {
          overrides = typeof req.body.overrides === "string" ? JSON.parse(req.body.overrides) : req.body.overrides;
        } catch (e) {
          console.warn("Could not parse overrides JSON:", e);
        }
      }

      const fileMetaList: Array<{ id: string; originalname: string; savedPath: string; uf?: string; ano?: string }> = [];
      const batchItems: BatchFileItem[] = [];

      for (const file of pdfFiles) {
        const fileId = crypto.randomUUID().replace(/-/g, "");
        const savedPath = path.join(UPLOAD_DIR, `${fileId}.pdf`);
        fs.renameSync(file.path, savedPath);

        const override = overrides[file.originalname] || {};
        const detected = detectUfAndYearFromFilename(file.originalname);
        const uf = override.uf || detected.uf || undefined;
        const ano = override.ano || detected.ano || undefined;

        fileMetaList.push({
          id: fileId,
          originalname: file.originalname,
          savedPath,
          uf,
          ano,
        });

        batchItems.push({
          id: fileId,
          filename: file.originalname,
          size: file.size,
          status: "queued",
          progress: 0,
          block_index: 0,
          block_total: 20,
          rows_count: 0,
          discrepancies_count: 0,
          error: null,
          uf,
          ano,
        });
      }

      BATCH_JOBS[batchId] = {
        id: batchId,
        extraction_type: "16139",
        status: "queued",
        created_at: new Date().toISOString(),
        total_files: batchItems.length,
        completed_files: 0,
        failed_files: 0,
        files: batchItems,
      };

      // Launch async processing
      runBatchJob(batchId, mappingPath, fileMetaList);

      res.json({ batch_id: batchId });
    } catch (err: any) {
      console.error("Batch upload error:", err);
      res.status(500).json({ error: "Erro no processamento do lote: " + err.message });
    }
  }
);

app.get("/api/batch/:batch_id/status", (req, res) => {
  const batch = BATCH_JOBS[req.params.batch_id];
  if (!batch) {
    res.status(404).json({ error: "Lote de processamento não encontrado." });
    return;
  }

  res.json({
    id: batch.id,
    extraction_type: batch.extraction_type,
    status: batch.status,
    created_at: batch.created_at,
    total_files: batch.total_files,
    completed_files: batch.completed_files,
    failed_files: batch.failed_files,
    files: batch.files,
    zip_filename: batch.zip_filename,
    error: batch.error,
  });
});

app.get("/api/batch/:batch_id/download-zip", (req, res) => {
  const batch = BATCH_JOBS[req.params.batch_id];
  if (!batch || batch.status !== "done" || !batch.zip_path || !fs.existsSync(batch.zip_path)) {
    res.status(404).send("Arquivo ZIP ainda não disponível ou processamento não finalizado.");
    return;
  }

  const filename = batch.zip_filename || `extracao_lote_16139_${batch.id.slice(0, 8)}.zip`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
  const stream = fs.createReadStream(batch.zip_path);
  stream.pipe(res);
});

app.get("/api/batch/:batch_id/download-file/:file_id", (req, res) => {
  const batch = BATCH_JOBS[req.params.batch_id];
  if (!batch) {
    res.status(404).send("Lote não encontrado.");
    return;
  }

  const fileItem = batch.files.find((f) => f.id === req.params.file_id);
  if (!fileItem || fileItem.status !== "done") {
    res.status(404).send("Arquivo CSV individual não disponível.");
    return;
  }

  const csvPath = path.join(OUTPUT_DIR, `${fileItem.id}.csv`);
  if (!fs.existsSync(csvPath)) {
    res.status(404).send("Arquivo CSV não encontrado em disco.");
    return;
  }

  const filename = fileItem.csv_filename || `${fileItem.filename.replace(/\.pdf$/i, "")}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
  const stream = fs.createReadStream(csvPath);
  stream.pipe(res);
});

// ----------------------------------------------------------------------------
// Vite and Static Assets Serving Setup
// ----------------------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
