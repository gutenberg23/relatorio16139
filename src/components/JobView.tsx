import React, { useState, useEffect } from "react";
import {
  Loader2,
  FileCheck,
  ShieldCheck,
  AlertTriangle,
  FolderOpen,
  Search,
  Download,
  Database,
  Grid,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Calendar,
  X,
  MapPin,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Job, TreeNode, LeafRow, MONTHS, BRAZILIAN_UFS, detectUfAndYearFromFilename } from "../types.js";

function toNumber(raw: string): number | null {
  if (!raw) return null;
  if (/^\*+$/.test(raw)) return null;
  const txt = raw.replace(/\./g, "").replace(",", ".");
  const val = parseFloat(txt);
  return isNaN(val) ? null : val;
}

interface JobViewProps {
  jobId: string;
  onBack: () => void;
}

export default function JobView({ jobId, onBack }: JobViewProps) {
  const [job, setJob] = useState<Job | null>(null);
  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [flatRows, setFlatRows] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"tree" | "table">("tree");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("TOTAL");
  const [isTreeLoading, setIsTreeLoading] = useState(false);
  const [isTableLoading, setIsTableLoading] = useState(false);

  // Modal download parameters state
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [selectedUf, setSelectedUf] = useState("");
  const [selectedAno, setSelectedAno] = useState("");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const autoDownloadedRef = React.useRef(false);

  const autoDetected = job ? detectUfAndYearFromFilename(job.filename) : { uf: null, ano: null };
  const effectiveUf = selectedUf || autoDetected.uf || "";
  const effectiveAno = selectedAno || autoDetected.ano || "";
  const isBothAutoDetected = Boolean(autoDetected.uf && autoDetected.ano);

  // Poll status every 1 second
  useEffect(() => {
    let intervalId: any;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/job/${jobId}/status`);
        if (!res.ok) throw new Error("Job not found");
        const data = await res.json();
        setJob(data);

        if (data.status === "done" || data.status === "error") {
          clearInterval(intervalId);
        }
      } catch (err) {
        console.error("Error polling job status: ", err);
        clearInterval(intervalId);
      }
    };

    fetchStatus();
    intervalId = setInterval(fetchStatus, 1000);

    return () => clearInterval(intervalId);
  }, [jobId]);

  // Fetch tree and table results when job becomes "done" and auto-trigger download if UF and Year are detected
  useEffect(() => {
    if (job?.status === "done") {
      fetchTree();
      fetchTable();
      const detected = detectUfAndYearFromFilename(job.filename);
      let detectedUf = detected.uf;
      let detectedAno = detected.ano;
      if (!detectedAno && (job as any).summary?.emission_date) {
        const match = (job as any).summary.emission_date.match(/\b(20\d{2})\b/);
        if (match) {
          detectedAno = match[1];
        }
      }

      if (detectedUf) {
        setSelectedUf((prev) => prev || detectedUf!);
      }
      if (detectedAno) {
        setSelectedAno((prev) => prev || detectedAno!);
      }

      // If both UF and Ano are detected, automatically trigger download without requiring user interaction
      if (detectedUf && detectedAno && /^\d{4}$/.test(detectedAno.trim()) && !autoDownloadedRef.current) {
        autoDownloadedRef.current = true;
        triggerDownload(detectedUf, detectedAno.trim());
      }
    }
  }, [job?.status, job?.filename]);

  const fetchTree = async () => {
    setIsTreeLoading(true);
    try {
      const res = await fetch(`/api/job/${jobId}/tree`);
      if (res.ok) {
        const data = await res.json();
        setTreeData(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTreeLoading(false);
    }
  };

  const fetchTable = async (query = "") => {
    setIsTableLoading(true);
    try {
      const res = await fetch(`/api/job/${jobId}/rows?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setFlatRows(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTableLoading(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    fetchTable(val);
  };

  const triggerDownload = (uf: string, ano: string) => {
    setIsDownloading(true);
    const downloadUrl = `/api/job/${jobId}/download-csv?uf=${encodeURIComponent(uf)}&ano=${encodeURIComponent(ano)}`;

    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `16139_${uf}_${ano}_${job?.filename || "planilha"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setIsDownloading(false);
      setIsDownloadModalOpen(false);
    }, 400);
  };

  const handleDownloadButtonClick = () => {
    const auto = job ? detectUfAndYearFromFilename(job.filename) : { uf: null, ano: null };
    const ufToUse = selectedUf || auto.uf;
    const anoToUse = selectedAno || auto.ano;

    if (ufToUse && anoToUse && /^\d{4}$/.test(anoToUse.trim())) {
      // Both UF and Year are detected / specified -> trigger direct download
      triggerDownload(ufToUse, anoToUse.trim());
    } else {
      // Missing UF or Year -> open modal
      if (ufToUse) setSelectedUf(ufToUse);
      if (anoToUse) setSelectedAno(anoToUse);
      setDownloadError(null);
      setIsDownloadModalOpen(true);
    }
  };

  const handleDownloadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUf) {
      setDownloadError("A seleção da UF (Estado) é obrigatória.");
      return;
    }
    if (!selectedAno || !/^\d{4}$/.test(selectedAno.trim())) {
      setDownloadError("O preenchimento de um Ano válido (4 dígitos) é obrigatório.");
      return;
    }

    setDownloadError(null);
    triggerDownload(selectedUf, selectedAno.trim());
  };

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400">
        <Loader2 className="h-8 w-8 text-blue-400 animate-spin mb-3" />
        <p className="text-sm font-medium">Carregando informações do job...</p>
      </div>
    );
  }

  const pctProgress = job.block_total > 0 ? Math.round((job.block_index / job.block_total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <button
            onClick={onBack}
            className="text-xs font-semibold text-slate-400 hover:text-white transition-colors flex items-center gap-1 mb-2"
          >
            ← Voltar ao início
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-white">Monitoramento de Extração</h2>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                job.status === "queued"
                  ? "bg-slate-500/10 text-slate-400 border-slate-500/20"
                  : job.status === "processing"
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse"
                  : job.status === "done"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/20"
              }`}
            >
              {job.status === "queued" && "Na Fila"}
              {job.status === "processing" && "Processando"}
              {job.status === "done" && "Concluído"}
              {job.status === "error" && "Erro"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400 leading-relaxed truncate max-w-2xl">
            Arquivo: <span className="font-semibold text-slate-300">{job.filename}</span>
          </p>
        </div>
      </div>

      {/* Progress Bar (Visible if processing or queued) */}
      {job.status !== "done" && job.status !== "error" && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-5 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-slate-300">
              {job.status === "queued" ? "Aguardando início..." : "Extraindo e analisando blocos de páginas..."}
            </span>
            <span className="font-semibold text-blue-400">{pctProgress}%</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${pctProgress}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            Bloco {job.block_index} de {job.block_total} ({job.block_index * 3} de {job.block_total * 3} páginas analisadas)
          </p>
        </div>
      )}

      {/* Statistics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Páginas</span>
          <p className="text-2xl font-bold text-white font-mono">
            {job.block_index * 3} <span className="text-sm font-normal text-slate-500">/ {job.block_total * 3}</span>
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Linhas de Contas</span>
          <p className="text-2xl font-bold text-white font-mono">{job.rows_so_far}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Blocos OK</span>
          <p className="text-2xl font-bold text-white font-mono">
            {job.blocks_ok} <span className="text-sm font-normal text-slate-500">/ {job.block_total}</span>
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Divergências</span>
          <p
            className={`text-2xl font-bold font-mono ${
              job.discrepancies.length > 0 ? "text-amber-400" : "text-emerald-400"
            }`}
          >
            {job.discrepancies.length}
          </p>
        </div>
      </div>

      {/* Error Output */}
      {job.status === "error" && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-5 space-y-2">
          <h3 className="text-sm font-semibold text-rose-400 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Erro no Processamento do Relatório
          </h3>
          <pre className="text-xs text-rose-300 whitespace-pre-wrap font-mono leading-relaxed bg-black/30 p-3 rounded-lg overflow-x-auto">
            {job.error}
          </pre>
        </div>
      )}

      {/* Real-time Discrepancy Feed */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/20 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-300">
          Painel de Divergências e Inconsistências de Totais
        </h3>

        {job.discrepancies.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-3.5 rounded-lg">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            <span>Nenhuma divergência encontrada. Todos os totais somam e fecham perfeitamente.</span>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="min-w-full divide-y divide-slate-800 text-left text-xs text-slate-300">
              <thead className="bg-slate-900/60 text-slate-400 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Conta</th>
                  <th className="px-4 py-3">Campo</th>
                  <th className="px-4 py-3 text-right">Esperado</th>
                  <th className="px-4 py-3 text-right">Encontrado</th>
                  <th className="px-4 py-3 text-right">Diferença</th>
                  <th className="px-4 py-3">Descrição da Inconsistência</th>
                  <th className="px-4 py-3">Pág.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/10 font-mono">
                {job.discrepancies.map((d, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/40">
                    <td className="px-4 py-2.5 text-blue-400 font-semibold">{d.conta}</td>
                    <td className="px-4 py-2.5 font-sans">{d.field}</td>
                    <td className="px-4 py-2.5 text-right">
                      {d.expected.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {d.found.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5 text-right text-rose-400 font-semibold">
                      {d.diff.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5 font-sans leading-relaxed text-slate-400">{d.message}</td>
                    <td className="px-4 py-2.5 text-slate-500 font-semibold">
                      {d.pages ? d.pages.join("-") : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Done State Components */}
      {job.status === "done" && (
        <div className="space-y-6">
          {/* Downloads Block */}
          <div className="rounded-xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-transparent border border-blue-500/20 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-white">Extração Concluída com Sucesso!</h3>
              <p className="text-xs text-slate-400">
                Gere e baixe a planilha no formato padrão PT-BR CSV (ponto-e-vírgula com BOM) com as colunas UF e Ano.
              </p>
              {effectiveUf && effectiveAno ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>
                      {isBothAutoDetected ? "Detectado no arquivo:" : "Configurado:"}{" "}
                      <strong className="font-mono text-white">UF = {effectiveUf}</strong> |{" "}
                      <strong className="font-mono text-white">Ano = {effectiveAno}</strong>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDownloadError(null);
                      setIsDownloadModalOpen(true);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-200 underline decoration-slate-600 hover:decoration-slate-400 transition-colors cursor-pointer"
                  >
                    Alterar UF/Ano
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-amber-400/90 font-medium pt-0.5">
                  * UF e Ano não foram detectados no nome do arquivo e serão solicitados ao baixar.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleDownloadButtonClick}
              disabled={isDownloading}
              className={`inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-xs font-bold text-white transition-all shadow-md gap-2 shrink-0 ${
                isDownloading
                  ? "bg-blue-600/70 cursor-wait"
                  : "bg-blue-500 hover:bg-blue-600 hover:shadow-blue-500/20 cursor-pointer"
              }`}
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Baixando Planilha...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" /> Baixar Planilha CSV
                </>
              )}
            </button>
          </div>

          {/* Results Tab Control */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800">
              <div className="flex">
                <button
                  onClick={() => setActiveTab("tree")}
                  className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px flex items-center gap-2 transition-colors ${
                    activeTab === "tree"
                      ? "border-blue-500 text-white bg-blue-500/5"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Database className="h-4 w-4" /> Visualização Hierárquica Agregada
                </button>
                <button
                  onClick={() => setActiveTab("table")}
                  className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px flex items-center gap-2 transition-colors ${
                    activeTab === "table"
                      ? "border-blue-500 text-white bg-blue-500/5"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Grid className="h-4 w-4" /> Tabela de Linhas Planas
                </button>
              </div>
              <div className="flex items-center gap-2 pb-2 sm:pb-0 px-4 sm:px-0">
                <Calendar className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-400 font-medium">Período:</span>
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                >
                  <option value="TOTAL">Total Anual</option>
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tree View Tab */}
            {activeTab === "tree" && (
              <div className="space-y-4">
                <p className="text-xs text-slate-400">
                  Estrutura hierárquica retraída por padrão. Os valores nos níveis superiores Tipo, Detalhe, Grupo e Subgrupo acumulam e somam automaticamente os totais das contas filhas.
                </p>

                {isTreeLoading ? (
                  <div className="flex items-center justify-center p-12 text-slate-500">
                    <Loader2 className="h-6 w-6 text-blue-400 animate-spin mr-2" /> Carregando árvore hierárquica...
                  </div>
                ) : (
                  treeData && (
                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/10 p-4">
                      <div className="space-y-2">
                        {treeData.children.map((child, idx) => (
                          <TreeNodeComponent key={idx} node={child} depth={0} selectedPeriod={selectedPeriod} />
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {/* Table Tab */}
            {activeTab === "table" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Pesquisar contas (nome, código, tipo, grupo, etc.)..."
                      value={searchQuery}
                      onChange={handleSearchChange}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 py-2 pl-9 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500/50 focus:outline-none"
                    />
                  </div>
                </div>

                {isTableLoading ? (
                  <div className="flex items-center justify-center p-12 text-slate-500">
                    <Loader2 className="h-6 w-6 text-blue-400 animate-spin mr-2" /> Filtrando linhas...
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-800 rounded-lg">
                    <table className="min-w-full divide-y divide-slate-800 text-left text-xs text-slate-300">
                      <thead className="bg-slate-900/60 text-slate-400 font-semibold uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Código/Conta</th>
                          <th className="px-4 py-3">Tipo</th>
                          <th className="px-4 py-3">Detalhe</th>
                          <th className="px-4 py-3">Grupo</th>
                          <th className="px-4 py-3">Subgrupo</th>
                          <th className="px-4 py-3 text-right">Pactuado {selectedPeriod === "TOTAL" ? "Total" : selectedPeriod}</th>
                          <th className="px-4 py-3 text-right">Executado {selectedPeriod === "TOTAL" ? "Total" : selectedPeriod}</th>
                          <th className="px-4 py-3 text-right">% Exec {selectedPeriod === "TOTAL" ? "Total" : selectedPeriod}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-900/10 font-mono">
                        {flatRows.map((r, idx) => {
                          const p = toNumber(r[selectedPeriod === "TOTAL" ? "Pactuado-TOTAL" : `Pactuado-${selectedPeriod}`]) || 0.0;
                          const e = toNumber(r[selectedPeriod === "TOTAL" ? "Executado-TOTAL" : `Executado-${selectedPeriod}`]) || 0.0;
                          const pct = r[selectedPeriod === "TOTAL" ? "%Exec-TOTAL" : `%Exec-${selectedPeriod}`] || "0,00";
                          return (
                            <tr key={idx} className="hover:bg-slate-900/40">
                              <td className="px-4 py-2.5 text-blue-400 font-semibold">{r["Conta Contábil"]}</td>
                              <td className="px-4 py-2.5 font-sans text-slate-400 truncate max-w-[120px]">{r["Tipo"]}</td>
                              <td className="px-4 py-2.5 font-sans text-slate-400 truncate max-w-[120px]">{r["Detalhe"]}</td>
                              <td className="px-4 py-2.5 font-sans text-slate-400 truncate max-w-[120px]">{r["Grupo"]}</td>
                              <td className="px-4 py-2.5 font-sans text-slate-400 truncate max-w-[120px]">{r["Subgrupo"]}</td>
                              <td className="px-4 py-2.5 text-right">
                                {p.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                {e.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-2.5 text-right font-sans text-blue-400 font-bold">
                                {pct}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Preenchimento Obrigatório de UF e Ano para Download CSV */}
      {isDownloadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-6 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Configurar Exportação CSV</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Preencha a UF e o Ano para inclusão em todas as linhas da planilha
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDownloadModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleDownloadSubmit} className="mt-5 space-y-4">
              {downloadError && (
                <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/25 rounded-lg text-xs font-semibold text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{downloadError}</span>
                </div>
              )}

              {/* UF Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-blue-400" />
                  Estado (UF) <span className="text-rose-400">*</span>
                </label>
                <select
                  value={selectedUf}
                  onChange={(e) => {
                    setSelectedUf(e.target.value);
                    if (downloadError) setDownloadError(null);
                  }}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors font-medium"
                >
                  <option value="" disabled>
                    -- Selecione a UF do Estado --
                  </option>
                  {BRAZILIAN_UFS.map((uf) => (
                    <option key={uf.sigla} value={uf.sigla}>
                      {uf.sigla} - {uf.nome}
                    </option>
                  ))}
                </select>
              </div>

              {/* Ano Selection / Input */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-blue-400" />
                  Ano de Referência <span className="text-rose-400">*</span>
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="Ex: 2024"
                    value={selectedAno}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      setSelectedAno(val);
                      if (downloadError) setDownloadError(null);
                    }}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                  {/* Quick Select Years */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-500 font-medium mr-1">Atalhos de Ano:</span>
                    {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map((yr) => (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => {
                          setSelectedAno(String(yr));
                          if (downloadError) setDownloadError(null);
                        }}
                        className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                          selectedAno === String(yr)
                            ? "bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold"
                            : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-slate-700/60"
                        }`}
                      >
                        {yr}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Structure Preview Info */}
              <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center justify-between text-slate-300 font-semibold">
                  <span>Estrutura das colunas no CSV:</span>
                  <span className="text-[11px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                    Ponto-e-vírgula (;) com BOM UTF-8
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Serão adicionadas as colunas <strong className="text-slate-200 font-mono">UF = {selectedUf || "?"}</strong> e <strong className="text-slate-200 font-mono">Ano = {selectedAno || "?"}</strong> na 1ª e 2ª posição de cada linha exportada.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDownloadModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!selectedUf || !selectedAno || isDownloading}
                  className={`inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md ${
                    !selectedUf || !selectedAno || isDownloading
                      ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                      : "bg-blue-500 hover:bg-blue-600 hover:shadow-blue-500/20 cursor-pointer"
                  }`}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Gerando CSV...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" /> Confirmar e Baixar CSV
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Collapsible Tree Node Component
function TreeNodeComponent({ node, depth, selectedPeriod }: { node: any; depth: number; key?: any; selectedPeriod: string }) {
  const [isOpen, setIsOpen] = useState(false);

  const depthBorderColor =
    depth === 0
      ? "border-l-4 border-blue-500"
      : depth === 1
      ? "border-l-4 border-indigo-500"
      : depth === 2
      ? "border-l-4 border-emerald-500"
      : "border-l-4 border-amber-500";

  const hasChildren = node.children && node.children.length > 0;
  const hasLeaves = node.leaf_rows && node.leaf_rows.length > 0;
  const isExpandable = hasChildren || hasLeaves;

  const pVal = selectedPeriod === "TOTAL" ? node.pactuado_total : (node.months?.[selectedPeriod]?.pactuado || 0);
  const eVal = selectedPeriod === "TOTAL" ? node.executado_total : (node.months?.[selectedPeriod]?.executado || 0);
  const pctVal = selectedPeriod === "TOTAL" ? node.pct_exec_total : (node.months?.[selectedPeriod]?.pct_exec || 0);

  return (
    <div className={`border border-slate-800/80 rounded-lg overflow-hidden bg-slate-950/20 ${depthBorderColor}`}>
      <div
        onClick={() => isExpandable && setIsOpen(!isOpen)}
        className={`flex items-center justify-between p-3.5 ${
          isExpandable ? "cursor-pointer hover:bg-slate-900/30" : ""
        } transition-colors`}
      >
        <div className="flex items-center gap-2">
          {isExpandable ? (
            isOpen ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400" />
            )
          ) : (
            <div className="h-4 w-4" />
          )}
          <span className="font-semibold text-xs text-slate-500 uppercase tracking-wider mr-1">
            {node.level}:
          </span>
          <span className="font-medium text-slate-200 text-sm">{node.name}</span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
          <span className="hidden sm:inline">
            <span className="text-slate-500 mr-1">Pactuado:</span>
            <span className="text-slate-300 font-bold">
              {pVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </span>
          <span className="hidden sm:inline">
            <span className="text-slate-500 mr-1">Executado:</span>
            <span className="text-slate-300 font-bold">
              {eVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </span>
          <span className="bg-blue-500/10 px-2 py-0.5 rounded text-blue-400 font-bold border border-blue-500/15">
            {pctVal}%
          </span>
        </div>
      </div>

      {isOpen && (
        <div className="pl-6 pr-4 pb-4 border-t border-slate-800/40 bg-black/5 pt-3 space-y-2">
          {/* Recursive Render children */}
          {hasChildren &&
            node.children.map((child: any, idx: number) => (
              <TreeNodeComponent key={idx} node={child} depth={depth + 1} selectedPeriod={selectedPeriod} />
            ))}

          {/* Render Leaves (individual Contas Contábeis) */}
          {hasLeaves && (
            <div className="overflow-x-auto border border-slate-800/60 rounded-lg">
              <table className="min-w-full divide-y divide-slate-800 text-left text-xs text-slate-400">
                <thead className="bg-slate-900/40 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="px-3 py-2">Conta Contábil</th>
                    <th className="px-3 py-2 text-right">Pactuado {selectedPeriod === "TOTAL" ? "Total" : selectedPeriod}</th>
                    <th className="px-3 py-2 text-right">Executado {selectedPeriod === "TOTAL" ? "Total" : selectedPeriod}</th>
                    <th className="px-3 py-2 text-right">% Exec {selectedPeriod === "TOTAL" ? "Total" : selectedPeriod}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono">
                  {node.leaf_rows.map((l: LeafRow, idx: number) => {
                    const leafP = selectedPeriod === "TOTAL" ? l.pactuado_total : (l.months?.[selectedPeriod]?.pactuado || 0);
                    const leafE = selectedPeriod === "TOTAL" ? l.executado_total : (l.months?.[selectedPeriod]?.executado || 0);
                    const leafPct = selectedPeriod === "TOTAL" ? l.pct_exec_total : (l.months?.[selectedPeriod]?.pct_exec || 0);

                    return (
                      <tr key={idx} className="hover:bg-slate-900/20">
                        <td className="px-3 py-2 text-blue-400 font-semibold">{l.conta}</td>
                        <td className="px-3 py-2 text-right">
                          {leafP.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {leafE.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right text-blue-400 font-bold font-sans">
                          {leafPct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
