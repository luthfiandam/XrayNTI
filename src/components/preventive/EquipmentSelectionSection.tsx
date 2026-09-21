import React from 'react';
import {
  Equipment,
  EquipmentType,
  ChecklistFrequency,
  PreventiveEntry,
} from '../../types';
import {
  Clock,
  Calendar,
  FileText,
  Zap,
  ShieldCheck,
  RefreshCw,
  ArrowLeft,
  Check,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface EquipmentSelectionSectionProps {
  preventiveFlowStep: 'interval' | 'category' | 'equipment';
  onFlowStepChange: (step: 'interval' | 'category' | 'equipment') => void;
  selectedFrequencyId: number;
  onSelectFrequencyId: (freqId: number) => void;
  selectedTypeFilter: number | 'ALL';
  onSelectTypeFilter: (typeId: number | 'ALL') => void;
  equipmentTypes: EquipmentType[];
  frequencies: ChecklistFrequency[];
  equipments: Equipment[];
  filteredEquipments: Equipment[];
  baseCategoryEquipments: Equipment[];
  preventiveEntries: PreventiveEntry[];
  currentPeriodKey: string;
  harianCount: number;
  mingguanCount: number;
  bulananCount: number;
  triwulanCount: number;
  semesteranCount: number;
  tahunanCount: number;
  getMachineIntervalStatusBadge: (eqId: number) => { label: string; className: string };
  isMatchingContextEntry: (pe: PreventiveEntry, eqId: number, freqId: number, targetPeriodKey: string) => boolean;
  onSelectEquipment: (eqId: number) => void;
  operationalDate?: string;
  shift?: string;
  technicianNames?: string[];
  activeDatasetId?: string;
}

export const EquipmentSelectionSection: React.FC<EquipmentSelectionSectionProps> = ({
  preventiveFlowStep,
  onFlowStepChange,
  selectedFrequencyId,
  onSelectFrequencyId,
  selectedTypeFilter,
  onSelectTypeFilter,
  equipmentTypes,
  frequencies,
  equipments,
  filteredEquipments,
  baseCategoryEquipments,
  preventiveEntries,
  currentPeriodKey,
  harianCount,
  mingguanCount,
  bulananCount,
  triwulanCount,
  semesteranCount,
  tahunanCount,
  getMachineIntervalStatusBadge,
  isMatchingContextEntry,
  onSelectEquipment,
  operationalDate,
  shift,
  technicianNames,
  activeDatasetId = 'default',
}) => {
  const INTERVAL_OPTIONS = [
    { id: 1, name: 'Harian', desc: 'Pemeriksaan setiap shift', count: harianCount, icon: Clock },
    { id: 2, name: 'Mingguan', desc: 'Pemeriksaan 1 minggu sekali', count: mingguanCount, icon: Calendar },
    { id: 3, name: 'Bulanan', desc: 'Pemeriksaan 1 bulan sekali', count: bulananCount, icon: FileText },
    { id: 4, name: 'Triwulan', desc: 'Pemeriksaan 3 bulan sekali', count: triwulanCount, icon: Zap },
    { id: 5, name: 'Semesteran', desc: 'Pemeriksaan 6 bulan sekali', count: semesteranCount, icon: ShieldCheck },
    { id: 6, name: 'Tahunan', desc: 'Pemeriksaan 1 tahun sekali', count: tahunanCount, icon: RefreshCw },
  ];

  return (
    <div className="space-y-3 w-full">
      {/* Unified Step Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 sm:p-4 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-slate-100 text-slate-800 font-bold text-xs rounded border border-slate-300 uppercase tracking-wider">
              {preventiveFlowStep === 'interval'
                ? 'TAHAP 1 / 3'
                : preventiveFlowStep === 'category'
                ? 'TAHAP 2 / 3'
                : 'TAHAP 3 / 3'}
            </span>
          </div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
            {preventiveFlowStep === 'interval'
              ? 'Pilih Interval Pemeriksaan'
              : preventiveFlowStep === 'category'
              ? 'Pilih Kategori Peralatan'
              : 'Daftar Peralatan ' + (equipmentTypes.find((t) => t && t.id === selectedTypeFilter)?.code || '')}
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {preventiveFlowStep === 'interval'
              ? 'Tentukan rentang waktu pemeriksaan preventif'
              : preventiveFlowStep === 'category'
              ? 'Pilih kategori peralatan keamanan penerbangan'
              : 'Pilih unit peralatan untuk mulai pengisian checklist'}
          </p>
        </div>

        {/* Step Progress Indicator */}
        <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0 self-stretch sm:self-auto justify-between sm:justify-start">
          <button
            onClick={() => onFlowStepChange('interval')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              preventiveFlowStep === 'interval'
                ? 'bg-blue-600 text-white font-bold shadow-sm shadow-blue-500/25'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            1. Interval
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <button
            onClick={() => onFlowStepChange('category')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              preventiveFlowStep === 'category'
                ? 'bg-blue-600 text-white font-bold shadow-sm shadow-blue-500/25'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. Kategori
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
              preventiveFlowStep === 'equipment'
                ? 'bg-blue-600 text-white font-bold shadow-sm shadow-blue-500/25'
                : 'text-slate-400'
            }`}
          >
            3. Checklist
          </span>
        </div>
      </div>

      {/* STEP 1: Compact Selectable Interval Tiles */}
      {preventiveFlowStep === 'interval' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {INTERVAL_OPTIONS.map((interval) => {
              const Icon = interval.icon;
              const total = equipments.length;
              const isDone = interval.count >= total && total > 0;
              const isSelected = selectedFrequencyId === interval.id;

              return (
                <div
                  key={interval.id}
                  onClick={() => {
                    onSelectFrequencyId(interval.id);
                    onFlowStepChange('category');
                  }}
                  className={`min-h-[48px] sm:min-h-[54px] rounded-xl p-2.5 sm:p-3 border flex items-center justify-between cursor-pointer transition-colors active:scale-[0.99] ${
                    isSelected
                      ? 'bg-blue-50/80 border-blue-500 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3
                          className={`text-xs sm:text-sm tracking-tight truncate font-bold ${
                            isSelected ? 'text-blue-950' : 'text-slate-900'
                          }`}
                        >
                          {interval.name}
                        </h3>
                        {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                      </div>
                      <p className="text-xs text-slate-500 font-medium truncate hidden md:block mt-0.5">
                        {interval.desc}
                      </p>
                    </div>
                  </div>

                  {/* Progress Badge */}
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 ml-2 whitespace-nowrap ${
                      isDone
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        : isSelected
                        ? 'bg-blue-100 text-blue-900 border border-blue-300'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {interval.count}/{total}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 2: Category Selection */}
      {preventiveFlowStep === 'category' && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <button
              onClick={() => onFlowStepChange('interval')}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-semibold rounded-md text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Interval</span>
            </button>
            <span className="text-xs font-semibold text-slate-600">
              Interval:{' '}
              <strong className="text-slate-900 font-bold">
                {frequencies.find((f) => f && f.id === selectedFrequencyId)?.name || 'Harian'}
              </strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
            {equipmentTypes.filter(Boolean).map((type) => {
              const typeEquipments = equipments.filter((e) => e && e.equipment_type_id === type.id);
              const doneCount = typeEquipments.filter((eq) =>
                preventiveEntries.some((pe) =>
                  isMatchingContextEntry(pe, eq.id, selectedFrequencyId, currentPeriodKey)
                )
              ).length;

              return (
                <div
                  key={type.id}
                  onClick={() => {
                    onSelectTypeFilter(type.id);
                    onFlowStepChange('equipment');
                  }}
                  className="bg-white border border-slate-200 hover:border-slate-400 hover:bg-slate-50/50 rounded-lg p-3 sm:p-3.5 shadow-2xs flex items-center justify-between cursor-pointer transition-colors group"
                >
                  <div>
                    <h3 className="font-bold text-slate-900 text-xs sm:text-sm">{type.name}</h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {typeEquipments.length} Unit &bull; <span className="text-emerald-800 font-bold">{doneCount} Selesai</span>
                    </p>
                  </div>

                  <div className="w-7 h-7 rounded bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 group-hover:text-slate-900 group-hover:bg-slate-200 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 3: Equipment Grid */}
      {preventiveFlowStep === 'equipment' && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <button
              onClick={() => onFlowStepChange('category')}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-semibold rounded-md text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Kategori</span>
            </button>
            <span className="text-xs font-semibold text-slate-600">
              Kategori:{' '}
              <strong className="text-slate-900 font-bold">
                {equipmentTypes.find((t) => t && t.id === selectedTypeFilter)?.name || 'Semua'}
              </strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
            {filteredEquipments.map((eq) => {
              const badge = getMachineIntervalStatusBadge(eq.id);
              const entry = preventiveEntries.find((pe) =>
                isMatchingContextEntry(pe, eq.id, selectedFrequencyId, currentPeriodKey)
              );
              const isCompleted = badge.label === 'Selesai' || !!entry;

              return (
                <div
                  key={eq.id}
                  onClick={() => onSelectEquipment(eq.id)}
                  className={`bg-white border rounded-lg p-3 sm:p-3.5 shadow-2xs flex flex-col justify-between cursor-pointer transition-colors ${
                    isCompleted
                      ? 'border-emerald-300 bg-emerald-50/20 hover:border-emerald-400'
                      : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 text-xs font-bold rounded border select-none ${
                          isCompleted
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-2xs'
                            : 'bg-amber-50 border-amber-200 text-amber-800 shadow-2xs'
                        }`}
                        title={isCompleted ? 'Selesai diperiksa' : 'Belum diperiksa'}
                      >
                        {isCompleted ? '✅' : '⌛'}
                      </span>
                      <h3 className="font-bold text-slate-900 text-xs sm:text-sm mt-1">{eq.name}</h3>
                      <p className="text-xs font-mono font-bold text-slate-600 mt-0.5">{eq.equipment_code}</p>
                    </div>

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-600 font-medium">
                      {entry ? 'Sudah diisi' : 'Belum diisi'}
                    </span>
                    <button
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        entry
                          ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
                          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs shadow-blue-500/20'
                      }`}
                    >
                      {entry ? 'Edit' : 'Isi Form'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
