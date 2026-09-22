import React, { useState, useMemo, useEffect } from 'react';
import { compressImage } from '../utils/imageCompressor';
import { applyWatermark, buildDriveFolderPath } from '../utils/watermark';
import { CorrectiveReport, Equipment, EquipmentType, Location, ShiftType } from '../types';
import { getLocalDateString } from '../utils/technicianSchedule';
import { formatIndonesianDate, formatTimeRange } from '../utils/timeFormat';
import { shareReport } from '../utils/webShareUtils';
import { generatePhotoCollageFile } from '../utils/collageService';
import { processAndUploadCorrectiveEvidences } from '../services/evidenceService';
import { getRecurringFaultsForEquipment } from '../utils/faultDetection';
import { saveComponentReplacement } from '../services/componentReplacementService';
import {
  formatCorrectiveTelegramHtml,
  sendTelegramMessage,
  getTelegramShareUrl,
  convertHtmlToPlainText,
  getStoredTelegramConfig,
} from '../services/telegramService';
import { toast } from './Toast';
import { CorrectiveReportsTable } from './corrective/CorrectiveReportsTable';
import {
  Wrench,
  Plus,
  CheckCircle2,
  Camera,
  Trash2,
  Copy,
  Send,
  X,
  FileText,
  Clock,
  User,
  AlertTriangle,
  Upload,
  Check,
  Share2,
  Cpu,
  Flame,
} from 'lucide-react';

interface CorrectiveViewProps {
  correctiveReports: CorrectiveReport[];
  equipments: Equipment[];
  equipmentTypes?: EquipmentType[];
  locations: Location[];
  onAddCorrective: (report: Omit<CorrectiveReport, 'id'>) => void | Promise<void>;
  technicianNames: string[];
  shift?: ShiftType;
  operationalDate?: string;
}

export const CorrectiveView: React.FC<CorrectiveViewProps> = ({
  correctiveReports,
  equipments,
  equipmentTypes = [],
  locations,
  onAddCorrective,
  technicianNames,
  shift = 'Pagi',
  operationalDate = '',
}) => {
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingTelegram, setIsSendingTelegram] = useState(false);

  // Equipment Selection Split (Jenis Mesin -> Peralatan)
  const defaultTypeId = equipmentTypes[0]?.id || 1;
  const [selectedTypeId, setSelectedTypeId] = useState<number>(defaultTypeId);

  const filteredEquipments = useMemo(
    () => (equipments || []).filter((e) => e && e.equipment_type_id === Number(selectedTypeId) && e.active),
    [equipments, selectedTypeId]
  );
  const [equipmentId, setEquipmentId] = useState<number>(
    filteredEquipments[0]?.id || (equipments || [])[0]?.id || 1
  );

  // Keep equipmentId aligned if filteredEquipments changes
  useEffect(() => {
    if (filteredEquipments.length > 0 && !filteredEquipments.some((e) => e.id === equipmentId)) {
      if (filteredEquipments[0]?.id) {
        setEquipmentId(filteredEquipments[0].id);
      }
    }
  }, [filteredEquipments, equipmentId]);

  // Time & Date State
  const now = new Date();
  const defaultStart = `${String(now.getHours()).padStart(2, '0')}.${String(
    now.getMinutes()
  ).padStart(2, '0')}`;
  const endHour = new Date(now.getTime() + 30 * 60000);
  const defaultEnd = `${String(endHour.getHours()).padStart(2, '0')}.${String(
    endHour.getMinutes()
  ).padStart(2, '0')}`;

  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(defaultEnd);

  // Selected Technicians
  const availableTechs = useMemo(
    () => (technicianNames.length > 0 ? technicianNames : ['Luthfi', 'Zaky', 'Yoan', 'Fariz']),
    [technicianNames]
  );
  const [selectedTechs, setSelectedTechs] = useState<string[]>(availableTechs);

  // Form Inputs
  const [problemDescription, setProblemDescription] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [result, setResult] = useState<'Resolved' | 'Pending Sparepart' | 'Temporary Fix'>('Resolved');
  const [resultText, setResultText] = useState('Xray sudah bisa di Gunakan dengan Normal 🙏🏻');
  const [notes, setNotes] = useState('-');

  // Photos State (Max 10)
  const [photos, setPhotos] = useState<string[]>([]);

  // Spare Part Replacement State
  const [recordReplacement, setRecordReplacement] = useState(false);
  const [componentName, setComponentName] = useState('');
  const [partSerialNumber, setPartSerialNumber] = useState('');
  const [partOrigin, setPartOrigin] = useState<'Baru' | 'Kolekan Cadangan' | 'Rekondisi'>('Baru');
  const [replacementReason, setReplacementReason] = useState('');

  // Detect recurring faults for selected equipment (>= 3 occurrences in 30 days)
  const recurringFaultsForSelected = useMemo(() => {
    return getRecurringFaultsForEquipment(Number(equipmentId), correctiveReports, 30, 3);
  }, [equipmentId, correctiveReports]);

  // WhatsApp Modal State
  const [generatedReportText, setGeneratedReportText] = useState<string | null>(null);
  const [copiedToast, setCopiedToast] = useState(false);

  // Update selected equipment when equipment type changes
  const handleTypeChange = (typeId: number) => {
    setSelectedTypeId(typeId);
    const available = equipments.filter((e) => e.equipment_type_id === typeId && e.active);
    if (available.length > 0 && available[0]?.id) {
      setEquipmentId(available[0].id);
    }
  };

  // Handle Photo Uploads (Max 10)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const fileList = Array.from(e.target.files) as File[];

    if (photos.length + fileList.length > 10) {
      toast.warning('Batas Foto', 'Maksimal foto yang dapat diunggah adalah 10 foto.');
    }

    const availableSlots = 10 - photos.length;
    const selectedFiles: File[] = fileList.slice(0, availableSlots);

    const eq = (equipments || []).find((item) => item && item.id === Number(equipmentId));
    const loc = (locations || []).find((l) => l && l.id === eq?.location_id);
    const eqType = (equipmentTypes || []).find((t) => t && t.id === eq?.equipment_type_id);

    const watermarkOpts = {
      equipmentName: eq?.name || 'Equipment',
      locationName: loc?.name || '',
      equipmentType: eqType?.name || '',
      operationalDate: operationalDate || getLocalDateString(new Date()),
      time: startTime || '08:00',
      shift: shift,
      reportType: 'CORRECTIVE' as const,
    };

    try {
      const watermarkedPhotos = await Promise.all(
        selectedFiles.map((file: File) => applyWatermark(file, watermarkOpts, 1600, 0.85))
      );
      setPhotos((prev) => [...prev, ...watermarkedPhotos].slice(0, 10));
    } catch (err) {
      console.error('Corrective photo watermark/compression error:', err);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleTechnician = (tech: string) => {
    if (selectedTechs.includes(tech)) {
      if (selectedTechs.length === 1) {
        toast.warning('Teknisi Diperlukan', 'Pilih minimal satu teknisi bertugas.');
        return;
      }
      setSelectedTechs((prev) => prev.filter((t) => t !== tech));
    } else {
      setSelectedTechs((prev) => [...prev, tech]);
    }
  };

  // Format WhatsApp Text helper
  const buildWhatsAppText = (data: {
    dateObj: Date;
    startTime: string;
    endTime: string;
    technicians: string[];
    equipmentName: string;
    problem: string;
    action: string;
    resultText: string;
    notes: string;
  }) => {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = [
      'Januari',
      'Februari',
      'Maret',
      'April',
      'Mei',
      'Juni',
      'Juli',
      'Agustus',
      'September',
      'Oktober',
      'November',
      'Desember',
    ];

    const dayName = days[data.dateObj.getDay()];
    const dateNum = String(data.dateObj.getDate()).padStart(2, '0');
    const monthName = months[data.dateObj.getMonth()];
    const year = data.dateObj.getFullYear();
    const dateFormatted = `${dayName}, ${dateNum} ${monthName} ${year}`;

    const techListFormatted = data.technicians.map((t) => `- *${t}*`).join('\n');

    const actionLines = data.action
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => (line.startsWith('-') ? line : `- ${line}`))
      .join('\n');

    return `Corrective Maintenance
Tanggal : ${dateFormatted}
Jam : ${formatTimeRange(data.startTime, data.endTime)}

Teknisi: 
${techListFormatted}

Alat: ${data.equipmentName}
Kerusakan: ${data.problem}
Tindakan:
${actionLines || '- Melakukan perbaikan peralatan'}
Hasil : ${data.resultText || 'Mesin sudah bisa digunakan dengan normal 🙏🏻'}
Notes : ${data.notes || '-'}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!problemDescription.trim() || !actionTaken.trim()) {
      toast.warning('Form Belum Lengkap', 'Mohon isi deskripsi masalah kerusakan dan tindakan perbaikan.');
      return;
    }

    setIsSubmitting(true);
    try {
      const eq = (equipments || []).find((e) => e && e.id === Number(equipmentId));
      const nowDate = new Date();
      const dateStr = getLocalDateString(nowDate);
      const code = `CR-${dateStr.replace(/-/g, '')}-${String(correctiveReports.length + 1).padStart(
        3,
        '0'
      )}`;

      const loc = (locations || []).find((l) => l && l.id === eq?.location_id);
      const eqType = (equipmentTypes || []).find((t) => t && t.id === eq?.equipment_type_id);

      const driveFolderPath = buildDriveFolderPath({
        reportType: 'CORRECTIVE',
        operationalDate: dateStr,
        shift: shift,
        equipmentType: eqType?.name || 'EQUIPMENT',
        locationName: loc?.name || 'LOCATION',
        equipmentName: eq?.name || 'Equipment',
      });

      // Upload photos to Google Drive (Zero Base64 in Database)
      let cleanEvidences: string[] = [];
      if (photos.length > 0) {
        const uploadRes = await processAndUploadCorrectiveEvidences(photos, driveFolderPath, {
          locationOrEquipment: loc?.name || eq?.name || 'LOCATION',
          startTime: startTime,
          correctiveDate: dateStr,
        });

        if (!uploadRes.success) {
          throw new Error(uploadRes.error || 'Gagal mengunggah foto evidence ke Google Drive.');
        }
        cleanEvidences = uploadRes.evidences;
      }

      const newReport: Omit<CorrectiveReport, 'id'> & { folder_path?: string } = {
        corrective_code: code,
        corrective_date: dateStr,
        equipment_id: Number(equipmentId),
        location_id: eq?.location_id || 1,
        problem_description: problemDescription,
        action_taken: actionTaken,
        result: result,
        result_text: resultText,
        technicians: selectedTechs,
        start_time: startTime,
        end_time: endTime,
        notes: notes,
        created_by: selectedTechs.join(', '),
        created_at: `${dateStr} ${startTime}`,
        evidences: cleanEvidences,
        folder_path: driveFolderPath,
      };

      await onAddCorrective(newReport);

      // Generate WhatsApp report text
      const waText = buildWhatsAppText({
        dateObj: nowDate,
        startTime: startTime,
        endTime: endTime,
        technicians: selectedTechs,
        equipmentName: eq?.name || 'Security Equipment',
        problem: problemDescription,
        action: actionTaken,
        resultText: resultText,
        notes: notes,
      });

      setGeneratedReportText(waText);

      // Auto-notify Telegram if enabled in settings
      const tgConfig = getStoredTelegramConfig();
      if (tgConfig.auto_notify_corrective) {
        try {
          const tgHtml = formatCorrectiveTelegramHtml({
            report: {
              corrective_code: code,
              problem_description: problemDescription,
              action_taken: actionTaken,
              status: result as any,
              operational_date: dateStr,
              shift,
              time_start: startTime,
              time_end: endTime,
              notes: notes,
            },
            equipment: eq,
            technicianNames: selectedTechs,
            isNew: true,
          });
          sendTelegramMessage({ message: tgHtml, parseMode: 'HTML' })
            .then((res) => {
              if (res.success) {
                toast.success('Notifikasi Telegram Terkirim', {
                  message: `Laporan gangguan ${code} telah otomatis disiarkan ke Telegram.`,
                  badge: 'Telegram Bot',
                });
              }
            })
            .catch(console.warn);
        } catch (tgErr) {
          console.warn('Gagal broadcast otomatis ke telegram:', tgErr);
        }
      }

      // Save Spare Part Replacement if recorded
      if (recordReplacement && componentName.trim()) {
        try {
          await saveComponentReplacement({
            equipment_id: Number(equipmentId),
            equipment_name: eq?.name || 'Equipment',
            component_name: componentName.trim(),
            replaced_at: dateStr,
            technician_names: selectedTechs,
            reason: replacementReason.trim() || problemDescription.trim() || 'Penggantian komponen rusak',
            corrective_code: code,
            serial_number: partSerialNumber.trim() || undefined,
            origin: partOrigin,
            notes: `Dipasang pada penanganan corrective ${code}`,
          });
          toast.success('Penggantian Komponen Dicatat', {
            message: `Komponen ${componentName.trim()} berhasil ditambahkan ke riwayat masa pakai mesin.`,
            badge: 'Spare Part',
          });
        } catch (partErr) {
          console.warn('Gagal mencatat penggantian spare part:', partErr);
        }
      }

      // Reset Form
      setProblemDescription('');
      setActionTaken('');
      setPhotos([]);
      setRecordReplacement(false);
      setComponentName('');
      setPartSerialNumber('');
      setReplacementReason('');
      setShowForm(false);
    } catch (err: any) {
      console.error('Corrective submit error:', err);
      toast.error('Gagal Menyimpan Laporan', err?.message || 'Terjadi kesalahan saat menyimpan laporan corrective.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyWA = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToast(true);
    toast.success('Format WhatsApp Disalin', {
      message: 'Format laporan penanganan gangguan telah disalin ke clipboard.',
      badge: 'Corrective',
    });
    setTimeout(() => setCopiedToast(false), 2500);
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card (Dashbyte Style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
        <div>
          <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Wrench className="w-4 h-4" />
            </div>
            <span>Corrective Maintenance</span>
          </h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Pelaporan perbaikan kerusakan &amp; penanganan masalah peralatan
          </p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-full font-bold text-xs shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
        >
          {showForm ? (
            <>
              <X className="w-4 h-4" />
              <span>Tutup Form</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              <span>+ Buat Laporan Corrective</span>
            </>
          )}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4 animate-in fade-in duration-150"
        >
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Form Laporan Perbaikan (Corrective)</span>
            </h3>
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
              Format WA Otomatis
            </span>
          </div>

          {/* Equipment Dropdown Split: Jenis Mesin & Peralatan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                1. Jenis Mesin
              </label>
              <select
                value={selectedTypeId}
                onChange={(e) => handleTypeChange(Number(e.target.value))}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200/90 rounded-full text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-[#6366f1]"
              >
                {equipmentTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.code} - {type.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                2. Lokasi / Peralatan
              </label>
              <select
                value={equipmentId}
                onChange={(e) => setEquipmentId(Number(e.target.value))}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200/90 rounded-full text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-[#6366f1]"
              >
                {filteredEquipments.map((eq) => {
                  const loc = locations.find((l) => l.id === eq.location_id);
                  return (
                    <option key={eq.id} value={eq.id}>
                      {eq.name} ({loc?.name || 'Area Bandara'})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Recurring Fault Alert Banner for Selected Equipment */}
          {recurringFaultsForSelected.length > 0 && (
            <div className="space-y-2 pt-1">
              {recurringFaultsForSelected.map((rf, idx) => (
                <div
                  key={idx}
                  className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-950 shadow-2xs"
                >
                  <Flame className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-extrabold flex items-center gap-2 flex-wrap">
                      <span className="text-amber-900">⚠️ Recurring Fault Terdeteksi:</span>
                      <span className="bg-amber-200/90 text-amber-900 px-2 py-0.5 rounded-md text-[11px] font-black">
                        {rf.fault_keyword} ({rf.occurrences_count}x dalam 30 hari)
                      </span>
                    </div>
                    <div className="text-[11px] text-amber-900/80 leading-relaxed">
                      Mesin ini mengalami pola kendala berulang. Rekomendasi teknis: {rf.recommendation}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Jam Pengerjaan & Teknisi */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Jam Mulai</span>
              </label>
              <input
                type="text"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="misal: 13.30"
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200/90 rounded-full text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-[#6366f1]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Jam Selesai</span>
              </label>
              <input
                type="text"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                placeholder="misal: 14.00"
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200/90 rounded-full text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-[#6366f1]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Hasil / Status Perbaikan
              </label>
              <select
                value={result}
                onChange={(e) =>
                  setResult(e.target.value as 'Resolved' | 'Pending Sparepart' | 'Temporary Fix')
                }
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200/90 rounded-full text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-[#6366f1]"
              >
                <option value="Resolved">Resolved (Selesai/Normal)</option>
                <option value="Temporary Fix">Temporary Fix (Perbaikan Sementara)</option>
                <option value="Pending Sparepart">Pending Sparepart (Menunggu Suku Cadang)</option>
              </select>
            </div>
          </div>

          {/* Teknisi Multi-Select */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Pilih Teknisi Bertugas</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {availableTechs.map((tech) => {
                const isSelected = selectedTechs.includes(tech);
                return (
                  <button
                    key={tech}
                    type="button"
                    onClick={() => toggleTechnician(tech)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                      isSelected
                        ? 'bg-[#6366f1] text-white border-[#6366f1] shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200/90 hover:bg-slate-100'
                    }`}
                  >
                    <Check className={`w-3.5 h-3.5 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                    <span>{tech}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Kerusakan */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Kerusakan (Problem Description)
            </label>
            <textarea
              rows={2}
              value={problemDescription}
              onChange={(e) => setProblemDescription(e.target.value)}
              placeholder="Contoh: Air tumpah kedalam baki conveyor belt."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/90 rounded-2xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-[#6366f1]"
            ></textarea>
          </div>

          {/* Tindakan */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Tindakan (Action Taken) - Pisahkan per baris
            </label>
            <textarea
              rows={3}
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              placeholder={`Contoh:\nMelakukan pengecekan tumpahan air di conveyor belt, dalam tunnel, dan didalam mesin xray.\nMelakukan restart mesin xray\nMelakukan kalibrasi detector line.`}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/90 rounded-2xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-[#6366f1] font-mono"
            ></textarea>
          </div>

          {/* Hasil & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Pesan Hasil Laporan WA
              </label>
              <input
                type="text"
                value={resultText}
                onChange={(e) => setResultText(e.target.value)}
                placeholder="Contoh: Xray sudah bisa di Gunakan dengan Normal 🙏🏻"
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200/90 rounded-full text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-[#6366f1]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Catatan Tambahan (Notes)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Catatan tambahan (default: -)"
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200/90 rounded-full text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-[#6366f1]"
              />
            </div>
          </div>

          {/* Photo Upload Field (Max 10) */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-indigo-600" />
                <span>Upload Foto Dokumentasi Corrective ({photos.length}/10 Foto)</span>
              </label>

              {photos.length < 10 && (
                <label className="cursor-pointer px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold transition-all inline-flex items-center gap-1.5 border border-indigo-100">
                  <Upload className="w-3.5 h-3.5" />
                  <span>+ Tambah Foto</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {/* Photo Thumbnails Preview Grid */}
            {photos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {photos.map((photo, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-square rounded-2xl overflow-hidden border border-slate-200/90 group bg-slate-100"
                  >
                    <img
                      src={photo}
                      alt={`Foto Corrective ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 transition-all cursor-pointer shadow-md"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-xs">
                      #{idx + 1}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 border border-dashed border-slate-200/90 rounded-2xl text-center bg-slate-50/50">
                <p className="text-xs text-slate-400 font-medium">
                  Belum ada foto diunggah. Anda dapat mengunggah hingga 10 foto bukti perbaikan.
                </p>
              </div>
            )}
          </div>

          {/* Spare Part / Component Replacement Field */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={recordReplacement}
                  onChange={(e) => setRecordReplacement(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                <Cpu className="w-4 h-4 text-indigo-600" />
                <span>Catat Penggantian Spare Part / Komponen Mesin?</span>
              </label>
              {recordReplacement && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Masa Pakai Akan Dilacak
                </span>
              )}
            </div>

            {recordReplacement && (
              <div className="p-4 bg-indigo-50/40 border border-indigo-100 rounded-2xl space-y-3 animate-in fade-in duration-150">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                      Nama Komponen
                    </label>
                    <input
                      type="text"
                      value={componentName}
                      onChange={(e) => setComponentName(e.target.value)}
                      placeholder="cth: Detector Board, Solenoid Shutter"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                      Nomor Seri (S/N)
                    </label>
                    <input
                      type="text"
                      value={partSerialNumber}
                      onChange={(e) => setPartSerialNumber(e.target.value)}
                      placeholder="cth: SN-9942A (opsional)"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                      Asal Komponen
                    </label>
                    <select
                      value={partOrigin}
                      onChange={(e) => setPartOrigin(e.target.value as any)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="Baru">Baru (Gudang AVSEC)</option>
                      <option value="Kolekan Cadangan">Kolekan dari Mesin Cadangan</option>
                      <option value="Rekondisi">Rekondisi / Servis Ulang</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Alasan Penggantian
                  </label>
                  <input
                    type="text"
                    value={replacementReason}
                    onChange={(e) => setReplacementReason(e.target.value)}
                    placeholder="Kosongkan jika sama dengan deskripsi kerusakan"
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-full text-xs transition-all cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 font-bold rounded-full text-xs shadow-md transition-all flex items-center gap-1.5 text-white disabled:opacity-60 disabled:cursor-not-allowed ${
                isSubmitting
                  ? 'bg-slate-400 cursor-not-allowed shadow-none'
                  : 'bg-[#6366f1] hover:bg-[#4f46e5] shadow-indigo-500/20 cursor-pointer'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan & Buat Laporan WA'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Generated WhatsApp Report Modal */}
      {generatedReportText && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in duration-150 relative border border-slate-200/80">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-emerald-600">
                <Share2 className="w-5 h-5" />
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900">Format Laporan WhatsApp</h3>
              </div>
              <button
                onClick={() => setGeneratedReportText(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 font-mono text-xs text-slate-800 whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed select-all">
              {generatedReportText}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleCopyWA(generatedReportText)}
                className="w-full sm:w-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-full text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {copiedToast ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700">Berhasil Disalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-600" />
                    <span>Salin Laporan WA</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isSendingTelegram}
                onClick={async () => {
                  setIsSendingTelegram(true);
                  try {
                    const eq = equipments.find((e) => e.id === Number(equipmentId));
                    const tgHtml = formatCorrectiveTelegramHtml({
                      report: {
                        corrective_code: 'CR-' + new Date().toISOString().slice(0, 10).replace(/-/g, ''),
                        problem_description: problemDescription || 'Laporan gangguan peralatan',
                        action_taken: actionTaken || 'Tindakan perbaikan telah dilakukan',
                        status: result as any,
                        operational_date: operationalDate,
                        shift,
                        time_start: startTime,
                        time_end: endTime,
                        notes: notes,
                      },
                      equipment: eq,
                      technicianNames: selectedTechs,
                      isNew: true,
                    });
                    const res = await sendTelegramMessage({
                      message: tgHtml,
                      parseMode: 'HTML',
                    });
                    if (res.success) {
                      toast.success('Disiarkan ke Telegram', {
                        message: 'Laporan perbaikan berhasil dikirim ke bot/grup Telegram.',
                        badge: 'Telegram Bot',
                      });
                    } else {
                      const plain = convertHtmlToPlainText(tgHtml);
                      window.open(getTelegramShareUrl(plain), '_blank');
                      toast.info('Buka Telegram Web', {
                        message: `${res.error || 'Bot belum diatur'}. Membuka tautan Telegram.`,
                        badge: 'Telegram',
                      });
                    }
                  } catch (err: any) {
                    toast.error('Gagal Mengirim Telegram', {
                      message: err.message || 'Terjadi kesalahan jaringan.',
                    });
                  } finally {
                    setIsSendingTelegram(false);
                  }
                }}
                className="w-full sm:w-auto px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-full text-xs shadow-md shadow-sky-200 transition-all flex items-center justify-center gap-2 text-center cursor-pointer disabled:opacity-60"
              >
                <Send className="w-4 h-4" />
                <span>{isSendingTelegram ? 'Mengirim...' : 'Kirim Telegram'}</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  try {
                    let file: File | undefined = undefined;
                    if (photos.length > 0) {
                      const photosList = photos.map((url, i) => ({
                        key: `photo_${i}`,
                        title: `Foto ${i + 1}`,
                        dataUrl: url,
                      }));
                      file = await generatePhotoCollageFile(
                        {
                          photos: photosList,
                          equipmentName: equipments.find((e) => e.id === Number(equipmentId))?.name || 'Equipment',
                          technicians: selectedTechs,
                        },
                        `Kolase_Corrective_${operationalDate || 'Laporan'}.jpg`
                      );
                    }
                    await shareReport({
                      title: 'Laporan Corrective Maintenance',
                      text: generatedReportText,
                      files: file ? [file] : undefined,
                    });
                  } catch (e) {
                    console.warn('[WebShare] Gagal share corrective, fallback ke WA:', e);
                    window.open(`https://wa.me/?text=${encodeURIComponent(generatedReportText)}`, '_blank');
                  }
                }}
                className="w-full sm:w-auto px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-full text-xs shadow-md shadow-emerald-200 transition-all flex items-center justify-center gap-2 text-center cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Kirim Laporan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List of Corrective Reports History & Filterable Table */}
      <CorrectiveReportsTable
        correctiveReports={correctiveReports}
        equipments={equipments}
        equipmentTypes={equipmentTypes}
        locations={locations}
        onSelectReportForWa={(_report, formattedWaText) => {
          setGeneratedReportText(formattedWaText);
        }}
      />
    </div>
  );
};
