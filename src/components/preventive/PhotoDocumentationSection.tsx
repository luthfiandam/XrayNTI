import React from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { PhotoDocs } from './types';

interface PhotoDocumentationSectionProps {
  isXRay: boolean;
  isHidingMeasurements: boolean;
  photoDocs: PhotoDocs;
  mobileStep: number;
  onSinglePhotoUpload: (key: 'tegangan' | 'report' | 'sinyal_gen_a' | 'sinyal_gen_b', file: File) => void;
  onRemoveSinglePhoto: (key: 'tegangan' | 'report' | 'sinyal_gen_a' | 'sinyal_gen_b') => void;
  onBebersihUpload: (files: FileList | null) => void;
  onSimpleDocsUpload: (files: FileList | null) => void;
  onRemoveBebersih: (index: number) => void;
}

export const PhotoDocumentationSection: React.FC<PhotoDocumentationSectionProps> = ({
  photoDocs,
  mobileStep,
  onBebersihUpload,
  onRemoveBebersih,
}) => {
  const photos = photoDocs.bebersih || [];
  const maxPhotos = 9;

  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-xs space-y-3.5 ${
        mobileStep !== 1 ? 'hidden lg:block' : ''
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Camera className="w-4 h-4 text-indigo-600" />
            <span>1. Foto Bebersih (Max 9 Foto)</span>
          </h3>
          <p className="text-xs text-slate-600 mt-0.5 font-medium">
            Dokumentasi pembersihan dan kegiatan maintenance (maksimal 9 foto)
          </p>
        </div>
        <span className="text-xs font-bold px-2.5 py-0.5 bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-full">
          {photos.length} / {maxPhotos} Foto
        </span>
      </div>

      {/* Grid of uploaded photo thumbnails */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {photos.map((imgUrl, idx) => (
            <div key={idx} className="relative rounded-xl overflow-hidden border border-slate-200 group bg-slate-100 shadow-xs">
              <img src={imgUrl} alt={`Foto Bebersih ${idx + 1}`} className="w-full h-28 object-cover" />
              <button
                type="button"
                onClick={() => onRemoveBebersih(idx)}
                className="absolute top-1.5 right-1.5 p-1 bg-red-600 text-white rounded-lg shadow-xs hover:bg-red-700 transition-colors cursor-pointer"
                title="Hapus foto"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <span className="absolute bottom-1.5 left-1.5 bg-slate-900/80 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-xs">
                #{idx + 1}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Upload Dropzone Button */}
      {photos.length < maxPhotos && (
        <label className="cursor-pointer border border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20 rounded-xl p-3.5 text-center transition-all flex flex-col items-center justify-center gap-1 group">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform border border-indigo-100">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs sm:text-sm font-bold text-slate-900 block">
              {photos.length > 0 ? '+ Tambah Foto Bebersih' : 'Unggah Foto Bebersih'}
            </span>
            <span className="text-xs text-slate-500 font-medium mt-0.5 block">
              Klik untuk mengambil/memilih foto (bisa pilih beberapa sekaligus, max 9 foto)
            </span>
          </div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => onBebersihUpload(e.target.files)}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
};
