# PROJECT HANDOFF DOCUMENTATION

**Current Version**: `v0.6.3 — FIRESTORE CUTOVER STABLE`

Dokumen ini disusun sebagai panduan transfer konteks teknis dan arsitektural proyek **Sistem Laporan Maintenance & Inspection PT Nararya Teknologi Indonesia**. Dokumen ini bertujuan agar AI maupun developer manusia dapat melanjutkan pengembangan tanpa kehilangan konteks, mematahkan fitur yang ada, atau merusak standar PDF yang telah disepakati.

---

## 1. PROJECT OVERVIEW

- **Version Status**: `v0.6.3 — FIRESTORE CUTOVER STABLE` (Migrasi lengkap data Preventive & Corrective ke Google Cloud Firestore sebagai Source of Truth, didukung Firebase Authentication & profil otorisasi pengguna `users/{uid}`, penanganan duplikasi data secara presisi pada startup melalui rekonsiliasi cache lokal fetch-first, pelestarian penyimpanan kolase gambar di Google Drive via Apps Script API, serta penonaktifan penulisan runtime langsung ke Google Sheets).
- **Arsitektur Saat Ini**:
  - React 18+ + TypeScript + Vite + Tailwind CSS v4
  - Cloud Storage: Cloud Firestore (Authoritative Backend) + Local Cache (localStorage)
  - Firebase Authentication & RBAC (Teknisi / Supervisor aktif)
  - Evidence Files: Google Drive (Via GAS uploadPhoto bridge)
  - Client-side Vector PDF Generation (`@react-pdf/renderer` via `src/pdf/pdfService.ts` & `src/pdf/PdfDocument.tsx`)
  - Express backend (`server.ts`) + Puppeteer PDF generator (`/api/generate-pdf`) dipertahankan sebagai fallback

- **Nama / Tujuan Aplikasi**: System Maintenance & Inspection Reporting — PT Nararya Teknologi Indonesia. Aplikasi web internal untuk mencatat *Preventive Maintenance* harian dan *Corrective Maintenance* peralatan keamanan/elektronik di bandara (XRAY, WTMD, HHMD, ETD) serta merangkumnya menjadi Laporan Format Teks WhatsApp dan Laporan Resmi PDF siap cetak/share.
- **User Utama**:
  1. **Teknisi On Duty**: Mengisi form pemeliharaan preventif per alat, mengunggah foto dokumentasi/kolase, mencatat gangguan/penanganan korektif.
  2. **Supervisor / Management**: Meninjau status peralatan di Dashboard, mengelola data master, memilih shift & teknisi piket, serta mengekspor/berbagi Laporan PDF dan Teks WhatsApp.
- **Workflow Utama**:
  - Login / Pilih Mode (Teknisi / Supervisor)
  - Pengaturan Shift Piket & Teknisi On Duty
  - Input Checklist & Pengukuran Parameter Alat (Preventive) / Laporan Kerusakan (Corrective)
  - Pembuatan Kolase Foto Dokumentasi Otomatis (Watermark Tanggal/Jam)
  - Preview Report otomatis (Format Teks WhatsApp + Matrix Cetak PDF Vector)
  - Generate PDF via Puppeteer Backend & Direct Download / Web Share API
- **Jenis Laporan**:
  1. **Preventive Maintenance Report**: Laporan tabel A4 formal berstandar administrasi penerbangan dengan header resmi, grid teknisi dinamis, waktu terintegrasi, catatan pengukuran (HV, Heater, Anode), dan foto dokumentasi.
  2. **WhatsApp Text Summary**: Format pesan WhatsApp terstruktur dengan list lokasi, waktu pelaksanaan, list teknisi, dan catatan hasil pemeliharaan.
  3. **Corrective Report**: Log kerusakan & penanganan alat.
- **Target Penggunaan**: Optimized hybrid (Desktop Dashboard & Touch-friendly Mobile Web Interface).
- **Status Project**: **Production Ready Phase / Feature Complete for PDF & Local Session**. Seluruh sistem rendering PDF vector Puppeteer, adaptive pagination, header logo, grid teknisi, dan Web Share API sudah stabil.

---

## 2. TECH STACK

### Frontend
- **React**: `v19.0.1` (Single Page Application dengan Functional Components & Hooks)
- **TypeScript**: `~5.8.2` (Strict type definition across models, props, and report structures)
- **Vite**: `v6.2.3` (Development server & production bundling engine)
- **Tailwind CSS**: `v4.1.14` (dengan `@tailwindcss/vite` v4.1.14 & `@import "tailwindcss";` di `src/index.css`)
- **Lucide React**: `v0.546.0` (UI Vector Icons)
- **Motion**: `v12.23.24` (Layout animations)

### Backend
- **Node.js**: `v22.x` runtime
- **Express**: `v4.21.2` (Routing server untuk API `/api/generate-pdf` & static file serving di produksi)
- **TSX**: `v4.21.0` (Development executor untuk `server.ts`)
- **Esbuild**: `v0.25.0` (Bundler server backend ke `dist/server.cjs`)

### PDF Engine
- **Puppeteer**: `v25.5.0` (Headless Chromium PDF generator server-side untuk hasil PDF vector murni beresolusi tinggi A4 portrait).

### HTML/Canvas Utilities (Legacy / Partial)
- `html2canvas` (`^1.4.1`), `html2pdf.js` (`^0.14.0`), `jspdf` (`^4.2.1`): *Terdapat di package.json sebagai legacy/unused dependencies. Proses PDF utama saat ini 100% dialihkan ke Puppeteer Backend Server.*

---

## 3. STRUKTUR PROJECT

```
/
├── .env.example                # Deklarasi variabel lingkungan
├── index.html                  # HTML entry point Vite
├── metadata.json               # Metadata aplikasi Google AI Studio
├── package.json                # Dependensi npm & script build/dev
├── server.ts                   # Backend Express + Puppeteer Vector PDF Renderer
├── logopt.png                  # Asset logo resmi PT Nararya Teknologi Indonesia (Root copy)
├── public/
│   └── logopt.png              # Asset logo publik untuk static serving
├── src/
│   ├── App.tsx                 # Root State Controller, Router Tab, Modal Orchestrator
│   ├── main.tsx                # React DOM render entry point
│   ├── index.css               # Global CSS, @import tailwindcss, & Print Media Rules (@page)
│   ├── logoBase64.ts           # Data URI Base64 logo Nararya untuk inline SVG/PDF rendering
│   ├── types.ts                # Model TypeScript resmi (Equipment, Preventive, Report, etc.)
│   ├── components/
│   │   ├── CorrectiveView.tsx  # View penginputan & log Corrective Maintenance
│   │   ├── DashboardView.tsx   # Dashboard pemantauan status alat & quick actions
│   │   ├── Header.tsx          # App header bar
│   │   ├── LoginScreen.tsx     # Layar Login (Pilih Teknisi / Modal Password Supervisor)
│   │   ├── MasterDataView.tsx  # Pengelolaan Master Data Alat & Lokasi
│   │   ├── PreventiveView.tsx  # Form input checklist & pengukuran parameter alat
│   │   ├── ReportView.tsx      # Core View Laporan: Preview PDF Vector, Text WA, Export
│   │   ├── ShiftModal.tsx      # Modal pemilihan Shift (PAGI/MALAM) & Teknisi On Duty
│   │   ├── Sidebar.tsx         # Sidebar navigasi & indikator status shift aktif
│   │   └── SupervisorLoginModal.tsx # Modal otentikasi supervisor
│   ├── data/
│   │   └── initialData.ts      # Initial Mock Master Data & Sample Maintenance Entries
│   ├── services/
│   │   └── reportService.ts    # Formatter tanggal, builder StructuredReportData & WA Text
│   └── utils/
│       ├── collageService.ts   # Engine pembuatan kolase foto persegi 1200x1200 dengan watermark
│       └── technicianSchedule.ts # Logic penentuan jadwal & shift
└── tsconfig.json               # Konfigurasi TypeScript compiler
```

---

## 4. APPLICATION FLOW

```
[ User Opens App ]
        │
        ▼
[ LoginScreen ] ─── (Option A: Technician Login) ──► Pilih ID Teknisi ──► Set Role 'technician'
        │                                                                        │
        └─── (Option B: Supervisor Login) ──► Input Password ──► Set Role 'supervisor'
                                                                                 │
                                ┌────────────────────────────────────────────────┘
                                ▼
                        [ Main Workspace ]
                                │
   ┌────────────────────┼────────────────────┬────────────────────┐
   ▼                    ▼                    ▼                    ▼
[ PreventiveView ] [ CorrectiveView ] [ MasterDataView ] [ DashboardView ]
   │                    │                    │                    │
   │ Input Checklist    │ Input Log          │ Tambah Alat/       │ Quick Stats &
   │ & Photo Collage    │ Kerusakan          │ Lokasi Baru        │ Session Controls
   │                    │                    │                    │
   └────────────────────┴────────────────────┴────────────────────┘
                                │
                                ▼
                       [ ReportView ]
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
   [ WhatsApp Text Summary ]             [ PDF Vector Preview ]
   - Auto-format lokasi & notes          - Render A4 Matrix HTML
   - Single-click Copy & WA API          - Server-side Puppeteer PDF
                                         - Download / Web Share API
```

---

## 5. SCREEN / PAGE YANG SUDAH ADA

1. **Login Screen**
   - **Path**: Client State (`isLoggedIn === false`)
   - **Component**: `src/components/LoginScreen.tsx`
   - **Fungsi**: Pintu masuk aplikasi. Memilih teknisi piket cepat atau membuka modal login supervisor.
   - **Status**: `working`
2. **Dashboard View**
   - **Path**: Tab `'dashboard'`
   - **Component**: `src/components/DashboardView.tsx`
   - **Fungsi**: Menampilkan ringkasan status kelengkapan alat, progress pemeliharaan, aksi cepat pemeliharaan, serta informasi shift aktif.
   - **Status**: `working`
3. **Preventive Maintenance View**
   - **Path**: Tab `'preventive'`
   - **Component**: `src/components/PreventiveView.tsx`
   - **Fungsi**: Form interaktif input pemeliharaan preventif. Memilih alat, jenis tampilan XRAY (Single/Dual), menginput nilai pengukuran generator (High Voltage, Heater, Anode), checklist item, catatan, serta fitur pembuat foto kolase.
   - **Status**: `working`
4. **Corrective Maintenance View**
   - **Path**: Tab `'corrective'`
   - **Component**: `src/components/CorrectiveView.tsx`
   - **Fungsi**: Pencatatan insiden kerusakan, tindakan perbaikan, teknisi penanggung jawab, serta status hasil perbaikan.
   - **Status**: `working`
5. **Report & Export View**
   - **Path**: Tab `'reports'`
   - **Component**: `src/components/ReportView.tsx`
   - **Fungsi**: Pusat generator laporan. Menyediakan tab Laporan WhatsApp (teks terformat) dan Preview PDF A4 Matrix Vector. Dilengkapi tombol Download PDF dan Share PDF (Web Share API).
   - **Status**: `working`
6. **Master Data View**
   - **Path**: Tab `'master'`
   - **Component**: `src/components/MasterDataView.tsx`
   - **Fungsi**: Pengelolaan data master daftar peralatan, lokasi, frekuensi checklist, dan item checklist.
   - **Status**: `working`

---

## 6. DATA MODEL

Diambil langsung dari `src/types.ts`:

```typescript
export type Role = 'supervisor' | 'technician';
export type ShiftType = 'Pagi' | 'Malam';

export interface Technician {
  id: number;
  name: string;
  code: string;
  active: boolean;
}

export interface EquipmentType {
  id: number;
  name: string;
  code: string; // XRAY, WTMD, HHMD, ETD
  priority: number; // 1: XRAY, 2: WTMD, 3: HHMD, 4: ETD
  active: boolean;
}

export interface Location {
  id: number;
  name: string;
  code: string;
  active: boolean;
}

export interface Equipment {
  id: number;
  equipment_code: string;
  equipment_type_id: number;
  location_id: number;
  name: string;
  brand: string;
  model?: string;
  serial_number?: string;
  default_view?: 'single' | 'dual';
  active: boolean;
}

export interface ChecklistFrequency {
  id: number;
  name: string;
  code: string; // HARIAN, MINGGUAN, BULANAN, TRIWULAN, SEMESTERAN, TAHUNAN
  sort_order: number;
}

export interface ChecklistItem {
  id: number;
  equipment_type_id: number;
  checklist_frequency_id: number;
  description: string;
  sequence: number;
  active: boolean;
}

export interface PreventiveSession {
  id: number;
  operational_date: string; // YYYY-MM-DD
  shift: ShiftType;
  started_at: string; // HH:mm
  ended_at: string; // HH:mm
  status: 'active' | 'completed';
  technician_ids: number[];
  technician_names: string[];
}

export interface MeasurementValue {
  generator: 'A' | 'B';
  positive_high_voltage?: number; // kV
  negative_high_voltage?: number; // kV
  heater_current?: number; // mA
  anode_current?: number; // uA
}

export interface ChecklistResult {
  checklist_item_id: number;
  description: string;
  status: 'Baik' | 'Temuan' | 'OK' | 'NG' | 'N/A';
  note?: string;
}

export interface PreventiveEvidence {
  id: number;
  file_path: string; // Data URL / Base64 image
  caption: string;
}

export interface PreventiveEntry {
  id: number;
  preventive_session_id: number;
  equipment_id: number;
  checklist_frequency_id: number;
  view_type?: 'single' | 'dual';
  sequence: number;
  submitted_at: string; // HH:mm
  submitted_by_technician_ids: number[];
  notes: string;
  status: 'OK' | 'NG' | 'NEEDS_REPAIR';
  checklist_results: ChecklistResult[];
  measurements: MeasurementValue[];
  evidences: PreventiveEvidence[];
}

export interface CorrectiveReport {
  id: number;
  corrective_code: string;
  corrective_date: string;
  equipment_id: number;
  location_id: number;
  problem_description: string;
  action_taken: string;
  result: 'Resolved' | 'Pending Sparepart' | 'Temporary Fix';
  result_text?: string;
  technicians?: string[];
  start_time?: string;
  end_time?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  evidences: string[];
}

export interface StructuredReportData {
  operational_date: string; // e.g. "06 Agustus 2026"
  shift: ShiftType;
  start_time: string; // e.g. "00.44"
  end_time: string; // e.g. "00.45"
  technicians: string[];
  lines_by_type: {
    type_code: string;
    type_name: string;
    equipment_names: string[];
  }[];
  entries_by_type: {
    type_code: string;
    type_name: string;
    priority: number;
    entries: {
      equipment_name: string;
      location_name: string;
      view_type?: 'single' | 'dual';
      measurements: MeasurementValue[];
      notes: string;
      submitted_at: string;
      sequence: number;
    }[];
  }[];
}
```

---

## 7. STATE & DATA STORAGE

### CURRENTLY IMPLEMENTED
- **React Component State (`useState` di `App.tsx`)**: Data master dan transaksi disimpan di memori aplikasi saat runtime, yang diinisialisasi dari `src/data/initialData.ts`.
- **In-Memory Upsert**: Pengisian form `PreventiveView` melakukan upsert ke state `preventiveEntries` berdasarkan `equipment_id` untuk mencegah rekaman ganda dalam shift yang sama.

### PLANNED / NOT YET IMPLEMENTED
- **Database Cloud / Firebase / SQL**: Belum terhubung ke database terpusat seperti Cloud SQL / Firebase Firestore. Semua data saat ini akan kembali ke initial mock data jika browser di-refresh secara penuh.

---

## 8. PDF SYSTEM — SANGAT PENTING

System PDF telah disempurnakan secara menyeluruh dari raster image (html2canvas) menjadi **Pure Vector HTML-to-PDF** menggunakan Express & Puppeteer.

### Visual Architecture Flow
```
[ User Klik "Download PDF" / "Share PDF" ]
                   │
                   ▼
[ ReportView.tsx ] Ambil OuterHTML elemen #pdf-report-document
                   │
                   ▼
[ POST /api/generate-pdf ] { html: string, filename: string }
                   │
                   ▼
[ server.ts ] Wrap HTML dengan @page CSS A4 15mm & Font Times New Roman
                   │
                   ▼
[ Puppeteer / Headless Chromium ] page.pdf({ format: 'A4', margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' }, preferCSSPageSize: true })
                   │
                   ▼
[ Express Server ] Mengembalikan `application/pdf` Blob
                   │
                   ▼
[ Client Browser ] Membuka Blob / Memicu Browser Download / Web Share API
```

### PDF Configuration Details
- **Endpoint**: `POST /api/generate-pdf`
- **Request Payload**:
  ```json
  {
    "html": "<div id=\"pdf-report-document\">...</div>",
    "filename": "06 Agustus 2026 (M).pdf"
  }
  ```
- **Response**: Binary Buffer Stream `application/pdf`.
- **Page Format**: Standard A4 Portrait (`210mm × 297mm`).
- **Margin Page**:
  - CSS `@page { size: A4 portrait; margin: 15mm; }`
  - Puppeteer Options: `margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" }`
  - `.pdf-page`: `width: 100%; padding: 0; margin: 0 auto;` (Mencegah double margin tumpuk).
- **Typography**: Default Times New Roman (`font-family: 'Times New Roman', Times, serif;`).
- **Filenaming Standard Rule**:
  - Formatter Function: `formatReportFilename(dateStr, shiftStr)` di `ReportView.tsx`
  - Aturan Kode Shift: `PAGI` / `Pagi` / `PS` → `(PS)` ; `MALAM` / `Malam` / `M` → `(M)`.
  - Format Akhir: `DD NamaBulan YYYY (KODE_SHIFT).pdf` (Contoh: `06 Agustus 2026 (M).pdf` atau `07 Agustus 2026 (PS).pdf`).

### Legacy Engine Check
- **html2canvas / jsPDF**: Tidak digunakan sama sekali dalam proses render PDF utama. Penggunaan `window.print()` hanya menjadi fallback darurat jika endpoint backend gagal merespons.

---

## 9. REPORT LAYOUT

Layout PDF dibangun dengan struktur tabel formal yang terstandarisasi:

1. **Header Block (Tabel Atas)**:
   - **Cell Logo (Kiri)**: Menggunakan `logoBase64` resmi **Symbol Only** (hanya lambang segitiga/sayap perak & bola dunia Nararya tanpa teks biru kecil di bawahnya).
   - **Cell Judul (Tengah)**: `PT. NARARYA TEKNOLOGI INDONESIA` (Font bold ukuran besar).
   - **Baris Meta**:
     - `Hari / Tanggal`: `: [Tanggal Terformat]`
     - `Shift`: `: [PAGI / MALAM]`
   - **Baris Teknisi On Duty**:
     - Kolom Kiri: Label `Teknisi On Duty` (Cell vertikal `rowSpan`).
     - Grid Internal 2 Kolom: Menyusun nama-nama teknisi secara dinamis dengan nomor urut (`1. Zaky`, `2. Luthfi`, dst).
     - Perhitungan Baris Dinamis: `Math.ceil(jumlahTeknisi / 2)`. Jika ganjil, cell kanan terakhir akan berisi space kosong secara rapi.
2. **Body Table (Tabel Utama Equipment)**:
   - Header Kolom: `No` | `Tipe Alat` | `Jenis Kegiatan` | `Waktu` | `Uraian Kegiatan` | `Notes` | `Dokumentasi`.
   - **Kolom Waktu (`rowSpan`)**: Menyatu secara vertikal untuk seluruh baris equipment pada shift tersebut (`00.44 s/d 00.45 WIB`).
   - **Kolom Notes**: Menyajikan teks notes status kalibrasi/pembersihan dan pengukuran khusus XRAY (Positive/Negative High Voltage, Heater Current, Anode Current).
   - **Kolom Dokumentasi**: Grid foto 2-kolom jika terdapat lebih dari 1 foto, berskala pas tanpa mematahkan border cell.
3. **Footer Block (Tanda Tangan & Pengesahan)**:
   - Tampil **HANYA di halaman terakhir** (`{pageIndex === totalPages - 1 && ...}`).
   - Terdiri dari kolom **Pelaksana** (`PT. NARARYA TEKNOLOGI INDONESIA`) dan **Pengawas Pekerjaan** (`FACILITY MAINTENANCE - ELEKTRONIKA`) lengkap dengan nama pimpinan/supervisor (`LUTHFIANDA MUZAKI SULAEMAN` & `RIZKO ENDRA NUGRAHA`).
4. **Adaptive Pagination & Chunking**:
   - Fungsi `chunkEntriesForPages(entries)` di `ReportView.tsx` mengelompokkan item equipment menjadi ±6 item per halaman dalam kondisi normal.
   - Header Laporan diulang pada setiap halaman baru secara otomatis, sementara Footer pengesahan diletakkan khusus pada halaman paling akhir.

---

## 10. MOBILE FEATURES

- **Responsive Viewports**: Seluruh layout admin & form input dibangun menggunakan utility Tailwind CSS dengan pola desktop-first flex/grid dan touch-friendly controls.
- **Web Share API**:
  - Pada browser mobile (Android/iOS Chrome/Safari) yang mendukung `navigator.share` dengan payload file, tombol **Share PDF** akan langsung membuka dialog native sharing (WhatsApp, Gmail, Drive, Telegram, Save to Files).
  - Jika browser tidak mendukung file sharing, sistem secara otomatis melakukan fallback ke direct file download.
- **WhatsApp Text Direct Action**:
  - Sediakan tombol **Copy Text** dan **Buka WhatsApp Direct** yang mengubah ringkasan menjadi format `whatsapp://send?text=...`.

---

## 11. API / BACKEND ENDPOINTS

### 1. `POST /api/generate-pdf`
- **Purpose**: Menerima string HTML dari preview report frontend, me-render HTML tersebut menggunakan Puppeteer Chromium, dan menghasilkan buffer PDF Vector A4.
- **Request Body**:
  ```json
  {
    "html": "string HTML lengkap",
    "filename": "string nama file PDF"
  }
  ```
- **Response**: Stream buffer `application/pdf` dengan header `Content-Disposition`.
- **Implemented in**: `/server.ts`

### 2. `GET /api/health`
- **Purpose**: Health check status server.
- **Response**: `{ "status": "ok" }`
- **Implemented in**: `/server.ts`

---

## 12. ENVIRONMENT VARIABLES

Deklarasi di `.env.example`:

```env
# Server Port (Diatur otomatis oleh platform Cloud Run / container ke 3000)
PORT=3000

# Node Environment
NODE_ENV=development

# Gemini API Key (Opsional / Reserved)
GEMINI_API_KEY=<REDACTED>
```

---

## 13. PACKAGE.JSON

Excerpt dari `/package.json`:

### Scripts
- `npm run dev`: Executing `tsx server.ts` (Menjalankan Express Backend & Vite Dev Middleware secara bersamaan di port 3000).
- `npm run build`: `vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs`
- `npm run start`: `node dist/server.cjs` (Menjalankan server produksi hasil kompilasi CJS).
- `npm run lint`: `tsc --noEmit` (Mengecek ketepatan tipe TypeScript).

---

## 14. CARA MENJALANKAN PROJECT

### Command Utama Development
```bash
npm install
npm run dev
```

### Akses Aplikasi
- **URL**: `http://localhost:3000` (Port `3000` adalah port tunggal yang mengkombinasikan API Express `/api/*` dan Vite frontend middleware).

---

## 15. GOOGLE AI STUDIO

- Aplikasi ini berjalan di Cloud Run container environment ter-sandbox.
- Port 3000 adalah satu-satunya port yang terekspos keluar melalui reverse proxy.
- Browser Puppeteer diluncurkan dengan flag `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage` agar dapat mengeksekusi Headless Chromium di lingkungan container tanpa kendala memori shared.

---

## 16. CURRENT FEATURE STATUS

### [WORKING]
- [x] Login Screen & Role Switch (Teknisi / Supervisor)
- [x] Modal Pemilihan Shift & Teknisi On Duty
- [x] Form Input Preventive Maintenance (Checklist, Measurement Generator A/B, Notes)
- [x] Generator Kolase Foto Otomatis (Grid 1200x1200 dengan Watermark Tanggal/Waktu)
- [x] Corrective Maintenance Form & History List
- [x] Formatter WhatsApp Text Summary dengan Auto-Clean Nama Lokasi & Grouping
- [x] Renderer PDF Vector Puppeteer A4 Portrait (Margin 15mm, Border 0.5pt, Times New Roman)
- [x] Header Report Resmi: Logo Symbol-Only + Name Title + Matrix Shift/Tanggal
- [x] Grid Internal Dinamis Teknisi On Duty (2 Kolom)
- [x] Web Share API & Fallback Direct Download
- [x] Adaptive Multi-Page Chunking (±6 item/page)
- [x] Penandatanganan Footer hanya di Halaman Terakhir

### [PARTIALLY WORKING]
- [!] Data Master Editor (Sudah ada UI-nya, namun perubahan saat ini disimpan di local React state runtime).

### [NOT IMPLEMENTED]
- [-] Cloud Database Persistence (Firestore / PostgreSQL). Data saat ini di-reset ke `initialData.ts` apabila aplikasi di-refresh total.

---

## 17. RECENT PDF CHANGES

1. **Transformasi dari Raster ke Vector PDF**: Menggantikan html2canvas dengan backend Puppeteer (`/api/generate-pdf`). Teks & border kini 100% vector murni.
2. **Page Margin Adjustment**: Diatur ke `15mm` secara konsisten via `@page { size: A4 portrait; margin: 15mm; }` dan Puppeteer PDF Options untuk *breathing space* dokumen laporan formal yang nyaman.
3. **Penyatuan Double Margin**: Menghapus `padding` tumpuk dari `.pdf-page` dan `#pdf-report-document` sehingga margin 15mm dikendalikan penuh oleh `@page`.
4. **Header Logo Symbol-Only**: Menghapus teks biru kecil `"PT. NARARYA TEKNOLOGI INDONESIA"` di bawah gambar logo agar cell logo hanya menampilkan ikon simbol Nararya secara bersih dan presisi.
5. **Teknisi On Duty Internal Grid**: Mengubah layout Teknisi On Duty menjadi grid cell terstruktur (2 kolom per baris) dengan border `0.5pt` konsisten dan `rowSpan` vertikal untuk label utama.
6. **Filename Standard**: Menggunakan format `DD NamaBulan YYYY (KODE_SHIFT).pdf` (misal: `06 Agustus 2026 (M).pdf`).

---

## 18. IMPORTANT BUSINESS RULES

1. **Shift Code Mapping**:
   - `PAGI` / `Pagi` / `PS` → Kode filename `(PS)`
   - `MALAM` / `Malam` / `M` → Kode filename `(M)`
2. **Equipment Priority Order**:
   - `1`: XRAY
   - `2`: WTMD
   - `3`: HHMD
   - `4`: ETD
3. **Waktu Pelaksanaan (`rowSpan`)**:
   - Diambil dari waktu submit entry terkecil dan terbesar pada shift tersebut. Jika kosong, fallback ke `started_at` dan `ended_at` session.
4. **Footer Signature Placement**:
   - Footer tanda tangan **HANYA** boleh dirender pada halaman terakhir PDF laporan.

---

## 19. IMPORTANT FUNCTIONS

- **`buildStructuredReportData(...)`**
  - **File**: `src/services/reportService.ts`
  - **Purpose**: Mengolah raw preventive entries, mengelompokkannya berdasarkan urutan prioritas tipe alat, dan menghitung rentang waktu pelaksanaan.
- **`generateWhatsAppReportText(...)`**
  - **File**: `src/services/reportService.ts`
  - **Purpose**: Mengonversi `StructuredReportData` menjadi string teks siap kirim ke WhatsApp dengan pengelompokan lokasi yang rapi.
- **`generatePhotoCollageUrl(...)`**
  - **File**: `src/utils/collageService.ts`
  - **Purpose**: Menggabungkan hingga 9+ foto menjadi satu gambar persegi (1200x1200px) lengkap dengan overlay watermark tanggal & waktu.
- **`formatReportFilename(dateStr, shiftStr)`**
  - **File**: `src/components/ReportView.tsx`
  - **Purpose**: Memproduksi nama file terstandar untuk pencetakan/pengunduhan PDF.
- **`handleGeneratePDF(action)`**
  - **File**: `src/components/ReportView.tsx`
  - **Purpose**: Mengirim HTML preview ke `/api/generate-pdf` dan mengeksekusi penanganan hasil (Download atau Web Share API).

---

## 20. RISIKO JIKA MENGUBAH CODE

- **DILARANG** mengembalikan engine PDF ke `html2canvas` / `jsPDF` / canvas raster.
- **DILARANG** menambahkan padding tambahan pada `.pdf-page` atau `#pdf-report-document` jika sudah ada margin `@page` di CSS/Puppeteer (akan menyebabkan *double margin*).
- **DILARANG** menggunakan CSS `transform: scale(...)` atau `zoom` pada container PDF karena dapat merusak kalkulasi koordinat dan vektor Puppeteer.
- **DILARANG** menghapus `rowSpan` pada footer atau kolom Waktu tanpa menyesuaikan struktur tabel pendukungnya.

---

## 21. TODO & NEXT STEPS

1. **Integrasi Persistent Database**: Menghubungkan state `preventiveEntries` dan `correctiveReports` ke cloud storage (Firebase Firestore atau Cloud SQL) agar data tidak hilang saat refresh.
2. **Multi-Date History Filter**: Menambahkan filter tanggal & shift di menu Laporan untuk meninjau kembali laporan hari-hari sebelumnya.

---

## 22. GIT / PROJECT STATE

- **Filament Terakhir yang Diubah**:
  - `/server.ts` (Aturan margin 15mm Puppeteer PDF).
  - `/src/index.css` (Aturan print margin 15mm CSS).
  - `/src/components/ReportView.tsx` (Internal cell grid Teknisi On Duty 2-kolom & Logo symbol-only).
  - `/src/logoBase64.ts` (Helper Base64 logo).
- **Unused Legacy Libraries**: `html2canvas`, `html2pdf.js`, `jspdf` ada di `package.json` tetapi tidak lagi digunakan dalam alur eksekusi PDF utama.

---

# QUICK CONTEXT FOR NEXT AI

```
- App: Maintenance & Inspection Reporting System (PT Nararya Teknologi Indonesia).
- Stack: React 19 + TypeScript + Vite + Tailwind CSS v4 + Express + Puppeteer.
- Entry points: `server.ts` (Express + Puppeteer PDF API) & `src/App.tsx` (React Root).
- Key View: `src/components/ReportView.tsx` handles PDF preview, WhatsApp text generation, & PDF download/sharing.
- PDF Engine: Vector-based PDF via POST `/api/generate-pdf` using server-side Puppeteer Chromium.
- PDF Config: A4 Portrait, margin 15mm via @page & Puppeteer options, Times New Roman font, 0.5pt borders.
- Header Rules: Logo is SYMBOL ONLY (no text under logo), Company Title is bold, Teknisi On Duty uses dynamic 2-column internal table grid.
- Filename Standard: `DD NamaBulan YYYY (KODE_SHIFT).pdf` e.g., `06 Agustus 2026 (M).pdf`.
- Critical Rule: NEVER revert to html2canvas raster images, NEVER mix @page margins with container paddings (causes double margins).
```
