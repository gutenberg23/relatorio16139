import React, { useState, useEffect } from "react";
import { FileSpreadsheet, Sparkles, FileText, Archive, Files } from "lucide-react";
import CatalogView from "./components/CatalogView.js";
import UploadForm from "./components/UploadForm.js";
import JobView from "./components/JobView.js";
import BatchExtractionView from "./components/BatchExtractionView.js";

interface ExtractionType {
  code: string;
  title: string;
  description: string;
  mapping_file: string;
  enabled: boolean;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"single" | "batch">("single");
  const [activeView, setActiveView] = useState<"catalog" | "upload" | "job">("catalog");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [extractionTypes, setExtractionTypes] = useState<Record<string, ExtractionType>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Fetch extraction types configuration on mount
  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const res = await fetch("/api/extraction-types");
        if (res.ok) {
          const data = await res.json();
          setExtractionTypes(data);
        }
      } catch (err) {
        console.error("Failed to fetch extraction types metadata:", err);
      }
    };
    fetchTypes();
  }, []);

  const handleSelectType = (key: string) => {
    setSelectedType(key);
    setActiveView("upload");
  };

  const handleUploadSubmit = async (pdfFile: File, mappingFile: File | null) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("pdf_file", pdfFile);
      if (mappingFile) {
        formData.append("mapping_file", mappingFile);
      }

      const res = await fetch("/api/extracao/16139/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Erro no upload do arquivo.");
      }

      const data = await res.json();
      setActiveJobId(data.job_id);
      setActiveView("job");
    } catch (err: any) {
      alert(err.message || "Erro durante o upload. Por favor, tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToCatalog = () => {
    setActiveView("catalog");
    setSelectedType(null);
    setActiveJobId(null);
  };

  return (
    <div className="min-h-screen bg-[#0f1420] text-slate-200 font-sans selection:bg-blue-500/30 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-950/20 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 cursor-pointer" onClick={handleBackToCatalog}>
            <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/10">
              <FileSpreadsheet className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-white tracking-tight text-base flex items-center gap-1.5">
                EXCELENT <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider font-mono">EXTRATOR</span>
              </span>
            </div>
          </div>

          {/* Top Tabs Switcher */}
          <div className="flex items-center rounded-xl bg-slate-900/90 p-1 border border-slate-800 shadow-inner">
            <button
              type="button"
              onClick={() => setActiveTab("single")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "single"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Extração Individual</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("batch")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "batch"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <Archive className="h-3.5 w-3.5" />
              <span>Extração em Lote (ZIP)</span>
              <span className="hidden sm:inline-block text-[10px] bg-blue-400/20 text-blue-300 px-1.5 py-0.2 rounded font-mono">
                Múltiplos
              </span>
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-4">
            <span className="inline-flex items-center text-xs text-slate-500 font-medium gap-1">
              <Sparkles className="h-3.5 w-3.5 text-blue-400" /> AF5110 - 16.1.3.9
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Banner Section (only when on catalog in single mode) */}
        {activeTab === "single" && activeView === "catalog" && (
          <div className="mb-10 text-center md:text-left">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Extração Inteligente de Relatórios PDF
            </h1>
            <p className="mt-3 text-base text-slate-400 max-w-2xl leading-relaxed">
              Transforme demonstrativos contábeis e demonstrativos financeiros complexos em PDFs estruturados em planilhas CSV prontas para análise no Excel com validações cruzadas automatizadas.
            </p>
          </div>
        )}

        {/* Dynamic Views */}
        <div className="bg-slate-900/10 border border-slate-800/60 rounded-2xl p-6 sm:p-8 backdrop-blur-xl">
          {activeTab === "single" ? (
            <>
              {activeView === "catalog" && (
                <CatalogView types={extractionTypes} onSelect={handleSelectType} />
              )}

              {activeView === "upload" && (
                <UploadForm
                  onBack={handleBackToCatalog}
                  onSubmit={handleUploadSubmit}
                  isLoading={isLoading}
                />
              )}

              {activeView === "job" && activeJobId && (
                <JobView jobId={activeJobId} onBack={handleBackToCatalog} />
              )}
            </>
          ) : (
            <BatchExtractionView />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/20 py-8 text-center text-xs text-slate-600">
        <p>© 2026 EXCELENT Extrator de Relatórios PDF. Todos os direitos reservados.</p>
        <p className="mt-1">Implementado com tecnologia React, TypeScript, Express e pdf2json.</p>
      </footer>
    </div>
  );
}

