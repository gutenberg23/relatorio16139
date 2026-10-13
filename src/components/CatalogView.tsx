import React from "react";
import { FileText, ArrowRight, ShieldAlert, Layers } from "lucide-react";

interface ExtractionType {
  code: string;
  title: string;
  description: string;
  mapping_file: string;
  enabled: boolean;
}

interface CatalogViewProps {
  types: Record<string, ExtractionType>;
  onSelect: (key: string) => void;
}

export default function CatalogView({ types, onSelect }: CatalogViewProps) {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-5">
        <h2 className="text-xl font-semibold tracking-tight text-white">Catálogo de Extração</h2>
        <p className="mt-1 text-sm text-slate-400">
          Selecione o modelo do relatório em PDF padrão para iniciar o processamento de extração e validações.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2">
        {Object.entries(types).map(([key, type]) => {
          return (
            <div
              key={key}
              onClick={() => type.enabled && onSelect(key)}
              className={`group relative flex flex-col justify-between rounded-xl border p-5 transition-all duration-150 ${
                type.enabled
                  ? "cursor-pointer border-slate-800 bg-slate-900/40 hover:border-blue-500/50 hover:bg-slate-900/80 hover:shadow-lg hover:shadow-blue-500/5"
                  : "border-slate-800/40 bg-slate-900/10 opacity-50 cursor-not-allowed"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/20">
                    AF5110 - {type.code}
                  </span>
                  {type.enabled ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                      Disponível
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                      Em breve
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-medium text-white tracking-tight group-hover:text-blue-400 transition-colors">
                  {type.title}
                </h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  {type.description}
                </p>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-slate-800/50 pt-4">
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5" /> 4 Níveis
                  </span>
                  <span className="flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5" /> Validação Cruzada
                  </span>
                </div>
                {type.enabled && (
                  <span className="inline-flex items-center text-xs font-medium text-blue-400 gap-1 group-hover:translate-x-1 transition-transform">
                    Iniciar Extração <ArrowRight className="h-3 w-3" />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
