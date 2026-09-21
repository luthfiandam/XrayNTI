import React from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Equipment } from '../../types';

interface PreventiveFormHeaderProps {
  selectedEquipment: Equipment;
  onBackToList: () => void;
  activeSteps: number[];
  mobileStep: number;
  onSelectMobileStep: (step: number) => void;
}

export const PreventiveFormHeader: React.FC<PreventiveFormHeaderProps> = ({
  selectedEquipment,
  onBackToList,
  activeSteps,
  mobileStep,
  onSelectMobileStep,
}) => {
  return (
    <div className="space-y-3">
      {/* Banner Card for Selected Equipment Info */}
      <div className="bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-xl p-3.5 sm:p-4 shadow-md shadow-indigo-500/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-indigo-400/30">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
            {selectedEquipment.name}
          </h2>
          <p className="text-xs font-mono font-bold text-indigo-100 mt-0.5">
            {selectedEquipment.equipment_code} • SN: {selectedEquipment.serial_number || 'N/A'}
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToList}
          className="bg-white hover:bg-slate-100 text-indigo-950 font-bold text-xs px-3.5 py-1.5 rounded-full transition-all shadow-xs flex items-center gap-1.5 cursor-pointer text-nowrap self-stretch sm:self-auto justify-center"
        >
          <ArrowLeft className="w-4 h-4 text-indigo-700" />
          <span>Ganti Mesin</span>
        </button>
      </div>

      {/* Mobile & Tablet Step Wizard Tabs */}
      <div className="block lg:hidden bg-white border border-slate-200 rounded-xl p-1 shadow-xs">
        <div className={`grid ${activeSteps.length === 4 ? 'grid-cols-4' : 'grid-cols-3'} gap-1 text-center`}>
          {activeSteps.map((stepNum, idx) => {
            let label = '';
            if (stepNum === 1) label = '1. Foto';
            else if (stepNum === 2) label = '2. Tegangan';
            else if (stepNum === 3) label = `${idx + 1}. Checklist`;
            else if (stepNum === 4) label = `${idx + 1}. Selesai`;

            return (
              <button
                key={stepNum}
                type="button"
                onClick={() => onSelectMobileStep(stepNum)}
                className={`py-2 px-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  mobileStep === stepNum
                    ? 'bg-[#6366f1] text-white shadow-xs'
                    : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
