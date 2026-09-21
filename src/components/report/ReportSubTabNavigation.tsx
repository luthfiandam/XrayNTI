import React from 'react';
import { Send, FileSpreadsheet, FileText, Download, Share2, Loader2, History } from 'lucide-react';
import { ReportSubTab } from './types';

interface ReportSubTabNavigationProps {
  activeSubTab: ReportSubTab;
  setActiveSubTab: (tab: ReportSubTab) => void;
  isGeneratingPDF: boolean;
  onGeneratePdf: (action: 'download' | 'share') => void;
  historicalCount?: number;
}

export const ReportSubTabNavigation: React.FC<ReportSubTabNavigationProps> = ({
  activeSubTab,
  setActiveSubTab,
  isGeneratingPDF,
  onGeneratePdf,
  historicalCount,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white p-1.5 border border-slate-200/90 rounded-2xl shadow-xs">
      <div className="flex gap-1.5 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('wa')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full font-bold text-xs transition-all cursor-pointer ${
            activeSubTab === 'wa'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>Laporan WhatsApp</span>
        </button>

        <button
          onClick={() => setActiveSubTab('excel')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full font-bold text-xs transition-all cursor-pointer ${
            activeSubTab === 'excel'
              ? 'bg-[#6366f1] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Export Excel</span>
        </button>

        <button
          onClick={() => setActiveSubTab('pdf')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full font-bold text-xs transition-all cursor-pointer ${
            activeSubTab === 'pdf'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Export PDF</span>
        </button>

        <button
          onClick={() => setActiveSubTab('history')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full font-bold text-xs transition-all cursor-pointer ${
            activeSubTab === 'history'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Arsip Laporan per Tanggal</span>
          {historicalCount !== undefined && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
              activeSubTab === 'history' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'
            }`}>
              {historicalCount}
            </span>
          )}
        </button>
      </div>

      {activeSubTab === 'pdf' && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onGeneratePdf('download')}
            disabled={isGeneratingPDF}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-full font-bold text-xs transition-all border border-indigo-200 cursor-pointer disabled:opacity-50"
          >
            {isGeneratingPDF ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span>Download PDF</span>
          </button>
          <button
            onClick={() => onGeneratePdf('share')}
            disabled={isGeneratingPDF}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-bold text-xs transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isGeneratingPDF ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>Share PDF</span>
          </button>
        </div>
      )}
    </div>
  );
};
