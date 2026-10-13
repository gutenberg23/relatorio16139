import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  Files,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Download,
  Trash2,
  Plus,
  RefreshCw,
  Archive,
  Layers,
  Settings,
  ChevronDown,
  ChevronUp,
  MapPin,
  Calendar,
  Sparkles,
} from "lucide-react";
import { BatchJob, BatchFileItem, BRAZILIAN_UFS, detectUfAndYearFromFilename } from "../types.js";

interface StagedFile {
  id: string;
  file: File;
  uf: string;
  ano: string;
}

export default function BatchExtractionView() {
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [mappingFile, setMappingFile] = useState<File | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [dragActiveMap, setDragActiveMap] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active batch processing state
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [batchData, setBatchData] = useState<BatchJob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapInputRef = useRef<HTMLInputElement>(null);

  // Helper to add files to stage
  const addFilesToStage = (newFiles: FileList | File[]) => {
    setErrorMessage(null);
    const added: StagedFile[] = [];

    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i];
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        continue;
      }
      // Check if already in stagedFiles
      const exists = stagedFiles.some((sf) => sf.file.name === file.name && sf.file.size === file.size);
      if (!exists) {
        const detected = detectUfAndYearFromFilename(file.name);
        added.push({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          file,
          uf: detected.uf || "",
          ano: detected.ano || "",
        });
      }
    }

    if (added.length === 0 && newFiles.length > 0) {
      setErrorMessage("Nenhum arquivo PDF novo e válido foi selecionado.");
    } else {
      setStagedFiles((prev) => [...prev, ...added]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToStage(e.dataTransfer.files);
    }
  };

  const handleRemoveStaged = (id: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleClearAll = () => {
    setStagedFiles([]);
    setErrorMessage(null);
  };

  const handleUpdateUf = (id: string, uf: string) => {
    setStagedFiles((prev) => prev.map((f) => (f.id === id ? { ...f, uf } : f)));
  };

  const handleUpdateAno = (id: string, ano: string) => {
    setStagedFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ano } : f)));
  };

  // Submit batch
  const handleStartBatch = async () => {
    if (stagedFiles.length === 0) {
      setErrorMessage("Por favor, selecione ao menos um arquivo PDF para processar.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      const overrides: Record<string, { uf?: string; ano?: string }> = {};

      stagedFiles.forEach((sf) => {
        formData.append("pdf_files", sf.file);
        overrides[sf.file.name] = {
          uf: sf.uf || undefined,
          ano: sf.ano || undefined,
        };
      });

      formData.append("overrides", JSON.stringify(overrides));

      if (mappingFile) {
        formData.append("mapping_file", mappingFile);
      }

      const res = await fetch("/api/extracao/16139/batch-upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Erro ao iniciar processamento em lote.");
      }

      const data = await res.json();
      setActiveBatchId(data.batch_id);
    } catch (err: any) {
      setErrorMessage(err.message || "Falha ao enviar lote.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Polling batch status
  useEffect(() => {
    if (!activeBatchId) return;

    let intervalId: any;

    const fetchBatchStatus = async () => {
      try {
        const res = await fetch(`/api/batch/${activeBatchId}/status`);
        if (!res.ok) throw new Error("Batch not found");
        const data = await res.json();
        setBatchData(data);

        if (data.status === "done" || data.status === "error") {
          clearInterval(intervalId);
        }
      } catch (err) {
        console.error("Error polling batch status:", err);
      }
    };

    fetchBatchStatus();
    intervalId = setInterval(fetchBatchStatus, 1000);

    return () => clearInterval(intervalId);
  }, [activeBatchId]);

  const handleResetBatch = () => {
    setActiveBatchId(null);
    setBatchData(null);
    setStagedFiles([]);
    setErrorMessage(null);
  };

  // Total calculations
  const totalStagedSize = stagedFiles.reduce((acc, f) => acc + f.file.size, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/20">
            Processamento em Lote
          </span>
          <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
            Relatório AF5110 - 16.1.3.9
          </span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <Archive className="h-6 w-6 text-blue-400" />
          Extração em Lote de Múltiplos Arquivos
        </h2>
        <p className="mt-1.5 text-sm text-slate-400 leading-relaxed max-w-3xl">
          Envie múltiplos PDFs do relatório 16.1.3.9 simultaneamente. O motor executa a extração sequencial e a validação de cada arquivo em paralelo, gerando um pacote compactado <strong>.ZIP</strong> com todas as planilhas <strong>CSV</strong> prontas para download.
        </p>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-3 rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 text-sm text-rose-400">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p>{errorMessage}</p>
        </div>
      )}

      {/* VIEW 1: FILE SELECTION & STAGING */}
      {!activeBatchId && (
        <div className="space-y-6">
          {/* Dropzone Area */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
              dragActive
                ? "border-blue-500 bg-blue-500/10 scale-[1.005]"
                : "border-slate-800 bg-slate-900/30 hover:border-blue-500/40 hover:bg-slate-900/60"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  addFilesToStage(e.target.files);
                }
              }}
              className="hidden"
            />
            <div className="h-14 w-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4 text-blue-400">
              <Files className="h-7 w-7" />
            </div>
            <p className="text-base font-semibold text-white">
              Arraste e solte vários arquivos PDF aqui
            </p>
            <p className="text-xs text-slate-400 mt-1.5 max-w-md">
              ou clique para selecionar múltiplos relatórios do seu computador (suporta seleção de vários arquivos de uma só vez)
            </p>
          </div>

          {/* Staged Files List */}
          {stagedFiles.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white">
                    Arquivos Selecionados ({stagedFiles.length})
                  </h3>
                  <span className="text-xs text-slate-500">
                    • Total: {(totalStagedSize / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar Mais PDFs
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/20 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Limpar Lista
                  </button>
                </div>
              </div>

              {/* Grid of staged items */}
              <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2 max-h-[380px] overflow-y-auto pr-1">
                {stagedFiles.map((item, index) => {
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 transition-colors hover:border-slate-700"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 text-blue-400 text-xs font-mono font-bold">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="text-xs font-medium text-white truncate" title={item.file.name}>
                            {item.file.name}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] text-slate-500">
                              {(item.file.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                            {/* Editable UF */}
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-slate-500" />
                              <select
                                value={item.uf}
                                onChange={(e) => handleUpdateUf(item.id, e.target.value)}
                                className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] text-blue-400 font-medium focus:outline-none focus:border-blue-500"
                              >
                                <option value="">Sem UF</option>
                                {BRAZILIAN_UFS.map((u) => (
                                  <option key={u.sigla} value={u.sigla}>
                                    {u.sigla}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {/* Editable Ano */}
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-slate-500" />
                              <input
                                type="text"
                                maxLength={4}
                                placeholder="Ano"
                                value={item.ano}
                                onChange={(e) => handleUpdateAno(item.id, e.target.value.replace(/\D/g, ""))}
                                className="w-12 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] text-blue-400 font-medium text-center focus:outline-none focus:border-blue-500"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveStaged(item.id)}
                        className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                        title="Remover arquivo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Advanced Mapping Section */}
          <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-900/10">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between p-3.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-900/30 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-slate-400" /> Configuração de Mapeamento Personalizado (Opcional)
              </span>
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showAdvanced && (
              <div className="p-4 border-t border-slate-800/60 bg-slate-950/20 space-y-3">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Todos os arquivos do lote usarão o mapeamento contábil padrão de 384 contas. Caso queira aplicar um arquivo <code className="bg-slate-900 px-1 py-0.5 rounded text-slate-300 font-mono">16139_contas.txt</code> customizado a todos os arquivos deste lote, selecione-o abaixo:
                </p>

                <div
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragActiveMap(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActiveMap(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setDragActiveMap(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActiveMap(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      setMappingFile(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => mapInputRef.current?.click()}
                  className={`flex items-center justify-center gap-3 border border-dashed rounded-lg p-4 cursor-pointer transition-colors ${
                    mappingFile
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : dragActiveMap
                      ? "border-emerald-500 bg-slate-900/60"
                      : "border-slate-800 bg-slate-900/20 hover:border-slate-700"
                  }`}
                >
                  <input
                    ref={mapInputRef}
                    type="file"
                    accept=".txt"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setMappingFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                  <FileText className={`h-5 w-5 ${mappingFile ? "text-emerald-400" : "text-slate-500"}`} />
                  <span className="text-xs text-slate-300">
                    {mappingFile ? mappingFile.name : "Clique ou arraste um CONTAS.txt customizado"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action Trigger Button */}
          <div className="pt-2">
            <button
              type="button"
              disabled={isSubmitting || stagedFiles.length === 0}
              onClick={handleStartBatch}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-all duration-150 ${
                isSubmitting || stagedFiles.length === 0
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:brightness-110 active:scale-[0.99] hover:shadow-blue-500/20"
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Enviando e iniciando lote...</span>
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4" />
                  <span>Iniciar Extração em Lote ({stagedFiles.length} {stagedFiles.length === 1 ? "Arquivo" : "Arquivos"})</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* VIEW 2: BATCH EXECUTION & PROGRESS */}
      {activeBatchId && batchData && (
        <div className="space-y-6">
          {/* Status & Overview Bar */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Progresso do Lote
                </span>
                <h3 className="text-lg font-bold text-white flex items-center gap-2 mt-0.5">
                  {batchData.status === "done" ? (
                    <span className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="h-5 w-5" /> Extração Concluída
                    </span>
                  ) : batchData.status === "error" ? (
                    <span className="flex items-center gap-2 text-rose-400">
                      <AlertCircle className="h-5 w-5" /> Erro no Lote
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-blue-400">
                      <Loader2 className="h-5 w-5 animate-spin" /> Processando Arquivos...
                    </span>
                  )}
                </h3>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Arquivos Concluídos</span>
                  <span className="text-sm font-bold text-white font-mono">
                    {batchData.completed_files} de {batchData.total_files}
                  </span>
                </div>
                {batchData.failed_files > 0 && (
                  <div className="text-right pl-3 border-l border-slate-800">
                    <span className="text-xs text-rose-400 block">Falhas</span>
                    <span className="text-sm font-bold text-rose-400 font-mono">
                      {batchData.failed_files}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Overall Progress Bar */}
            <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-300 ${
                  batchData.status === "done"
                    ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                    : "bg-gradient-to-r from-blue-500 to-indigo-500"
                }`}
                style={{
                  width: `${Math.round(
                    ((batchData.completed_files + batchData.failed_files) / Math.max(batchData.total_files, 1)) * 100
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* MAIN DOWNLOAD ACTION CARD UPON COMPLETION */}
          {batchData.status === "done" && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center space-y-4 shadow-xl shadow-emerald-500/5">
              <div className="flex justify-center">
                <div className="h-14 w-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Archive className="h-7 w-7" />
                </div>
              </div>

              <div>
                <h4 className="text-xl font-bold text-white">
                  Todos os arquivos foram processados com sucesso!
                </h4>
                <p className="text-xs text-slate-300 mt-1 max-w-lg mx-auto">
                  Foram geradas <strong>{batchData.completed_files} planilhas CSV</strong> estruturadas no padrão analítico do relatório 16.1.3.9 com colunas de UF e Ano incluídas.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <a
                  href={`/api/batch/${activeBatchId}/download-zip`}
                  className="inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition-all"
                  download
                >
                  <Download className="h-5 w-5" />
                  Baixar Todos os CSVs (.ZIP)
                </a>

                <button
                  type="button"
                  onClick={handleResetBatch}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-5 py-3.5 text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  Processar Novo Lote
                </button>
              </div>
            </div>
          )}

          {/* Detailed Per-File List */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Status por Arquivo ({batchData.files.length})
            </h4>

            <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              {batchData.files.map((fileItem, idx) => {
                return (
                  <div
                    key={fileItem.id}
                    className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-900/60 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="shrink-0">
                        {fileItem.status === "done" ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        ) : fileItem.status === "processing" ? (
                          <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                        ) : fileItem.status === "error" ? (
                          <AlertCircle className="h-5 w-5 text-rose-400" />
                        ) : (
                          <Clock className="h-5 w-5 text-slate-600" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-white truncate" title={fileItem.filename}>
                            {fileItem.filename}
                          </p>
                          {fileItem.uf && (
                            <span className="rounded bg-blue-500/10 px-1.5 py-0.2 text-[10px] font-semibold text-blue-400 border border-blue-500/20">
                              {fileItem.uf}
                            </span>
                          )}
                          {fileItem.ano && (
                            <span className="rounded bg-slate-800 px-1.5 py-0.2 text-[10px] font-semibold text-slate-300">
                              {fileItem.ano}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                          <span>{(fileItem.size / 1024 / 1024).toFixed(2)} MB</span>
                          {fileItem.status === "processing" && (
                            <span className="text-blue-400 font-mono">
                              Processando bloco {fileItem.block_index}/{fileItem.block_total} (pág. {(fileItem.block_index - 1) * 3 + 1} a {fileItem.block_index * 3})
                            </span>
                          )}
                          {fileItem.status === "done" && (
                            <span className="text-emerald-400">
                              {fileItem.rows_count} contas extraídas • Validação cruzada OK
                            </span>
                          )}
                          {fileItem.status === "error" && (
                            <span className="text-rose-400">{fileItem.error}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action per file */}
                    <div>
                      {fileItem.status === "done" ? (
                        <a
                          href={`/api/batch/${activeBatchId}/download-file/${fileItem.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                          title="Baixar CSV individual"
                          download
                        >
                          <Download className="h-3.5 w-3.5 text-slate-400" />
                          CSV
                        </a>
                      ) : (
                        <span className="text-[11px] font-mono px-2 py-1 rounded bg-slate-950 text-slate-500 border border-slate-800">
                          {fileItem.status === "processing" ? `${fileItem.progress}%` : fileItem.status === "queued" ? "Na fila" : "Falhou"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
