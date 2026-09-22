import React, { useState, useEffect } from 'react';
import { applyWatermark, buildDriveFolderPath } from '../utils/watermark';
import {
  Equipment,
  EquipmentType,
  Location,
  ChecklistFrequency,
  ChecklistItem,
  PreventiveEntry,
  MeasurementValue,
  ChecklistResult,
  PreventiveEvidence,
} from '../types';
import { generatePhotoCollageUrl } from '../utils/collageService';
import { getPeriodKey } from '../utils/periodUtils';
import { normalizeShift } from '../utils/contextFilter';
import { getEquipmentPrefillData } from '../services/supabasePreventiveService';
import { processAndUploadPreventiveEvidences } from '../services/evidenceService';
import { Toast, toast } from './Toast';
import {
  PhotoDocs,
  EquipmentSelectionSection,
  PreventiveFormHeader,
  PhotoDocumentationSection,
  MeasurementSection,
  ChecklistSection,
  InspectionSummarySection,
  InspectionSummaryCard,
  MobileBottomActions,
  PhotoCollageModal,
  UploadProgressModal,
  UploadModalState,
} from './preventive';

interface PreventiveViewProps {
  equipments: Equipment[];
  equipmentTypes: EquipmentType[];
  locations?: Location[];
  frequencies: ChecklistFrequency[];
  checklistItems: ChecklistItem[];
  preventiveEntries: PreventiveEntry[];
  allPreventiveEntries?: PreventiveEntry[];
  preSelectedEquipmentId?: number | null;
  onClearPreSelectedEquipmentId?: () => void;
  onSubmitEntry: (entry: Omit<PreventiveEntry, 'id'>) => void | Promise<void>;
  onBackToDashboard: () => void;
  operationalDate?: string;
  shift?: string;
  isViewerOnly?: boolean;
}

export const PreventiveView: React.FC<PreventiveViewProps> = ({
  equipments,
  equipmentTypes,
  locations = [],
  frequencies,
  checklistItems,
  preventiveEntries,
  allPreventiveEntries,
  preSelectedEquipmentId,
  onClearPreSelectedEquipmentId,
  onSubmitEntry,
  onBackToDashboard,
  operationalDate = '',
  shift = 'Shift 1',
  isViewerOnly = false,
}) => {
  // Navigation & Machine Selection State
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(
    preSelectedEquipmentId || null
  );
  const [isMachineSelected, setIsMachineSelected] = useState<boolean>(
    Boolean(preSelectedEquipmentId)
  );

  // Step flow state: 'interval' | 'category' | 'equipment'
  const [preventiveFlowStep, setPreventiveFlowStep] = useState<'interval' | 'category' | 'equipment'>(() => {
    if (preSelectedEquipmentId) {
      return 'equipment';
    }
    return 'interval';
  });

  // Search & Filters on Grid
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<number | 'ALL'>('ALL');

  // Selected Machine Form State
  const [selectedFrequencyId, setSelectedFrequencyId] = useState<number>(1); // Harian default
  const [viewType, setViewType] = useState<'single' | 'dual'>('dual');
  const [mobileStep, setMobileStep] = useState<number>(1); // 1: Foto, 2: Tegangan, 3: Checklist, 4: Selesai

  // Photo Documentation State
  const [photoDocs, setPhotoDocs] = useState<PhotoDocs>({ bebersih: [] });

  // Photo Collage Modal State
  const [collageUrl, setCollageUrl] = useState<string | null>(null);
  const [isGeneratingCollage, setIsGeneratingCollage] = useState(false);
  const [showCollageModal, setShowCollageModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgressState, setUploadProgressState] = useState<UploadModalState>({
    isOpen: false,
    stage: 'idle',
    currentPhotoIndex: 0,
    totalPhotos: 0,
    percent: 0,
  });
  const [toastNotification, setToastNotification] = useState<{
    show: boolean;
    message: string;
  }>({ show: false, message: '' });

  // Auto scroll to top when machine form opens
  useEffect(() => {
    if (isMachineSelected) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }, [isMachineSelected, selectedEquipmentId]);

  // Auto scroll to top when mobile step changes
  useEffect(() => {
    if (isMachineSelected) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }, [mobileStep, isMachineSelected]);

  // Measurements state for X-Ray
  const [genAMeasurement, setGenAMeasurement] = useState<MeasurementValue>({
    generator: 'A',
    positive_high_voltage: 80.0,
    negative_high_voltage: -75.0,
    heater_current: 450.0,
    anode_current: 400.0,
  });

  const [genBMeasurement, setGenBMeasurement] = useState<MeasurementValue>({
    generator: 'B',
    positive_high_voltage: 80.0,
    negative_high_voltage: -75.0,
    heater_current: 500.0,
    anode_current: 450.0,
  });

  // Checklist items results state ('Baik' | 'Temuan')
  const [checklistResults, setChecklistResults] = useState<Record<number, 'Baik' | 'Temuan'>>({});
  const [notes, setNotes] = useState<string>(
    'Sudah dilakukan kalibrasi dan pembersihan. Equipment bisa digunakan dengan normal.'
  );
  const [overallStatus, setOverallStatus] = useState<'OK' | 'NG' | 'NEEDS_REPAIR'>('OK');

  // Handle preSelectedEquipmentId changes from parent
  useEffect(() => {
    if (preSelectedEquipmentId) {
      setSelectedEquipmentId(preSelectedEquipmentId);
      setIsMachineSelected(true);
      if (onClearPreSelectedEquipmentId) {
        onClearPreSelectedEquipmentId();
      }
    }
  }, [preSelectedEquipmentId, onClearPreSelectedEquipmentId]);

  // Find selected equipment and type
  const selectedEquipment = equipments.find((e) => e.id === Number(selectedEquipmentId));
  const selectedType = equipmentTypes.find((t) => t.id === selectedEquipment?.equipment_type_id);
  const isXRay = selectedType?.code === 'XRAY';
  const isHidingMeasurements = Number(selectedFrequencyId) === 1 && [2, 3, 9].includes(Number(selectedEquipment?.id));

  const currentPeriodKey = getPeriodKey(Number(selectedFrequencyId), operationalDate);

  // Check if selected equipment already has an entry submitted today for the selected interval
  const isMatchingContextEntry = (pe: PreventiveEntry, eqId: number, freqId: number, targetPeriodKey: string) => {
    if (Number(pe.equipment_id) !== Number(eqId)) return false;
    if (Number(pe.checklist_frequency_id) !== Number(freqId)) return false;
    if (normalizeShift(pe.shift) !== normalizeShift(shift)) return false;
    const peKey = (pe.period_key || '').trim() || (pe.operational_date ? getPeriodKey(freqId, pe.operational_date) : '');
    return peKey === targetPeriodKey;
  };

  const existingEntry = preventiveEntries.find((pe) =>
    isMatchingContextEntry(pe, Number(selectedEquipmentId), Number(selectedFrequencyId), currentPeriodKey)
  );

  // Load existing entry when equipment changes or reset form defaults
  useEffect(() => {
    if (!selectedEquipmentId || !selectedEquipment) return;
    setMobileStep(1);

    const entry = preventiveEntries.find((pe) =>
      isMatchingContextEntry(pe, Number(selectedEquipmentId), Number(selectedFrequencyId), currentPeriodKey)
    );

    if (entry) {
      if (entry.view_type) setViewType(entry.view_type);
      if (entry.checklist_frequency_id) setSelectedFrequencyId(entry.checklist_frequency_id);
      if (entry.notes) setNotes(entry.notes);
      if (entry.status) setOverallStatus(entry.status);

      if (entry.measurements && entry.measurements.length > 0) {
        const genA = entry.measurements.find((m) => m.generator === 'A');
        if (genA) setGenAMeasurement(genA);
        const genB = entry.measurements.find((m) => m.generator === 'B');
        if (genB) setGenBMeasurement(genB);
      }

      if (entry.checklist_results && entry.checklist_results.length > 0) {
        const resObj: Record<number, 'Baik' | 'Temuan'> = {};
        entry.checklist_results.forEach((cr) => {
          resObj[cr.checklist_item_id] = cr.status === 'Temuan' || cr.status === 'NG' ? 'Temuan' : 'Baik';
        });
        setChecklistResults(resObj);
      }

      if (entry.evidences && entry.evidences.length > 0) {
        const docs: PhotoDocs = { bebersih: [] };
        entry.evidences.forEach((ev) => {
          const cap = (ev.caption || '').toLowerCase();
          const isCollage = (ev as any).is_collage === true || cap.includes('kolase');

          // Never populate photoDocs.bebersih with the generated collage
          if (isCollage) {
            return;
          }

          if (ev.caption?.includes('Tegangan')) docs.tegangan = ev.file_path;
          else if (ev.caption?.includes('Report')) docs.report = ev.file_path;
          else if (ev.caption?.includes('Sinyal Gen A')) docs.sinyal_gen_a = ev.file_path;
          else if (ev.caption?.includes('Sinyal Gen B')) docs.sinyal_gen_b = ev.file_path;
          else if (cap.includes('bebersih') || cap.includes('dokumentasi')) {
            if (!docs.bebersih) docs.bebersih = [];
            docs.bebersih.push(ev.file_path);
          }
        });
        setPhotoDocs(docs);
      }
    } else {
      // Prefill previous measurement / view_type for this specific equipment, or fallback to equipment master default
      const prefillSourceEntries = allPreventiveEntries && allPreventiveEntries.length > 0 ? allPreventiveEntries : preventiveEntries;
      const prefill = getEquipmentPrefillData(selectedEquipment, prefillSourceEntries);
      setViewType(prefill.viewType);
      setGenAMeasurement(prefill.genAMeasurement);
      setGenBMeasurement(prefill.genBMeasurement);
      setPhotoDocs({ bebersih: [] });
      setNotes('Sudah dilakukan kalibrasi dan pembersihan. Equipment bisa digunakan dengan normal.');
      setOverallStatus('OK');
    }
  }, [selectedEquipmentId, selectedEquipment, preventiveEntries, allPreventiveEntries, selectedFrequencyId, currentPeriodKey, shift]);

  // Filter checklist items by selected equipment type and selected frequency
  const relevantChecklistItems = checklistItems.filter(
    (item) =>
      item.equipment_type_id === selectedEquipment?.equipment_type_id &&
      item.checklist_frequency_id === Number(selectedFrequencyId) &&
      item.active
  );

  // Initialize checklist results if no existing entry
  useEffect(() => {
    if (existingEntry) return;
    const initialResults: Record<number, 'Baik' | 'Temuan'> = {};
    relevantChecklistItems.forEach((item) => {
      initialResults[item.id] = 'Baik';
    });
    setChecklistResults(initialResults);
  }, [selectedEquipmentId, selectedFrequencyId, existingEntry]);

  // Handle Checklist Status Change
  const handleChecklistChange = (itemId: number, res: 'Baik' | 'Temuan') => {
    setChecklistResults((prev) => ({ ...prev, [itemId]: res }));
  };

  // Set All Checklist Items to Baik
  const handleSetAllBaik = () => {
    const updated: Record<number, 'Baik' | 'Temuan'> = {};
    relevantChecklistItems.forEach((item) => {
      updated[item.id] = 'Baik';
    });
    setChecklistResults(updated);
  };

  const getWatermarkOpts = () => {
    const locObj = locations.find((l) => l.id === selectedEquipment?.location_id);
    const typeObj = equipmentTypes.find((t) => t.id === selectedEquipment?.equipment_type_id);
    const freqObj = frequencies.find((f) => f.id === Number(selectedFrequencyId));
    const now = new Date();
    const timeFormatted = `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`;

    return {
      equipmentName: selectedEquipment?.name || 'Equipment',
      locationName: locObj?.name || selectedEquipment?.equipment_code || '',
      equipmentType: typeObj?.name || '',
      operationalDate: operationalDate || new Date().toISOString().split('T')[0],
      time: timeFormatted,
      shift: shift,
      reportType: 'PREVENTIVE' as const,
      frequencyName: freqObj?.name || freqObj?.code || 'Harian',
    };
  };

  // Photo Upload Handlers
  const handleSinglePhotoUpload = async (
    key: 'tegangan' | 'report' | 'sinyal_gen_a' | 'sinyal_gen_b',
    file: File
  ) => {
    try {
      const wmOpts = getWatermarkOpts();
      const watermarkedUrl = await applyWatermark(file, wmOpts, 1600, 0.85);
      setPhotoDocs((prev) => ({ ...prev, [key]: watermarkedUrl }));
    } catch (err) {
      console.error('Compression error:', err);
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setPhotoDocs((prev) => ({ ...prev, [key]: e.target?.result as string }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveSinglePhoto = (
    key: 'tegangan' | 'report' | 'sinyal_gen_a' | 'sinyal_gen_b'
  ) => {
    setPhotoDocs((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const handleBebersihUpload = async (files: FileList | null) => {
    if (!files) return;
    const fileList = Array.from(files) as File[];
    const maxBebersih = 9;

    try {
      const wmOpts = getWatermarkOpts();
      const watermarkedPhotos = await Promise.all(
        fileList.map((file: File) => applyWatermark(file, wmOpts, 1600, 0.85))
      );
      setPhotoDocs((prev) => {
        const existing = prev.bebersih || [];
        if (existing.length >= maxBebersih) return prev;
        return {
          ...prev,
          bebersih: [...existing, ...watermarkedPhotos].slice(0, maxBebersih),
        };
      });
    } catch (err) {
      console.error('Bebersih compression error:', err);
    }
  };

  const handleSimpleDocsUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files) as File[];

    const validFiles = fileList.filter((f) => f.type.startsWith('image/'));
    if (validFiles.length === 0) return;

    const currentCount = photoDocs.bebersih?.length || 0;
    if (currentCount + validFiles.length > 9) {
      toast.warning('Batas Foto Tercapai', 'Maksimal 9 foto dokumentasi bebersih.');
      return;
    }

    try {
      const wmOpts = getWatermarkOpts();
      const watermarkedPhotos = await Promise.all(
        validFiles.map((file: File) => applyWatermark(file, wmOpts, 1600, 0.85))
      );
      setPhotoDocs((prev) => ({
        ...prev,
        bebersih: [...(prev.bebersih || []), ...watermarkedPhotos].slice(0, 9),
      }));
    } catch (err) {
      console.error('Simple docs compression error:', err);
    }
  };

  const handleRemoveBebersih = (index: number) => {
    setPhotoDocs((prev) => ({
      ...prev,
      bebersih: (prev.bebersih || []).filter((_, i) => i !== index),
    }));
  };

  // Generate Photo Collage for WhatsApp
  const handleCreateCollage = async () => {
    const photosList: { key: string; title: string; dataUrl: string }[] = [];

    if (isXRay) {
      if (!isHidingMeasurements && photoDocs.tegangan) {
        photosList.push({ key: 'tegangan', title: '1. Foto Tegangan', dataUrl: photoDocs.tegangan });
      }
      if (photoDocs.report) {
        photosList.push({
          key: 'report',
          title: isHidingMeasurements ? '1. Foto Report' : '2. Foto Report',
          dataUrl: photoDocs.report,
        });
      }
      if (!isHidingMeasurements && photoDocs.sinyal_gen_a) {
        photosList.push({ key: 'sinyal_gen_a', title: '3. Foto Sinyal Gen A', dataUrl: photoDocs.sinyal_gen_a });
      }
      if (!isHidingMeasurements && photoDocs.sinyal_gen_b) {
        photosList.push({ key: 'sinyal_gen_b', title: '4. Foto Sinyal Gen B', dataUrl: photoDocs.sinyal_gen_b });
      }
      if (photoDocs.bebersih && photoDocs.bebersih.length > 0) {
        photoDocs.bebersih.forEach((url, i) => {
          photosList.push({
            key: `bebersih_${i}`,
            title: isHidingMeasurements ? `2. Bebersih ${i + 1}` : `5. Bebersih ${i + 1}`,
            dataUrl: url,
          });
        });
      }
    } else {
      if (photoDocs.bebersih && photoDocs.bebersih.length > 0) {
        photoDocs.bebersih.forEach((url, i) => {
          photosList.push({ key: `bebersih_${i}`, title: `Dokumentasi ${i + 1}`, dataUrl: url });
        });
      }
    }

    if (photosList.length === 0) {
      toast.info('Foto Diperlukan', 'Unggah minimal 1 foto untuk membuat kolase WhatsApp.');
      return;
    }

    setIsGeneratingCollage(true);
    try {
      const dateStr = new Date().toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const url = await generatePhotoCollageUrl({
        equipmentName: selectedEquipment?.name || 'Security Machine',
        equipmentCode: selectedEquipment?.equipment_code || 'CODE',
        serialNumber: selectedEquipment?.serial_number,
        date: dateStr,
        shift: 'Shift 1',
        technicians: ['Technician Duty'],
        photos: photosList,
      });

      setCollageUrl(url);
      setShowCollageModal(true);
    } catch (err) {
      console.error(err);
      toast.error('Gagal Membuat Kolase', 'Terjadi kesalahan saat memproses kolase foto.');
    } finally {
      setIsGeneratingCollage(false);
    }
  };

  // Dynamic active steps based on machine configuration
  const hasMeasurements = isXRay && !isHidingMeasurements;
  const activeSteps = [
    1, // Foto
    ...(hasMeasurements ? [2] : []), // Tegangan / Pengukuran
    3, // Checklist
    4, // Selesai
  ];

  // Mobile step navigation helpers
  const handlePrevStep = () => {
    const currentIndex = activeSteps.indexOf(mobileStep);
    if (currentIndex > 0) {
      setMobileStep(activeSteps[currentIndex - 1]);
    }
  };

  const handleNextStep = () => {
    const currentIndex = activeSteps.indexOf(mobileStep);
    if (currentIndex < activeSteps.length - 1) {
      setMobileStep(activeSteps[currentIndex + 1]);
    }
  };

  // Calculate Data Completeness Percentage
  const calculateCompleteness = () => {
    let score = 0;

    // Photos (25%)
    let photoCount = 0;
    if (photoDocs.tegangan) photoCount++;
    if (photoDocs.report) photoCount++;
    if (photoDocs.sinyal_gen_a) photoCount++;
    if (photoDocs.sinyal_gen_b) photoCount++;
    if (photoDocs.bebersih && photoDocs.bebersih.length > 0) photoCount += photoDocs.bebersih.length;

    if (photoCount > 0) {
      score += Math.min(25, photoCount * 5);
    }

    // Measurements (25%)
    if (isXRay && !isHidingMeasurements) {
      if (genBMeasurement.positive_high_voltage) score += 25;
    } else {
      score += 25; // N/A for non-xray or hidden measurements
    }

    // Checklist (40%)
    const filledCount = Object.keys(checklistResults).length;
    if (relevantChecklistItems.length > 0) {
      score += Math.round((filledCount / relevantChecklistItems.length) * 40);
    } else {
      score += 40;
    }

    // Notes (10%)
    if (notes.trim().length > 5) score += 10;

    return Math.min(100, score);
  };

  const completenessPercent = calculateCompleteness();

  // Form Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;

    if (isViewerOnly) {
      toast.warning('Akses Terbatas', 'Anda tidak sedang bertugas pada shift saat ini. Formulir preventif dalam mode hanya baca.');
      return;
    }

    if (!selectedEquipment) {
      toast.info('Pilih Mesin', 'Silakan pilih mesin peralatan terlebih dahulu.');
      return;
    }

    setIsSubmitting(true);
    const photos = photoDocs.bebersih || [];
    const totalPhotosToUpload = photos.length > 0 ? photos.length + 1 : 0; // individual photos + collage

    setUploadProgressState({
      isOpen: true,
      stage: photos.length > 0 ? 'collage' : 'uploading',
      currentPhotoIndex: 0,
      totalPhotos: totalPhotosToUpload,
      percent: photos.length > 0 ? 10 : 30,
      equipmentName: selectedEquipment.name,
      equipmentCode: selectedEquipment.equipment_code,
    });

    try {
      const nextSequence = preventiveEntries.length + 1;

      // Measurements array
      const measurements: MeasurementValue[] = [];
      if (isXRay && !isHidingMeasurements) {
        if (viewType === 'single') {
          measurements.push(genBMeasurement);
        } else {
          measurements.push(genAMeasurement, genBMeasurement);
        }
      }

      // Checklist results array
      const resultsArray: ChecklistResult[] = relevantChecklistItems.map((item) => ({
        checklist_item_id: item.id,
        description: item.description,
        status: checklistResults[item.id] || 'Baik',
      }));

      // Current time
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const timeString = `${hours}:${minutes}`;

      // Evidences array
      const evidencesList: PreventiveEvidence[] = [];

      const dateStr = new Date().toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      const formatSessionDate = (dString: string) => {
        if (!dString) return '';
        if (dString.includes('Jan') || dString.includes('Agt') || dString.includes('Aug') || dString.includes('Agustus') || dString.includes('Feb') || dString.includes('Mar')) {
          return dString;
        }
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
        if (dString.includes('-')) {
          const parts = dString.split('-');
          if (parts.length === 3) {
            const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            if (!isNaN(d.getTime())) {
              return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
            }
          }
        }
        return dString;
      };

      const finalDateStr = operationalDate ? formatSessionDate(operationalDate) : dateStr;

      const locObj = locations.find((l) => l.id === selectedEquipment?.location_id);
      const typeObj = equipmentTypes.find((t) => t.id === selectedEquipment?.equipment_type_id);
      const freqObj = frequencies.find((f) => f.id === Number(selectedFrequencyId));

      const driveFolderPath = buildDriveFolderPath({
        reportType: 'PREVENTIVE',
        frequencyName: freqObj?.name || 'Harian',
        operationalDate: operationalDate,
        shift: shift,
        equipmentType: typeObj?.name || 'EQUIPMENT',
        locationName: locObj?.name || selectedEquipment?.equipment_code || 'LOCATION',
        equipmentName: selectedEquipment?.name || 'Equipment',
      });

      if (photos.length > 0) {
        // Collect individual photos first
        photos.forEach((url, idx) => {
          evidencesList.push({
            id: Date.now() + idx,
            file_path: url,
            caption: `Dokumentasi Bebersih #${idx + 1}`,
            is_collage: false,
          });
        });

        try {
          setUploadProgressState((prev) => ({
            ...prev,
            stage: 'collage',
            percent: 20,
          }));

          const collageResultUrl = await generatePhotoCollageUrl({
            equipmentName: selectedEquipment.name,
            equipmentCode: selectedEquipment.equipment_code,
            serialNumber: selectedEquipment.serial_number,
            date: finalDateStr,
            shift: shift || 'Shift 1',
            technicians: ['Technician Duty'],
            photos: photos.map((url, idx) => ({
              key: `cleaning_${idx}`,
              title: `Dokumentasi Bebersih #${idx + 1}`,
              dataUrl: url,
            })),
          });
          evidencesList.push({
            id: Date.now() + 1000,
            file_path: collageResultUrl,
            caption: 'Foto Kolase',
            is_collage: true,
          });

          // Automatic download
          const link = document.createElement('a');
          link.href = collageResultUrl;
          link.download = `Collage_${selectedEquipment.equipment_code}_${finalDateStr.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch (err) {
          console.error('Gagal membuat kolase:', err);
        }
      }

      // Upload evidences to Google Drive with resilient local fallback
      let cleanEvidencesList = evidencesList;
      let driveFolderUrl: string | undefined = undefined;
      if (evidencesList.length > 0) {
        setUploadProgressState((prev) => ({
          ...prev,
          stage: 'uploading',
          currentPhotoIndex: 0,
          totalPhotos: evidencesList.length,
          percent: 25,
        }));

        try {
          const uploadRes = await processAndUploadPreventiveEvidences(evidencesList, driveFolderPath, {
            equipmentCode: selectedEquipment.equipment_code,
            locationName: selectedEquipment.name,
            operationalDate: operationalDate,
            timeStr: timeString,
            onProgress: (prog) => {
              setUploadProgressState((prev) => ({
                ...prev,
                stage: 'uploading',
                currentPhotoIndex: prog.completed,
                totalPhotos: prog.total,
                currentItemName: prog.currentItemName,
                percent: Math.min(90, 25 + Math.round((prog.completed / Math.max(1, prog.total)) * 65)),
              }));
            },
          });

          if (uploadRes.evidences && uploadRes.evidences.length > 0) {
            cleanEvidencesList = uploadRes.evidences;
          }
          if (uploadRes.folder_url) {
            driveFolderUrl = uploadRes.folder_url;
          }
          if (uploadRes.warning) {
            console.warn('[PreventiveView] Upload note:', uploadRes.warning);
          }
        } catch (uploadErr: any) {
          console.warn('[PreventiveView] Drive upload failed, continuing with local evidences:', uploadErr);
        }
      }

      setUploadProgressState((prev) => ({
        ...prev,
        stage: 'saving',
        percent: 95,
      }));

      const newEntry: Omit<PreventiveEntry, 'id'> & { id?: number; folder_path?: string; folder_url?: string; drive_folder_url?: string } = {
        id: existingEntry?.id,
        preventive_session_id: 101,
        equipment_id: selectedEquipment.id,
        checklist_frequency_id: Number(selectedFrequencyId),
        view_type: isXRay ? viewType : undefined,
        sequence: nextSequence,
        submitted_at: timeString,
        submitted_by_technician_ids: [1, 2],
        notes: notes,
        status: overallStatus,
        checklist_results: resultsArray,
        measurements: measurements,
        evidences: cleanEvidencesList,
        operational_date: operationalDate,
        shift: (normalizeShift(shift) as 'Pagi' | 'Malam') || 'Pagi',
        period_key: currentPeriodKey,
        folder_path: driveFolderPath,
        folder_url: driveFolderUrl,
        drive_folder_url: driveFolderUrl,
      };

      const isEdit = Boolean(existingEntry);
      await onSubmitEntry(newEntry);

      setUploadProgressState((prev) => ({
        ...prev,
        stage: 'complete',
        percent: 100,
      }));

      // Short delay for visual completion feedback
      await new Promise((resolve) => setTimeout(resolve, 800));

      setUploadProgressState((prev) => ({
        ...prev,
        isOpen: false,
        stage: 'idle',
      }));

      // Reset form states & return to equipment list
      setIsMachineSelected(false);
      setSelectedEquipmentId(null);
      setMobileStep(1);
      setPhotoDocs({ bebersih: [] });
    } catch (err: any) {
      console.error('Preventive submission error:', err);
      setUploadProgressState((prev) => ({
        ...prev,
        stage: 'error',
        errorMessage: err?.message || 'Terjadi kesalahan saat menyimpan laporan.',
      }));
      toast.error('Gagal Menyimpan Checklist', err?.message || 'Terjadi kesalahan saat menyimpan laporan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered & sorted Equipment List for Selection Grid
  // 1. Get base list filtered by active and selected category type (order follows master)
  const baseCategoryEquipments = equipments.filter((eq) => {
    if (!eq.active) return false;
    if (selectedTypeFilter !== 'ALL' && eq.equipment_type_id !== selectedTypeFilter) {
      return false;
    }
    return true;
  });

  // 2. Sort them: unsubmitted first, submitted last (preserving master sequence order)
  const filteredEquipments = [...baseCategoryEquipments].sort((a, b) => {
    const hasEntryA = preventiveEntries.some((pe) =>
      isMatchingContextEntry(pe, a.id, Number(selectedFrequencyId), currentPeriodKey)
    );
    const hasEntryB = preventiveEntries.some((pe) =>
      isMatchingContextEntry(pe, b.id, Number(selectedFrequencyId), currentPeriodKey)
    );

    if (hasEntryA === hasEntryB) {
      // Both submitted or both unsubmitted: preserve original order in master
      const idxA = baseCategoryEquipments.findIndex((item) => item.id === a.id);
      const idxB = baseCategoryEquipments.findIndex((item) => item.id === b.id);
      return idxA - idxB;
    }

    // Unsubmitted goes first
    return hasEntryA ? 1 : -1;
  });

  // Helper for counting completed entries per frequency interval
  const countCompletedForFreq = (freqId: number) => {
    const targetKey = getPeriodKey(freqId, operationalDate);
    const uniqueEquips = new Set<number>();
    preventiveEntries.forEach((pe) => {
      if (isMatchingContextEntry(pe, pe.equipment_id, freqId, targetKey)) {
        uniqueEquips.add(pe.equipment_id);
      }
    });
    return uniqueEquips.size;
  };

  // Calculate completed count for each interval
  const harianCount = countCompletedForFreq(1);
  const mingguanCount = countCompletedForFreq(2);
  const bulananCount = countCompletedForFreq(3);
  const triwulanCount = countCompletedForFreq(4);
  const semesteranCount = countCompletedForFreq(5);
  const tahunanCount = countCompletedForFreq(6);

  // Get status badge for machine card (per interval)
  const getMachineIntervalStatusBadge = (eqId: number) => {
    const hasEntry = preventiveEntries.some((pe) =>
      isMatchingContextEntry(pe, eqId, Number(selectedFrequencyId), currentPeriodKey)
    );
    if (hasEntry) {
      return {
        label: 'Selesai',
        className: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
      };
    }
    return {
      label: 'Belum diperiksa',
      className: 'bg-slate-100 text-slate-500 border border-slate-200',
    };
  };

  // =========================================================================
  // VIEW 1: MACHINE SELECTION GRID
  // =========================================================================
  if (!isMachineSelected || !selectedEquipment) {
    return (
      <div className="space-y-4">
        <EquipmentSelectionSection
          preventiveFlowStep={preventiveFlowStep}
          onFlowStepChange={setPreventiveFlowStep}
          selectedFrequencyId={selectedFrequencyId}
          onSelectFrequencyId={setSelectedFrequencyId}
          selectedTypeFilter={selectedTypeFilter}
          onSelectTypeFilter={setSelectedTypeFilter}
          equipmentTypes={equipmentTypes}
          frequencies={frequencies}
          equipments={equipments}
          filteredEquipments={filteredEquipments}
          baseCategoryEquipments={baseCategoryEquipments}
          preventiveEntries={preventiveEntries}
          currentPeriodKey={currentPeriodKey}
          harianCount={harianCount}
          mingguanCount={mingguanCount}
          bulananCount={bulananCount}
          triwulanCount={triwulanCount}
          semesteranCount={semesteranCount}
          tahunanCount={tahunanCount}
          getMachineIntervalStatusBadge={getMachineIntervalStatusBadge}
          isMatchingContextEntry={isMatchingContextEntry}
          onSelectEquipment={(eqId) => {
            setSelectedEquipmentId(eqId);
            setIsMachineSelected(true);
          }}
          operationalDate={operationalDate}
          shift={shift}
        />

        {/* TOP TOAST NOTIFICATION */}
        <Toast
          show={toastNotification.show}
          message={toastNotification.message}
          onClose={() => setToastNotification({ show: false, message: '' })}
        />
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: FORM INSPECTION FOR SELECTED MACHINE
  // =========================================================================
  return (
    <div className="space-y-4">
      {/* Top Header & Machine Banner */}
      <PreventiveFormHeader
        selectedEquipment={selectedEquipment}
        onBackToList={() => setIsMachineSelected(false)}
        activeSteps={activeSteps}
        mobileStep={mobileStep}
        onSelectMobileStep={setMobileStep}
      />

      {/* Main Grid Layout: Form Inputs (Left) & Inspection Summary Sticky (Right) */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-4 pb-28 lg:pb-4">
        {/* LEFT COLUMN: FORM SECTIONS */}
        <div className="lg:col-span-8 space-y-4">
          {/* SECTION 1: DOKUMENTASI FOTO */}
          <PhotoDocumentationSection
            isXRay={isXRay}
            isHidingMeasurements={isHidingMeasurements}
            photoDocs={photoDocs}
            mobileStep={mobileStep}
            onSinglePhotoUpload={handleSinglePhotoUpload}
            onRemoveSinglePhoto={handleRemoveSinglePhoto}
            onBebersihUpload={handleBebersihUpload}
            onSimpleDocsUpload={handleSimpleDocsUpload}
            onRemoveBebersih={handleRemoveBebersih}
          />

          {/* SECTION 2: PENGUKURAN TEGANGAN (FOR X-RAY) */}
          {isXRay && !isHidingMeasurements && (
            <MeasurementSection
              viewType={viewType}
              onToggleViewType={() => setViewType(viewType === 'single' ? 'dual' : 'single')}
              genAMeasurement={genAMeasurement}
              onGenAMeasurementChange={setGenAMeasurement}
              genBMeasurement={genBMeasurement}
              onGenBMeasurementChange={setGenBMeasurement}
              mobileStep={mobileStep}
            />
          )}

          {/* SECTION 3: HASIL CHECKLIST PEMERIKSAAN */}
          <ChecklistSection
            relevantChecklistItems={relevantChecklistItems}
            checklistResults={checklistResults}
            onChecklistChange={handleChecklistChange}
            onSetAllBaik={handleSetAllBaik}
            selectedFrequencyName={frequencies.find((f) => f.id === selectedFrequencyId)?.name}
            mobileStep={mobileStep}
          />

          {/* SECTION 4: SELESAI / KONDISI AKHIR */}
          <InspectionSummarySection
            notes={notes}
            onNotesChange={setNotes}
            overallStatus={overallStatus}
            onOverallStatusChange={setOverallStatus}
            selectedEquipment={selectedEquipment}
            selectedFrequencyName={frequencies.find((f) => f.id === selectedFrequencyId)?.name}
            isXRay={isXRay}
            viewType={viewType}
            completenessPercent={completenessPercent}
            isSubmitting={isSubmitting}
            hasExistingEntry={Boolean(existingEntry)}
            mobileStep={mobileStep}
            isViewerOnly={isViewerOnly}
            onCreateCollage={handleCreateCollage}
            onPrevStep={handlePrevStep}
            onNextStep={handleNextStep}
          />
        </div>

        {/* RIGHT COLUMN: STICKY SUMMARY PANEL */}
        <InspectionSummaryCard
          selectedEquipment={selectedEquipment}
          selectedFrequencyName={frequencies.find((f) => f.id === selectedFrequencyId)?.name}
          isXRay={isXRay}
          viewType={viewType}
          completenessPercent={completenessPercent}
          isSubmitting={isSubmitting}
          hasExistingEntry={Boolean(existingEntry)}
          mobileStep={mobileStep}
          isViewerOnly={isViewerOnly}
          onCreateCollage={handleCreateCollage}
        />

        {/* Mobile & Tablet Sticky Bottom Action Navigation */}
        <MobileBottomActions
          mobileStep={mobileStep}
          isSubmitting={isSubmitting}
          hasExistingEntry={Boolean(existingEntry)}
          isViewerOnly={isViewerOnly}
          onPrevStep={handlePrevStep}
          onNextStep={handleNextStep}
          onCreateCollage={handleCreateCollage}
        />
      </form>

      {/* TOP TOAST NOTIFICATION */}
      <Toast
        show={toastNotification.show}
        message={toastNotification.message}
        onClose={() => setToastNotification({ show: false, message: '' })}
      />

      {/* PHOTO COLLAGE MODAL FOR WHATSAPP */}
      <PhotoCollageModal
        show={showCollageModal}
        collageUrl={collageUrl}
        selectedEquipment={selectedEquipment}
        onClose={() => setShowCollageModal(false)}
      />

      {/* FULLSCREEN UPLOAD PROGRESS & WAKELOCK MODAL */}
      <UploadProgressModal
        state={uploadProgressState}
        onClose={() => setUploadProgressState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
