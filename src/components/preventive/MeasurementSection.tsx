import React from 'react';
import { Sliders } from 'lucide-react';
import { MeasurementValue } from '../../types';

interface MeasurementSectionProps {
  viewType: 'single' | 'dual';
  onToggleViewType: () => void;
  genAMeasurement: MeasurementValue;
  onGenAMeasurementChange: (val: MeasurementValue) => void;
  genBMeasurement: MeasurementValue;
  onGenBMeasurementChange: (val: MeasurementValue) => void;
  mobileStep: number;
}

export const MeasurementSection: React.FC<MeasurementSectionProps> = ({
  viewType,
  onToggleViewType,
  genAMeasurement,
  onGenAMeasurementChange,
  genBMeasurement,
  onGenBMeasurementChange,
  mobileStep,
}) => {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs space-y-3.5 ${
        mobileStep !== 2 ? 'hidden lg:block' : ''
      }`}
    >
      <div className="border-b border-slate-100 pb-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <span>Pengukuran Tegangan</span>
          </h3>
          <p className="text-xs text-slate-600 mt-0.5 font-medium">
            Default menggunakan konfigurasi {viewType === 'dual' ? 'Dual View' : 'Single View'}
          </p>
        </div>

        {/* Single View / Dual View Toggle */}
        <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1.5 self-start sm:self-auto border border-slate-200">
          <span className="text-xs font-bold text-slate-700 px-2">Mode Mesin</span>
          <button
            type="button"
            onClick={onToggleViewType}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewType === 'dual'
                ? 'bg-[#6366f1] text-white shadow-xs'
                : 'bg-white text-slate-800 shadow-xs border border-slate-200'
            }`}
          >
            {viewType === 'dual' ? 'Dual View' : 'Single View'}
          </button>
        </div>
      </div>

      {/* Generator Measurements Input Grid */}
      <div className="space-y-4">
        {/* Generator A (if Dual View) */}
        {viewType === 'dual' && (
          <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3 sm:p-3.5 space-y-2.5">
            <span className="text-xs font-bold text-blue-800 uppercase tracking-wider block">
              Generator A (Side View)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Positive High Voltage
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 96.14"
                  value={genAMeasurement.positive_high_voltage ?? ''}
                  onChange={(e) =>
                    onGenAMeasurementChange({
                      ...genAMeasurement,
                      positive_high_voltage: e.target.value === '' ? 0 : parseFloat(e.target.value),
                    })
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-mono font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Negative High Voltage
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. -65.92"
                  value={genAMeasurement.negative_high_voltage ?? ''}
                  onChange={(e) =>
                    onGenAMeasurementChange({
                      ...genAMeasurement,
                      negative_high_voltage: e.target.value === '' ? 0 : parseFloat(e.target.value),
                    })
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-mono font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Heater
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 466.96"
                  value={genAMeasurement.heater_current ?? ''}
                  onChange={(e) =>
                    onGenAMeasurementChange({
                      ...genAMeasurement,
                      heater_current: e.target.value === '' ? 0 : parseFloat(e.target.value),
                    })
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-mono font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Anode
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 448.64"
                  value={genAMeasurement.anode_current ?? ''}
                  onChange={(e) =>
                    onGenAMeasurementChange({
                      ...genAMeasurement,
                      anode_current: e.target.value === '' ? 0 : parseFloat(e.target.value),
                    })
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-mono font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Generator B */}
        <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3 sm:p-3.5 space-y-2.5">
          <span className="text-xs font-bold text-blue-800 uppercase tracking-wider block">
            Generator B (Top/Bottom View)
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Positive High Voltage
              </label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 96.14"
                value={genBMeasurement.positive_high_voltage ?? ''}
                onChange={(e) =>
                  onGenBMeasurementChange({
                    ...genBMeasurement,
                    positive_high_voltage: e.target.value === '' ? 0 : parseFloat(e.target.value),
                  })
                }
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-mono font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Negative High Voltage
              </label>
              <input
                type="number"
                step="any"
                placeholder="e.g. -65.92"
                value={genBMeasurement.negative_high_voltage ?? ''}
                onChange={(e) =>
                  onGenBMeasurementChange({
                    ...genBMeasurement,
                    negative_high_voltage: e.target.value === '' ? 0 : parseFloat(e.target.value),
                  })
                }
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-mono font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Heater
              </label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 466.96"
                value={genBMeasurement.heater_current ?? ''}
                onChange={(e) =>
                  onGenBMeasurementChange({
                    ...genBMeasurement,
                    heater_current: e.target.value === '' ? 0 : parseFloat(e.target.value),
                  })
                }
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-mono font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Anode
              </label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 448.64"
                value={genBMeasurement.anode_current ?? ''}
                onChange={(e) =>
                  onGenBMeasurementChange({
                    ...genBMeasurement,
                    anode_current: e.target.value === '' ? 0 : parseFloat(e.target.value),
                  })
                }
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-mono font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
