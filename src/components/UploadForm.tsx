import React, { useState, useRef } from "react";
import { Upload, FileText, ChevronDown, ChevronUp, AlertCircle, Info, Settings, CheckCircle2 } from "lucide-react";
import { detectUfAndYearFromFilename } from "../types.js";

interface UploadFormProps {
  onBack: () => void;
  onSubmit: (pdfFile: File, mappingFile: File | null) => void;
  isLoading: boolean;
}

export default function UploadForm({ onBack, onSubmit, isLoading }: UploadFormProps) {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [mappingFile, setMappingFile] = useState<File | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dragActivePdf, setDragActivePdf] = useState(false);
  const [dragActiveMap, setDragActiveMap] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const mapInputRef = useRef<HTMLInputElement>(null);

  const handleDragPdf = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActivePdf(true);
    } else if (e.type === "dragleave") {
      setDragActivePdf(false);
    }
  };

  const handleDropPdf = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActivePdf(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        setPdfFile(file);
        setError(null);
      } else {
        setError("O arquivo precisa ser um PDF válido.");
      }
    }
  };

  const handleDragMap = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActiveMap(true);
    } else if (e.type === "dragleave") {
      setDragActiveMap(false);
    }
  };

  const handleDropMap = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveMap(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setMappingFile(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfFile) {
      setError("Por favor, selecione um arquivo PDF do relatório.");
      return;
    }
    onSubmit(pdfFile, mappingFile);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <button
            onClick={onBack}
            className="text-xs font-semibold text-slate-400 hover:text-white transition-colors flex items-center gap-1 mb-2"
          >
            ← Voltar ao catálogo
          </button>
          <h2 className="text-xl font-semibold tracking-tight text-white">Extrair Relatório 16.1.3.9</h2>
          <p className="mt-1 text-sm text-slate-400 leading-relaxed">
            Plano de Aplicação Mensal (Pactuado x Executado). O PDF deve conter 60 páginas divididas em 20 blocos de 3 páginas cada.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-start gap-3 rounded-lg bg-rose-500/10 border border-rose-500/20 p-4 text-sm text-rose-400">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {/* Info Explaining block format */}
        <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 p-4 text-xs text-slate-400 leading-relaxed flex gap-3">
          <Info className="h-5 w-5 text-blue-400 shrink-0" />
          <div className="space-y-1">
            <span className="font-semibold text-slate-200">Como funciona o layout do relatório?</span>
            <p>
              O sistema analisa o PDF dividindo-o em blocos estruturais de 3 páginas. As mesmas linhas de contas contábeis se repetem nas 3 páginas, de forma que a 1ª página traz JAN-ABR, a 2ª traz MAI-AGO, e a 3ª traz SET-DEZ e o TOTAL. O mapeamento padrão do CONTAS.txt é usado para mapear a hierarquia contábil exata.
            </p>
          </div>
        </div>

        {/* PDF Dropzone */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-200 block">Relatório PDF Oficial</label>
          <div
            onDragEnter={handleDragPdf}
            onDragOver={handleDragPdf}
            onDragLeave={handleDragPdf}
            onDrop={handleDropPdf}
            onClick={() => pdfInputRef.current?.click()}
            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-150 ${
              pdfFile
                ? "border-blue-500/50 bg-blue-500/5"
                : dragActivePdf
                ? "border-blue-500 bg-slate-900/60"
                : "border-slate-800 bg-slate-900/20 hover:border-slate-700 hover:bg-slate-900/40"
            }`}
          >
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setPdfFile(e.target.files[0]);
                  setError(null);
                }
              }}
              className="hidden"
            />
            <Upload className={`h-8 w-8 mb-3 ${pdfFile ? "text-blue-400 animate-pulse" : "text-slate-500"}`} />
            {pdfFile ? (
              <div className="space-y-1.5 flex flex-col items-center">
                <p className="text-sm font-semibold text-white truncate max-w-lg">{pdfFile.name}</p>
                <p className="text-xs text-slate-500">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                {(() => {
                  const detected = detectUfAndYearFromFilename(pdfFile.name);
                  if (detected.uf && detected.ano) {
                    return (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mt-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>UF: {detected.uf} | Ano: {detected.ano} detectados (Download automático ativado)</span>
                      </div>
                    );
                  }
                  if (detected.uf || detected.ano) {
                    return (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mt-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>{detected.uf ? `UF: ${detected.uf}` : `Ano: ${detected.ano}`} detectado</span>
                      </div>
                    );
                  }
                  return null;
                })()}
                <p className="text-xs text-blue-400 mt-2 font-medium">Clique ou arraste outro PDF para substituir</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-slate-300">Arraste e solte o arquivo PDF aqui</p>
                <p className="text-xs text-slate-500 mt-1">ou clique para selecionar do computador</p>
              </div>
            )}
          </div>
        </div>

        {/* Advanced Mapping Section */}
        <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-900/10">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between p-4 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-900/30 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-slate-400" /> Configuração de Mapeamento Avançado
            </span>
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showAdvanced && (
            <div className="p-4 border-t border-slate-800/60 bg-slate-950/20 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Por padrão, o extrator utiliza a hierarquia e ordenação de contas contábeis definida em <code className="bg-slate-900 px-1 py-0.5 rounded text-slate-300 font-mono">16139_contas.txt</code>. Se a estrutura de contas do relatório foi modificada, envie um arquivo personalizado de mapeamento (CONTAS.txt) abaixo:
              </p>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Arquivo CONTAS.txt Personalizado (Opcional)</label>
                <div
                  onDragEnter={handleDragMap}
                  onDragOver={handleDragMap}
                  onDragLeave={handleDragMap}
                  onDrop={handleDropMap}
                  onClick={() => mapInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center border border-dashed rounded-lg p-5 text-center cursor-pointer transition-all duration-150 ${
                    mappingFile
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : dragActiveMap
                      ? "border-emerald-500 bg-slate-900/60"
                      : "border-slate-800 bg-slate-900/20 hover:border-slate-700 hover:bg-slate-900/40"
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
                  <FileText className={`h-6 w-6 mb-2 ${mappingFile ? "text-emerald-400" : "text-slate-500"}`} />
                  {mappingFile ? (
                    <div>
                      <p className="text-xs font-medium text-white truncate max-w-md">{mappingFile.name}</p>
                      <p className="text-[10px] text-slate-500 mt-1">Clique para substituir o mapeamento</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-medium text-slate-400">Arraste e solte o arquivo CONTAS.txt aqui</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">ou selecione um arquivo de mapeamento contábil</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading || !pdfFile}
            className={`w-full inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-150 ${
              isLoading || !pdfFile
                ? "opacity-50 cursor-not-allowed"
                : "hover:brightness-110 active:scale-[0.98] hover:shadow-blue-500/10"
            }`}
          >
            {isLoading ? "Enviando e Inicializando..." : "Iniciar Extração e Validação Cruzada"}
          </button>
        </div>
      </form>
    </div>
  );
}
