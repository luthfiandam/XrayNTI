import React from 'react';
import { Send, Copy, Check, Loader2 } from 'lucide-react';
import { StructuredReportData } from '../../types';
import { generateWhatsAppReportText, generateCorrectiveWhatsAppReportText } from '../../services/reportService';
import { formatTimeRange } from '../../utils/timeFormat';
import { INTERVAL_NAMES } from './types';

interface WhatsAppReportSectionProps {
  structuredData: StructuredReportData;
  submittedFrequencyIds: number[];
  copiedFreqId: number | null;
  sharingFreqId: number | null;
  onCopyInterval: (text: string, freqId: number) => void;
  onShareInterval: (text: string, freqId?: number) => void;
  onShareCorrective: (text: string) => void;
}

export const WhatsAppReportSection: React.FC<WhatsAppReportSectionProps> = ({
  structuredData,
  submittedFrequencyIds,
  copiedFreqId,
  sharingFreqId,
  onCopyInterval,
  onShareInterval,
  onShareCorrective,
}) => {
  const hasNoData =
    submittedFrequencyIds.length === 0 &&
    (!structuredData.corrective_entries || structuredData.corrective_entries.length === 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-8 space-y-4">
        {hasNoData ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs text-center text-slate-500 text-xs">
            Belum ada data preventive atau corrective yang disubmit pada shift ini.
          </div>
        ) : (
          <>
            {submittedFrequencyIds.map((freqId) => {
              const freqName = INTERVAL_NAMES[freqId] || 'PENGUJIAN';
              const waTextForInterval = generateWhatsAppReportText(structuredData, freqId);
              const isCopied = copiedFreqId === freqId;

              return (
                <div key={freqId} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2.5 gap-2">
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-bold text-slate-800">
                        Preventive {freqName}
                      </h3>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                        Laporan WhatsApp {freqName}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => onCopyInterval(waTextForInterval, freqId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{isCopied ? 'Tercopy!' : 'Copy Text'}</span>
                      </button>

                      <button
                        onClick={() => onShareInterval(waTextForInterval, freqId)}
                        disabled={sharingFreqId === freqId}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-60"
                      >
                        {sharingFreqId === freqId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>{sharingFreqId === freqId ? 'Membuka...' : 'Kirim Laporan'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-900 text-emerald-400 font-mono text-xs p-5 rounded-2xl whitespace-pre-wrap leading-relaxed shadow-inner overflow-x-auto selection:bg-emerald-800 selection:text-white max-h-[350px] overflow-y-auto">
                    {waTextForInterval}
                  </div>
                </div>
              );
            })}

            {structuredData.corrective_entries && structuredData.corrective_entries.length > 0 && (() => {
              const correctiveWaText = generateCorrectiveWhatsAppReportText(structuredData);
              const isCorrectiveCopied = copiedFreqId === 999;

              return (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2">
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-bold text-slate-800">
                        Corrective Maintenance
                      </h3>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                        Laporan WhatsApp Corrective
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => onCopyInterval(correctiveWaText, 999)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        {isCorrectiveCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{isCorrectiveCopied ? 'Tercopy!' : 'Copy Text'}</span>
                      </button>

                      <button
                        onClick={() => onShareCorrective(correctiveWaText)}
                        disabled={sharingFreqId === 999}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-60"
                      >
                        {sharingFreqId === 999 ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>{sharingFreqId === 999 ? 'Membuka...' : 'Kirim Laporan'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-900 text-emerald-400 font-mono text-xs p-5 rounded-2xl whitespace-pre-wrap leading-relaxed shadow-inner overflow-x-auto selection:bg-emerald-800 selection:text-white max-h-[350px] overflow-y-auto">
                    {correctiveWaText}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>

      <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 h-fit">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Metrik Shift
        </h3>

        <div className="space-y-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 block font-semibold">Tanggal &amp; Shift</span>
            <span className="font-bold text-slate-800 text-sm">
              {structuredData.operational_date} ({structuredData.shift})
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 block font-semibold">Jam Pemeriksaan</span>
            <span className="font-bold text-slate-800 text-sm">
              {formatTimeRange(structuredData.start_time, structuredData.end_time)}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 block font-semibold">Teknisi On Duty</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {structuredData.technicians.map((t, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold text-[11px]"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
