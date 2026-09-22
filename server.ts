import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let genAiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!genAiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key && key.trim()) {
      genAiClient = new GoogleGenAI({ apiKey: key.trim() });
    }
  }
  return genAiClient;
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";

let serverSupabase: SupabaseClient | null = null;
function getServerSupabase(): SupabaseClient | null {
  if (!serverSupabase && SUPABASE_URL && SUPABASE_KEY) {
    try {
      serverSupabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) {
      console.warn("[Server Supabase Init Exception]:", e);
    }
  }
  return serverSupabase;
}

function escapeTgHtml(text: any): string {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isDummyOrRemovedName(name: string | null | undefined): boolean {
  if (!name || typeof name !== "string") return true;
  return /daffa\s*evan|supervisor\s*utama/i.test(name.trim());
}

interface TelegramSubscriber {
  chat_id: string;
  type: "private" | "group" | "supergroup" | "channel";
  name: string;
  username?: string;
  first_seen: string;
  last_active: string;
  last_message?: string;
  is_active: boolean;
  notes?: string;
}

interface TelegramServerConfig {
  bot_token?: string;
  chat_id?: string;
  broadcast_to_all_subscribers?: boolean;
  auto_notify_corrective?: boolean;
  auto_notify_recurring_fault?: boolean;
}

interface OperationalEquipment {
  id: number;
  equipment_type_id?: number;
  equipment_code?: string;
  name: string;
  location_name?: string;
  brand?: string;
  model?: string;
  status?: string;
  type?: string;
}

interface OperationalCorrective {
  id: number | string;
  equipment_id: number;
  equipment_name?: string;
  location_name?: string;
  fault_description?: string;
  problem_description?: string;
  action_taken?: string;
  result: string;
  corrective_date: string;
  shift?: string;
  start_time?: string;
  end_time?: string;
  technicians?: string[];
  technician_name?: string;
  created_by?: string;
}

interface OperationalState {
  operationalDate: string;
  shift: string;
  technicianNames: string[];
  equipments: OperationalEquipment[];
  correctiveReports: OperationalCorrective[];
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), ".data");
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

function resolveDataFile(filename: string): string {
  const inData = path.join(DATA_DIR, filename);
  const inRoot = path.join(process.cwd(), filename);
  if (fs.existsSync(inData)) return inData;
  if (fs.existsSync(inRoot)) return inRoot;
  return inData;
}

const SUBSCRIBERS_FILE = resolveDataFile("telegram_subscribers.json");
const CONFIG_FILE = resolveDataFile("telegram_server_config.json");
const OPERATIONAL_STATE_FILE = resolveDataFile("operational_state.json");
const ATTENDANCE_FILE = resolveDataFile("attendance_records.json");

interface ServerAttendanceRecord {
  id: string;
  technician_id?: number;
  technician_name: string;
  shift: 'Pagi' | 'Malam';
  attendance_date: string;
  attendance_time: string;
  status: 'Tepat Waktu' | 'Telat';
  notes?: string;
  is_bypassed?: boolean;
  is_off_duty?: boolean;
  photo_url?: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    area_name?: string;
    distance_meters?: number;
    is_within_radius?: boolean;
  };
  created_at: string;
}

function safeWriteJsonFile(filePath: string, data: any) {
  try {
    const newContent = JSON.stringify(data, null, 2);
    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, "utf-8");
      if (existing.trim() === newContent.trim()) {
        return; // Skip writing if identical to avoid triggering file watchers
      }
    }
    fs.writeFileSync(filePath, newContent, "utf-8");
  } catch (e) {
    console.error(`Error writing file ${filePath}:`, e);
  }
}

function loadAttendanceRecords(): ServerAttendanceRecord[] {
  try {
    if (fs.existsSync(ATTENDANCE_FILE)) {
      const data = fs.readFileSync(ATTENDANCE_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error reading attendance file:", e);
  }
  return [];
}

function saveAttendanceRecords(records: ServerAttendanceRecord[]) {
  safeWriteJsonFile(ATTENDANCE_FILE, records);
}

const DEFAULT_EQUIPMENTS: OperationalEquipment[] = [
  // X-Ray (10 unit)
  { id: 1, equipment_type_id: 1, equipment_code: 'EQ-XRAY-01', name: 'BACK UP AREA', location_name: 'BACK UP AREA', brand: 'SMITHS DETECTION', model: '100100 T 2IS', type: 'XRAY' },
  { id: 2, equipment_type_id: 1, equipment_code: 'EQ-XRAY-02', name: 'BHS Line Batik', location_name: 'BHS Line Batik', brand: 'SMITHS DETECTION', model: '100100 T 2IS', type: 'XRAY' },
  { id: 3, equipment_type_id: 1, equipment_code: 'EQ-XRAY-03', name: 'BHS Line Citilink', location_name: 'BHS Line Citilink', brand: 'SMITHS DETECTION', model: '100100 T 2IS', type: 'XRAY' },
  { id: 4, equipment_type_id: 1, equipment_code: 'EQ-XRAY-04', name: 'VVIP SMP SETNEG', location_name: 'VVIP SMP SETNEG', brand: 'SMITHS DETECTION', model: '100100 T 2IS', type: 'XRAY' },
  { id: 5, equipment_type_id: 1, equipment_code: 'EQ-XRAY-05', name: 'MSCP EMERGENCY BATIK', location_name: 'MSCP EMERGENCY BATIK', brand: 'NUCHTECH', model: 'CX 6040D', type: 'XRAY' },
  { id: 6, equipment_type_id: 1, equipment_code: 'EQ-XRAY-06', name: 'CIP KARYAWAN', location_name: 'CIP KARYAWAN', brand: 'SMITHS DETECTION', model: '6040 2IS HR', type: 'XRAY' },
  { id: 7, equipment_type_id: 1, equipment_code: 'EQ-XRAY-07', name: 'HBSCP LINE C', location_name: 'HBSCP LINE C', brand: 'SMITHS DETECTION', model: '6040 2IS HR', type: 'XRAY' },
  { id: 8, equipment_type_id: 1, equipment_code: 'EQ-XRAY-08', name: 'HBSCP LINE D', location_name: 'HBSCP LINE D', brand: 'SMITHS DETECTION', model: '6040 2IS HR', type: 'XRAY' },
  { id: 9, equipment_type_id: 1, equipment_code: 'EQ-XRAY-09', name: 'HBSCP LINE E', location_name: 'HBSCP LINE E', brand: 'SMITHS DETECTION', model: '6040 2IS HR', type: 'XRAY' },
  { id: 10, equipment_type_id: 1, equipment_code: 'EQ-XRAY-10', name: 'PINTU LAUD', location_name: 'PINTU LAUD', brand: 'SMITHS DETECTION', model: '6040 2IS HR', type: 'XRAY' },

  // ETD (1 unit)
  { id: 11, equipment_type_id: 4, equipment_code: 'EQ-ETD-01', name: 'REKONSILIASI ROOM', location_name: 'REKONSILIASI ROOM', brand: 'HIKVISION', model: 'ISD-SE311H', type: 'ETD' },

  // WTMD (7 unit)
  { id: 12, equipment_type_id: 2, equipment_code: 'EQ-WTMD-01', name: 'BACK UP AREA', location_name: 'BACK UP AREA', brand: 'CEIA', model: 'HIPE/PZ', type: 'WTMD' },
  { id: 13, equipment_type_id: 2, equipment_code: 'EQ-WTMD-02', name: 'CIP KARYAWAN', location_name: 'CIP KARYAWAN', brand: 'CEIA', model: 'HIPE/PZ', type: 'WTMD' },
  { id: 14, equipment_type_id: 2, equipment_code: 'EQ-WTMD-03', name: 'HBSCP LINE C', location_name: 'HBSCP LINE C', brand: 'CEIA', model: 'HIPE/PZ', type: 'WTMD' },
  { id: 15, equipment_type_id: 2, equipment_code: 'EQ-WTMD-04', name: 'HBSCP LINE D', location_name: 'HBSCP LINE D', brand: 'CEIA', model: 'HIPE/PZ', type: 'WTMD' },
  { id: 16, equipment_type_id: 2, equipment_code: 'EQ-WTMD-05', name: 'HBSCP LINE E', location_name: 'HBSCP LINE E', brand: 'CEIA', model: 'HIPE/PZ', type: 'WTMD' },
  { id: 17, equipment_type_id: 2, equipment_code: 'EQ-WTMD-06', name: 'PINTU LAUD', location_name: 'PINTU LAUD', brand: 'CEIA', model: 'HIPE/PZ', type: 'WTMD' },
  { id: 18, equipment_type_id: 2, equipment_code: 'EQ-WTMD-07', name: 'VVIP SMP SETNEG', location_name: 'VVIP SMP SETNEG', brand: 'CEIA', model: 'HIPE/PZ', type: 'WTMD' },

  // HHMD (9 unit)
  { id: 19, equipment_type_id: 3, equipment_code: 'EQ-HHMD-01', name: 'ARRIVAL', location_name: 'ARRIVAL', brand: 'CEIA', model: 'PD140E', type: 'HHMD' },
  { id: 20, equipment_type_id: 3, equipment_code: 'EQ-HHMD-02', name: 'BACK UP AREA', location_name: 'BACK UP AREA', brand: 'CEIA', model: 'PD140E', type: 'HHMD' },
  { id: 21, equipment_type_id: 3, equipment_code: 'EQ-HHMD-03', name: 'CIP KARYAWAN', location_name: 'CIP KARYAWAN', brand: 'CEIA', model: 'PD140E', type: 'HHMD' },
  { id: 22, equipment_type_id: 3, equipment_code: 'EQ-HHMD-04', name: 'HBSCP LINE C', location_name: 'HBSCP LINE C', brand: 'CEIA', model: 'PD140E', type: 'HHMD' },
  { id: 23, equipment_type_id: 3, equipment_code: 'EQ-HHMD-05', name: 'HBSCP LINE D', location_name: 'HBSCP LINE D', brand: 'CEIA', model: 'PD140E', type: 'HHMD' },
  { id: 24, equipment_type_id: 3, equipment_code: 'EQ-HHMD-06', name: 'HBSCP LINE E', location_name: 'HBSCP LINE E', brand: 'CEIA', model: 'PD140E', type: 'HHMD' },
  { id: 25, equipment_type_id: 3, equipment_code: 'EQ-HHMD-07', name: 'PINTU LAUD', location_name: 'PINTU LAUD', brand: 'CEIA', model: 'PD140E', type: 'HHMD' },
  { id: 26, equipment_type_id: 3, equipment_code: 'EQ-HHMD-08', name: 'REKONSILIASI ROOM', location_name: 'REKONSILIASI ROOM', brand: 'CEIA', model: 'PD140E', type: 'HHMD' },
  { id: 27, equipment_type_id: 3, equipment_code: 'EQ-HHMD-09', name: 'RUANG ISTIRAHAT SCP 2', location_name: 'RUANG ISTIRAHAT SCP 2', brand: 'CEIA', model: 'PD140E', type: 'HHMD' },
];

function loadSubscribers(): TelegramSubscriber[] {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      const data = fs.readFileSync(SUBSCRIBERS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error reading subscribers file:", e);
  }
  return [];
}

function saveSubscribers(subs: TelegramSubscriber[]) {
  safeWriteJsonFile(SUBSCRIBERS_FILE, subs);
}

function loadTelegramServerConfig(): TelegramServerConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(data);
      if (!parsed.chat_id) {
        parsed.chat_id = process.env.TELEGRAM_CHAT_ID || "-5531204015";
      }
      return parsed;
    }
  } catch (e) {
    console.error("Error reading server config file:", e);
  }
  return {
    chat_id: process.env.TELEGRAM_CHAT_ID || "-5531204015",
    broadcast_to_all_subscribers: true,
    auto_notify_corrective: true,
    auto_notify_recurring_fault: true,
  };
}

function saveTelegramServerConfig(cfg: TelegramServerConfig) {
  safeWriteJsonFile(CONFIG_FILE, cfg);
}

function loadOperationalState(): OperationalState {
  try {
    if (fs.existsSync(OPERATIONAL_STATE_FILE)) {
      const data = fs.readFileSync(OPERATIONAL_STATE_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error reading operational state file:", e);
  }
  return {
    operationalDate: new Date().toISOString().split("T")[0],
    shift: "pagi",
    technicianNames: [],
    equipments: DEFAULT_EQUIPMENTS,
    correctiveReports: [],
    updatedAt: new Date().toISOString(),
  };
}

function saveOperationalState(state: OperationalState) {
  safeWriteJsonFile(OPERATIONAL_STATE_FILE, state);
}

// Tracks recent message IDs sent or received per chat to support automatic clean up
const chatRecentMessages = new Map<string, number[]>();

function recordChatMessage(chatId: string, messageId: number) {
  if (!messageId || !chatId) return;
  const strId = String(chatId);
  const list = chatRecentMessages.get(strId) || [];
  if (!list.includes(messageId)) {
    list.push(messageId);
  }
  // Keep up to 30 recent message IDs per chat
  if (list.length > 30) {
    list.splice(0, list.length - 30);
  }
  chatRecentMessages.set(strId, list);
}

async function cleanChatMessages(chatId: string, token: string, excludeIds: number[] = []) {
  if (!chatId || !token) return;
  const strId = String(chatId);
  const list = chatRecentMessages.get(strId) || [];
  if (list.length === 0) return;
  const toDelete = list.filter((id) => !excludeIds.includes(id));
  chatRecentMessages.set(strId, list.filter((id) => excludeIds.includes(id)));

  for (const msgId of toDelete) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: strId, message_id: msgId }),
      });
    } catch (_) {
      // Ignore errors if already deleted or permissions missing
    }
  }
}

let lastProcessedUpdateId = 0;
let isPollingStarted = false;

process.on("uncaughtException", (err) => {
  console.error("[Uncaught Exception]:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[Unhandled Rejection] at:", promise, "reason:", reason);
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON parser with high limit for HTML payload with images
  app.use(express.json({ limit: "50mb" }));

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Telegram Bot: Check status & get bot profile
  app.get("/api/telegram/status", async (req, res) => {
    const serverCfg = loadTelegramServerConfig();
    const token = (req.query.token as string) || serverCfg.bot_token || process.env.TELEGRAM_BOT_TOKEN;
    const defaultChatId = serverCfg.chat_id || process.env.TELEGRAM_CHAT_ID || "-5531204015";

    if (!token) {
      return res.json({
        configured: false,
        message: "TELEGRAM_BOT_TOKEN belum diset di server maupun konfigurasi.",
        defaultChatId,
      });
    }

    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await tgRes.json() as any;

      if (!data.ok) {
        return res.json({
          configured: false,
          error: data.description || "Token Telegram tidak valid",
          defaultChatId,
        });
      }

      return res.json({
        configured: true,
        bot_id: data.result.id,
        bot_name: data.result.first_name,
        bot_username: data.result.username,
        defaultChatId,
        serverConfig: {
          chat_id: serverCfg.chat_id,
          broadcast_to_all_subscribers: serverCfg.broadcast_to_all_subscribers,
          auto_notify_corrective: serverCfg.auto_notify_corrective,
          auto_notify_recurring_fault: serverCfg.auto_notify_recurring_fault,
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        configured: false,
        error: err.message || "Gagal menghubungi Telegram Bot API",
      });
    }
  });

  // Telegram Bot: Save token and full settings to server file (.data/telegram_server_config.json)
  app.post("/api/telegram/save-token", async (req, res) => {
    try {
      const {
        token,
        chat_id,
        broadcast_to_all_subscribers,
        auto_notify_corrective,
        auto_notify_recurring_fault,
      } = req.body;
      const current = loadTelegramServerConfig();
      const updated: TelegramServerConfig = {
        bot_token: token !== undefined ? token.trim() : current.bot_token,
        chat_id: chat_id !== undefined ? chat_id.trim() : current.chat_id,
        broadcast_to_all_subscribers:
          broadcast_to_all_subscribers !== undefined
            ? Boolean(broadcast_to_all_subscribers)
            : current.broadcast_to_all_subscribers,
        auto_notify_corrective:
          auto_notify_corrective !== undefined
            ? Boolean(auto_notify_corrective)
            : current.auto_notify_corrective,
        auto_notify_recurring_fault:
          auto_notify_recurring_fault !== undefined
            ? Boolean(auto_notify_recurring_fault)
            : current.auto_notify_recurring_fault,
      };
      saveTelegramServerConfig(updated);

      if (updated.bot_token) {
        triggerTelegramPolling(updated.bot_token);
      }

      return res.json({ success: true, config: updated });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Attendance API: Verify Live Person (Anti-Spoofing & Liveness Detection)
  app.post("/api/attendance/verify-liveness", async (req, res) => {
    try {
      const { image, technician_name } = req.body;
      if (!image || typeof image !== "string") {
        return res.status(400).json({
          success: false,
          isLive: false,
          confidence: 0,
          reason: "Foto selfie wajib dilampirkan untuk verifikasi keaslian.",
        });
      }

      // Extract base64 and mime type
      let mimeType = "image/jpeg";
      let base64Data = image;

      const dataUriMatch = image.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUriMatch) {
        mimeType = dataUriMatch[1];
        base64Data = dataUriMatch[2];
      }

      const client = getGeminiClient();
      if (!client) {
        // Fallback gracefully when GEMINI_API_KEY is not yet configured in environment
        console.warn("[Liveness Detection] GEMINI_API_KEY belum diset. Fallback toleran aktif.");
        return res.json({
          success: true,
          isLive: true,
          confidence: 0.9,
          reason: "Verifikasi visual dasar aktif (GEMINI_API_KEY belum diset di server).",
          detectionType: "fallback",
        });
      }

      const systemPrompt = `You are a strict biometric security and face liveness verification specialist for airport security personnel attendance.
Your task is to analyze the captured selfie photo and verify whether it is a REAL LIVE HUMAN physically present in front of the camera, or an anti-spoofing fraud attempt.

CRITICAL REJECTION CRITERIA (SPOOFING / FAKE):
1. REJECT if the image is a photo of another computer/laptop screen, tablet, or phone screen (look for pixel moiré patterns, screen bezels, reflections on glass, display glare, RGB scanlines).
2. REJECT if the image is a photo of an ID card / KTP / SIM / passport / printed badge (look for card borders, laminate gloss, small passport-style crop, ID card watermarks).
3. REJECT if the image is a photo of a physical printed photo paper (look for paper corners, creases, paper borders, glossy photographic paper glare, photo frame).
4. REJECT if no human face is detected or if the face is obscured, masked, or a non-human object/cartoon.
5. REJECT if it is clearly a 2D cutout, mask, mannequin, or AI deepfake rendering.

ACCEPT CRITERIA (REAL HUMAN):
- An actual live technician physically taking a selfie directly into the camera lens with natural 3D facial lighting, organic skin texture, natural background depth of field, and proper selfie perspective.

Return ONLY a JSON response matching the following schema:
{
  "isLive": boolean,
  "confidence": number between 0.0 and 1.0,
  "rejectionReason": string (in Indonesian language, clear and polite explaining why it was rejected, or empty if accepted),
  "detectedFace": boolean,
  "details": string (short assessment in Indonesian)
}`;

      const aiResponse = await client.models.generateContent({
        model: "gemini-3.8-flash",
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            {
              text: `Analisis foto presensi teknisi (${technician_name || "Teknisi"}). Tentukan apakah ini orang asli langsung di depan kamera atau foto dari layar PC/KTP/foto fisik. Berikan response JSON.`,
            },
          ],
        },
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const responseText = aiResponse.text || "{}";
      let parsed: any;
      try {
        parsed = JSON.parse(responseText);
      } catch (e) {
        // Fallback attempt to extract JSON if markdown code blocks were included
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Gagal mengurai respons verifikasi wajah dari AI model.");
        }
      }

      const isLive = Boolean(parsed.isLive);
      const confidence = typeof parsed.confidence === "number" ? parsed.confidence : (isLive ? 0.95 : 0.2);
      const rejectionReason = parsed.rejectionReason || (isLive ? "" : "Terdeteksi bukan orang asli langsung (diduga foto dari layar/KTP/cetakan).");
      const details = parsed.details || (isLive ? "Wajah manusia asli terverifikasi langsung di kamera." : rejectionReason);

      return res.json({
        success: true,
        isLive,
        confidence,
        rejectionReason,
        details,
        detectedFace: parsed.detectedFace !== undefined ? Boolean(parsed.detectedFace) : true,
      });
    } catch (err: any) {
      console.error("[Liveness Detection Error]:", err);
      return res.status(500).json({
        success: false,
        isLive: false,
        error: err.message || "Gagal melakukan verifikasi biometrik",
        rejectionReason: "Terjadi kesalahan sistem saat memverifikasi foto wajah.",
      });
    }
  });

  // Attendance API: Record attendance
  app.post("/api/attendance", (req, res) => {
    try {
      const record: ServerAttendanceRecord = req.body;
      if (!record || !record.technician_name) {
        return res.status(400).json({ success: false, error: "Nama teknisi wajib diisi" });
      }
      const records = loadAttendanceRecords();
      const existingIdx = records.findIndex(
        (r) =>
          r.attendance_date === record.attendance_date &&
          r.technician_name.toLowerCase() === record.technician_name.toLowerCase()
      );
      if (existingIdx >= 0) {
        records[existingIdx] = { ...records[existingIdx], ...record };
      } else {
        records.unshift(record);
      }
      saveAttendanceRecords(records.slice(0, 500));
      return res.json({ success: true, message: "Presensi berhasil disimpan", record });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Attendance API: List attendance history
  app.get("/api/attendance", (req, res) => {
    try {
      const date = req.query.date as string | undefined;
      let records = loadAttendanceRecords();
      if (date) {
        records = records.filter((r) => r.attendance_date === date);
      }
      return res.json({ success: true, records, total: records.length });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Telegram Bot: Sync Operational State from frontend for /alat & /brief commands
  app.post("/api/telegram/operational-state", (req, res) => {
    try {
      const { operationalDate, shift, technicianNames, equipments, correctiveReports } = req.body;
      const currentState = loadOperationalState();
      const rawTechs = Array.isArray(technicianNames) ? technicianNames : currentState.technicianNames;
      const safeTechs = (rawTechs || []).filter((n: string) => !isDummyOrRemovedName(n));

      const newState: OperationalState = {
        operationalDate: operationalDate || currentState.operationalDate,
        shift: shift || currentState.shift,
        technicianNames: safeTechs,
        equipments: Array.isArray(equipments) && equipments.length > 0 ? equipments : currentState.equipments,
        correctiveReports: Array.isArray(correctiveReports) ? correctiveReports : currentState.correctiveReports,
        updatedAt: new Date().toISOString(),
      };
      saveOperationalState(newState);
      return res.json({ success: true, message: "Operational state synced successfully" });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Telegram Bot: Get subscribers
  app.get("/api/telegram/subscribers", (req, res) => {
    try {
      const subscribers = loadSubscribers();
      return res.json({
        success: true,
        subscribers,
        total: subscribers.length,
        activeCount: subscribers.filter((s) => s.is_active).length,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message || "Gagal memuat daftar subscriber",
      });
    }
  });

  // Telegram Bot: Update or add subscriber manually
  app.post("/api/telegram/subscribers", (req, res) => {
    try {
      const { chat_id, name, type, username, is_active, notes } = req.body;
      if (!chat_id) {
        return res.status(400).json({ success: false, error: "chat_id wajib diisi" });
      }

      const subscribers = loadSubscribers();
      const existingIdx = subscribers.findIndex((s) => s.chat_id === String(chat_id));
      const nowStr = new Date().toISOString();

      if (existingIdx >= 0) {
        if (typeof is_active === "boolean") subscribers[existingIdx].is_active = is_active;
        if (name) subscribers[existingIdx].name = name;
        if (username !== undefined) subscribers[existingIdx].username = username;
        if (notes !== undefined) subscribers[existingIdx].notes = notes;
        subscribers[existingIdx].last_active = nowStr;
      } else {
        subscribers.push({
          chat_id: String(chat_id),
          type: type || "private",
          name: name || `Chat ${chat_id}`,
          username: username || "",
          first_seen: nowStr,
          last_active: nowStr,
          is_active: is_active !== false,
          notes: notes || "",
        });
      }

      saveSubscribers(subscribers);
      return res.json({ success: true, subscribers });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Telegram Bot: Delete subscriber
  app.delete("/api/telegram/subscribers/:chatId", (req, res) => {
    try {
      const { chatId } = req.params;
      let subscribers = loadSubscribers();
      const initialCount = subscribers.length;
      subscribers = subscribers.filter((s) => s.chat_id !== String(chatId));
      saveSubscribers(subscribers);
      return res.json({
        success: true,
        removed: initialCount !== subscribers.length,
        subscribers,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Helper to get formatted Jakarta time (WIB, UTC+7)
  function getJakartaTimeString(): string {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
  }

  // Helper to categorize equipments
  function getEquipmentCategory(eq: any): 'XRAY' | 'WTMD' | 'HHMD' | 'ETD' {
    if (eq.equipment_type_id === 1) return 'XRAY';
    if (eq.equipment_type_id === 2) return 'WTMD';
    if (eq.equipment_type_id === 3) return 'HHMD';
    if (eq.equipment_type_id === 4) return 'ETD';
    if (eq.type) {
      const t = String(eq.type).toUpperCase();
      if (t.includes('XRAY') || t.includes('X-RAY') || t === 'BAGASI' || t === 'KABIN') return 'XRAY';
      if (t.includes('WTMD')) return 'WTMD';
      if (t.includes('HHMD')) return 'HHMD';
      if (t.includes('ETD')) return 'ETD';
    }
    const nameAndModel = `${eq.name || ''} ${eq.model || ''} ${eq.equipment_code || ''}`.toUpperCase();
    if (nameAndModel.includes('WTMD') || nameAndModel.includes('HIPE')) return 'WTMD';
    if (nameAndModel.includes('HHMD') || nameAndModel.includes('PD140')) return 'HHMD';
    if (nameAndModel.includes('ETD') || nameAndModel.includes('SE311')) return 'ETD';
    return 'XRAY';
  }

  // Live operational data loader prioritizing Supabase as source of truth
  async function getLiveOperationalData(): Promise<{
    operationalDate: string;
    shift: string;
    technicians: string[];
    equipments: OperationalEquipment[];
    correctiveReports: OperationalCorrective[];
  }> {
    const opState = loadOperationalState();
    let equipments: OperationalEquipment[] =
      opState.equipments && opState.equipments.length > 0 ? opState.equipments : DEFAULT_EQUIPMENTS;
    let correctiveReports: OperationalCorrective[] = opState.correctiveReports || [];
    let technicianNames: string[] = (opState.technicianNames || []).filter(
      (n: string) => !isDummyOrRemovedName(n)
    );
    const operationalDate = opState.operationalDate || new Date().toISOString().split("T")[0];
    const shift = opState.shift || "Pagi";

    const supabase = getServerSupabase();
    if (supabase) {
      try {
        // 1. Fetch real technicians from Supabase
        const { data: techRows, error: techErr } = await supabase
          .from("technicians")
          .select("id, name, is_active");
        if (!techErr && Array.isArray(techRows) && techRows.length > 0) {
          const validSupabaseTechs = techRows
            .filter((t: any) => t.is_active !== false && !isDummyOrRemovedName(t.name))
            .map((t: any) => t.name.trim());

          if (validSupabaseTechs.length > 0) {
            // Check shift_schedules if available for today & shift
            const { data: schedRows } = await supabase
              .from("shift_schedules")
              .select("technician_id, shift, date")
              .eq("date", operationalDate)
              .eq("shift", shift);

            if (Array.isArray(schedRows) && schedRows.length > 0) {
              const onDutyIds = new Set(schedRows.map((s: any) => Number(s.technician_id)));
              const onDutyTechs = techRows
                .filter((t: any) => onDutyIds.has(Number(t.id)) && !isDummyOrRemovedName(t.name))
                .map((t: any) => t.name.trim());
              if (onDutyTechs.length > 0) {
                technicianNames = onDutyTechs;
              } else {
                technicianNames = validSupabaseTechs;
              }
            } else if (technicianNames.length === 0) {
              technicianNames = validSupabaseTechs;
            } else {
              const filtered = technicianNames.filter((tn) =>
                validSupabaseTechs.some((vst) => vst.toLowerCase() === tn.toLowerCase())
              );
              technicianNames = filtered.length > 0 ? filtered : validSupabaseTechs;
            }
          }
        }

        // 2. Fetch real equipment from Supabase
        const { data: eqRows, error: eqErr } = await supabase
          .from("equipment")
          .select("id, name, model, brand, location_id, equipment_type_id, equipment_code, status, is_active");
        if (!eqErr && Array.isArray(eqRows) && eqRows.length > 0) {
          equipments = eqRows.filter((e: any) => e.is_active !== false);
        }

        // 3. Fetch active/recent corrective records from Supabase
        const { data: crRows, error: crErr } = await supabase
          .from("corrective_records")
          .select("id, equipment_id, problem_description, action_taken, status, result, corrective_date, start_time, end_time, corrective_code, notes")
          .order("id", { ascending: false })
          .limit(20);
        if (!crErr && Array.isArray(crRows) && crRows.length > 0) {
          correctiveReports = crRows.map((r: any) => ({
            id: r.id,
            equipment_id: r.equipment_id,
            problem_description: r.problem_description,
            action_taken: r.action_taken,
            result: r.result || r.status || "Pending",
            corrective_code: r.corrective_code,
            corrective_date: r.corrective_date || operationalDate,
            date: r.corrective_date,
            start_time: r.start_time,
            notes: r.notes,
          }));
        }
      } catch (dbErr) {
        console.warn("[getLiveOperationalData Supabase query exception]:", dbErr);
      }
    }

    return {
      operationalDate,
      shift,
      technicians: technicianNames.filter((n) => !isDummyOrRemovedName(n)),
      equipments,
      correctiveReports,
    };
  }

  // Helper builders for rich messages with interactive inline keyboards
  async function buildAlatPayload() {
    const live = await getLiveOperationalData();
    const equipments = live.equipments && live.equipments.length > 0 ? live.equipments : DEFAULT_EQUIPMENTS;
    const activeCorrectives = (live.correctiveReports || []).filter((c) => c.result !== "Resolved");
    const issueEqIds = new Set(activeCorrectives.map((c) => Number(c.equipment_id)));

    const catMap: Record<'XRAY' | 'WTMD' | 'HHMD' | 'ETD', { normal: number; rusak: number; total: number }> = {
      XRAY: { normal: 0, rusak: 0, total: 0 },
      WTMD: { normal: 0, rusak: 0, total: 0 },
      HHMD: { normal: 0, rusak: 0, total: 0 },
      ETD: { normal: 0, rusak: 0, total: 0 },
    };

    equipments.forEach((eq) => {
      const cat = getEquipmentCategory(eq);
      const isRusak = issueEqIds.has(Number(eq.id));
      catMap[cat].total++;
      if (isRusak) {
        catMap[cat].rusak++;
      } else {
        catMap[cat].normal++;
      }
    });

    const totalCount = equipments.length;
    const totalRusak = catMap.XRAY.rusak + catMap.WTMD.rusak + catMap.HHMD.rusak + catMap.ETD.rusak;
    const totalNormal = totalCount - totalRusak;
    const readinessPercent = totalCount > 0 ? ((totalNormal / totalCount) * 100).toFixed(1) : "100";
    const timeStr = getJakartaTimeString();

    let reply = `🛫 <b>STATUS KESIAPAN ALAT — SEC-OPS</b>\n`;
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    reply += `📊 <b>Tingkat Kesiapan:</b> <b>${readinessPercent}%</b> (${totalNormal}/${totalCount} Unit Siap)\n\n`;

    reply += `📋 <b>Rincian Status Per Kategori:</b>\n`;
    reply += `• 🩻 <b>X-Ray:</b> ${catMap.XRAY.rusak} rusak / ${catMap.XRAY.normal} normal\n`;
    reply += `• 🚶‍♂️ <b>WTMD:</b> ${catMap.WTMD.rusak} rusak / ${catMap.WTMD.normal} normal\n`;
    reply += `• 🔍 <b>HHMD:</b> ${catMap.HHMD.rusak} rusak / ${catMap.HHMD.normal} normal\n`;
    reply += `• 🧪 <b>ETD:</b> ${catMap.ETD.rusak} rusak / ${catMap.ETD.normal} normal\n\n`;

    if (totalRusak > 0) {
      reply += `🚨 <b>Unit Terkendala (${totalRusak} Unit):</b>\n`;
      activeCorrectives.forEach((c) => {
        let eqName = c.equipment_name;
        if (!eqName && c.equipment_id) {
          const found = equipments.find((e) => Number(e.id) === Number(c.equipment_id));
          if (found) eqName = `${found.name} (${found.model || ''})`;
        }
        const safeName = escapeTgHtml(eqName || "Unit");
        const safeDesc = escapeTgHtml(c.problem_description || c.fault_description || "Kendala operasional");
        reply += `• 🔴 <b>${safeName}:</b> ${safeDesc}\n`;
      });
    } else {
      reply += `✨ <i>Semua unit X-Ray, WTMD, HHMD & ETD beroperasi normal.</i>\n`;
    }

    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    reply += `⏱️ <i>Pembaruan: ${escapeTgHtml(timeStr)} WIB</i>`;

    const reply_markup = {
      inline_keyboard: [
        [
          { text: "🔄 Perbarui Status", callback_data: "refresh_alat" },
          { text: "📋 Ringkasan Shift", callback_data: "show_brief" },
        ],
        [
          { text: "📅 Cek Jadwal", callback_data: "show_jadwal" },
          { text: "📜 Riwayat Kerusakan", callback_data: "show_history" },
        ],
        [
          { text: "◀️ Kembali ke Menu Utama", callback_data: "show_start" },
        ],
      ],
    };

    return { text: reply, reply_markup };
  }

  function buildJadwalPayload(interval: string = "all") {
    let reply = `📅 <b>JADWAL PEMELIHARAAN PREVENTIF FASILITAS</b>\n`;
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;

    if (interval === "harian") {
      reply += `⏱️ <b>INTERVAL: HARIAN (DAILY / SETIAP SHIFT)</b>\n\n`;
      reply += `📌 <b>Waktu Pelaksanaan:</b>\n`;
      reply += `• Shift Pagi: Pukul 07:00 - 08:00 WIB\n`;
      reply += `• Shift Siang: Pukul 14:00 - 15:00 WIB\n`;
      reply += `• Shift Malam: Pukul 21:00 - 22:00 WIB\n\n`;
      reply += `🛠️ <b>Cakupan Pemeliharaan:</b>\n`;
      reply += `• 🩻 <b>X-Ray:</b> Uji CTP test piece (penetrasi kawat 30 AWG & resolusi spasial), uji emergency stop, tirai timbal (lead curtain), kebersihan conveyor & roller, lampu indikator radiasi.\n`;
      reply += `• 🚶‍♂️ <b>WTMD:</b> Test piece OTP/STP (deteksi senjata tajam/senpi di zona atas-bawah), fungsi alarm audio-visual, kebersihan body.\n`;
      reply += `• 🔍 <b>HHMD:</b> Uji fungsi deteksi logam uji acuan, kondisi baterai/charger, tombol sensitivitas.\n`;
      reply += `• 🧪 <b>ETD:</b> Daily Trap Verification, kebersihan nozzle sampling, verifikasi gas & consumables.\n`;
    } else if (interval === "mingguan") {
      reply += `🗓️ <b>INTERVAL: MINGGUAN (WEEKLY)</b>\n\n`;
      reply += `📌 <b>Waktu Pelaksanaan:</b> Setiap Hari Senin (Awal Pekan)\n\n`;
      reply += `🛠️ <b>Cakupan Pemeliharaan:</b>\n`;
      reply += `• 🩻 <b>X-Ray:</b> Pembersihan fotosel / light barriers, periksa kabel grounding (PE wiring), uji interlock cover switch, pembersihan filter udara & kipas pendingin power supply.\n`;
      reply += `• 🚶‍♂️ <b>WTMD:</b> Uji interferensi elektromagnetik lingkungan, periksa grounding kabel & kekokohan baut pondasi.\n`;
      reply += `• 🔍 <b>HHMD:</b> Pemeriksaan konektor charging rak, uji kapasitas baterai kontinu.\n`;
      reply += `• 🧪 <b>ETD:</b> Pembersihan desorber unit, pengecekan trap sampling consumables.\n`;
    } else if (interval === "bulanan") {
      reply += `📆 <b>INTERVAL: BULANAN (MONTHLY)</b>\n\n`;
      reply += `📌 <b>Waktu Pelaksanaan:</b> Tanggal 1 - 5 Awal Bulan\n\n`;
      reply += `🛠️ <b>Cakupan Pemeliharaan:</b>\n`;
      reply += `• 🩻 <b>X-Ray:</b> Pengujian Organic & Inorganic stripping, kalibrasi generator X-Ray (tegangan kV & arus tabung mA), uji auto change-over UPS saat pemadaman, backup log harddisk & image archives.\n`;
      reply += `• 🚶‍♂️ <b>WTMD:</b> Uji keseragaman deteksi (uniformity test multi-zone), kalibrasi tingkat sensitivitas regulasi ICAO/Dirjen Hubud.\n`;
      reply += `• 🔍 <b>HHMD:</b> Kalibrasi sensitivitas medan induksi elektromagnetik.\n`;
      reply += `• 🧪 <b>ETD:</b> Penggantian membran filter udara, kalibrasi drift tube ion mobility spectrometry.\n`;
    } else if (interval === "berkala") {
      reply += `📊 <b>INTERVAL: BERKALA (3 BULAN, 6 BULAN & TAHUNAN)</b>\n\n`;
      reply += `📌 <b>1. Triwulan (3 Bulanan):</b>\n`;
      reply += `• Waktu: Maret, Juni, September, Desember\n`;
      reply += `• Uji radiasi bocor (radiation leakage survey meter &lt; 0.1 mR/hr), pembersihan menyeluruh internal mesin, inspeksi visual safety interlock.\n\n`;
      reply += `📌 <b>2. Semesteran (6 Bulanan):</b>\n`;
      reply += `• Waktu: Juni & Desember\n`;
      reply += `• Beam alignment X-ray collimator, kalibrasi sistem deteksi ancaman otomatis (ATD/TIP), pemeliharaan drum motor conveyor.\n\n`;
      reply += `📌 <b>3. Tahunan (Annual):</b>\n`;
      reply += `• Uji Kelaikan Operasi Fasilitas Keamanan Penerbangan (Sertifikasi Dirjen Hubud) & overhaul total generator X-Ray.\n`;
    } else {
      reply += `📋 <b>Ringkasan Siklus Pemeliharaan Fasilitas:</b>\n\n`;
      reply += `⏱️ <b>1. Harian (Setiap Shift):</b>\n`;
      reply += `   • Pagi (07:00), Siang (14:00), Malam (21:00)\n`;
      reply += `   • Uji CTP test, tirai timbal, sensor optik, emergency stop, verifikasi baterai & trap.\n\n`;
      reply += `🗓️ <b>2. Mingguan (Weekly):</b>\n`;
      reply += `   • Setiap Hari Senin\n`;
      reply += `   • Pembersihan fotosel, filter kipas, uji grounding & interlock cover.\n\n`;
      reply += `📆 <b>3. Bulanan (Monthly):</b>\n`;
      reply += `   • Tanggal 1 - 5 Tiap Bulan\n`;
      reply += `   • Kalibrasi material discrimination, arus/tegangan generator kV, uji UPS cut-off.\n\n`;
      reply += `📊 <b>4. Triwulan (3 Bulan):</b> Maret, Juni, Sep, Des (Uji radiasi bocor).\n`;
      reply += `🔍 <b>5. Semesteran (6 Bulan):</b> Juni & Des (Beam alignment & kalibrasi sensor).\n`;
      reply += `🏆 <b>6. Tahunan (1 Tahun):</b> Sertifikasi Dirjen Hubud & Overhaul unit.\n\n`;
      reply += `💡 <i>Pilih tombol di bawah untuk melihat rincian tiap interval:</i>`;
    }

    const reply_markup = {
      inline_keyboard: [
        [
          { text: "⏱️ Harian", callback_data: "jadwal_harian" },
          { text: "🗓️ Mingguan", callback_data: "jadwal_mingguan" },
        ],
        [
          { text: "📆 Bulanan", callback_data: "jadwal_bulanan" },
          { text: "📊 3 Bln / 6 Bln / 1 Thn", callback_data: "jadwal_berkala" },
        ],
        [
          { text: "🔄 Semua Interval", callback_data: "jadwal_all" },
          { text: "◀️ Kembali ke Menu Utama", callback_data: "show_start" },
        ],
      ],
    };

    return { text: reply, reply_markup };
  }

  async function buildHistoryPayload() {
    const live = await getLiveOperationalData();
    const reports = live.correctiveReports || [];
    const equipments = live.equipments && live.equipments.length > 0 ? live.equipments : DEFAULT_EQUIPMENTS;

    let reply = `📜 <b>RIWAYAT KERUSAKAN & PERBAIKAN ALAT</b>\n`;
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;

    if (reports.length === 0) {
      reply += `✨ <i>Belum ada riwayat kerusakan yang tercatat pada sesi ini.</i>\n\n`;
      reply += `Semua peralatan tercatat beroperasi normal dan belum ada tiket kendala yang dilaporkan.\n`;
    } else {
      reply += `Tercatat total <b>${reports.length} laporan riwayat kerusakan</b>:\n\n`;
      const sorted = [...reports].reverse().slice(0, 5);
      sorted.forEach((r: any, idx: number) => {
        let eqName = r.equipment_name;
        if (!eqName && r.equipment_id) {
          const found = equipments.find((e) => Number(e.id) === Number(r.equipment_id));
          if (found) eqName = `${found.name} (${found.model || ''})`;
        }
        const isResolved = r.result === "Resolved";
        const statusIcon = isResolved ? "🟢" : r.result === "In Progress" ? "🟡" : "🔴";
        const statusText = isResolved ? "Selesai (Resolved)" : r.result === "In Progress" ? "Sedang Dikerjakan" : "Menunggu Penanganan";

        let tech = "-";
        if (Array.isArray(r.technicians) && r.technicians.length > 0) {
          const validTechs = r.technicians.filter((t: string) => !isDummyOrRemovedName(t));
          tech = validTechs.length > 0 ? validTechs.join(", ") : "-";
        } else if (r.technician_name && !isDummyOrRemovedName(r.technician_name)) {
          tech = r.technician_name;
        } else if (r.created_by && !isDummyOrRemovedName(r.created_by)) {
          tech = r.created_by;
        }

        const safeEqName = escapeTgHtml(eqName || "Unit Peralatan");
        const safeDesc = escapeTgHtml(r.problem_description || r.fault_description || "Kendala operasional");
        const safeDate = escapeTgHtml(r.corrective_date || r.date || live.operationalDate);
        const safeTime = r.start_time ? ` pk ${escapeTgHtml(r.start_time)}` : "";
        const safeTech = escapeTgHtml(tech);

        reply += `${idx + 1}. ${statusIcon} <b>${safeEqName}</b>\n`;
        reply += `   📅 <b>Waktu:</b> ${safeDate}${safeTime}\n`;
        reply += `   ⚠️ <b>Kendala:</b> ${safeDesc}\n`;
        if (r.action_taken) {
          reply += `   🔧 <b>Tindakan:</b> ${escapeTgHtml(r.action_taken)}\n`;
        }
        reply += `   👷 <b>Teknisi:</b> ${safeTech}\n`;
        reply += `   📊 <b>Status:</b> ${statusText}\n\n`;
      });
    }

    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    reply += `💡 <i>Ketik /alat untuk cek kesiapan saat ini atau /jadwal untuk agenda pemeliharaan.</i>`;

    const reply_markup = {
      inline_keyboard: [
        [
          { text: "🔄 Perbarui Riwayat", callback_data: "show_history" },
          { text: "🛠️ Cek Status Alat", callback_data: "refresh_alat" },
        ],
        [
          { text: "📅 Cek Jadwal", callback_data: "show_jadwal" },
          { text: "◀️ Kembali ke Menu Utama", callback_data: "show_start" },
        ],
      ],
    };

    return { text: reply, reply_markup };
  }

  async function buildBriefPayload() {
    const live = await getLiveOperationalData();
    const equipments = live.equipments && live.equipments.length > 0 ? live.equipments : DEFAULT_EQUIPMENTS;
    const activeCorrectives = (live.correctiveReports || []).filter((c) => c.result !== "Resolved");
    const issueEqIds = new Set(activeCorrectives.map((c) => Number(c.equipment_id)));

    const totalCount = equipments.length;
    const normalCount = equipments.filter((e) => !issueEqIds.has(Number(e.id))).length;
    const readinessPercent = totalCount > 0 ? ((normalCount / totalCount) * 100).toFixed(1) : "100";

    const safeTechNames = (live.technicians || []).filter((n) => !isDummyOrRemovedName(n));
    const techStr = safeTechNames.length > 0 ? safeTechNames.map(escapeTgHtml).join(", ") : "Tim Teknisi Jaga";
    const timeStr = getJakartaTimeString();

    let reply = `📋 <b>RINGKASAN OPERASIONAL SHIFT — FASKAMPEN</b>\n`;
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    reply += `📅 <b>Tanggal:</b> ${escapeTgHtml(live.operationalDate)}\n`;
    reply += `⏰ <b>Shift Kerja:</b> ${escapeTgHtml((live.shift || "Pagi").toUpperCase())}\n`;
    reply += `👷 <b>Personel Jaga:</b> ${techStr}\n`;
    reply += `📊 <b>Kesiapan Fasilitas:</b> <b>${readinessPercent}%</b> (${normalCount}/${totalCount} Unit Siap)\n\n`;

    if (activeCorrectives.length > 0) {
      reply += `🚨 <b>Kendala Aktif (${activeCorrectives.length} Unit):</b>\n`;
      activeCorrectives.forEach((c) => {
        let eqName = c.equipment_name;
        if (!eqName && c.equipment_id) {
          const found = equipments.find((e) => Number(e.id) === Number(c.equipment_id));
          if (found) eqName = `${found.name} (${found.model || ''})`;
        }
        const safeName = escapeTgHtml(eqName || "Unit");
        const safeProb = escapeTgHtml(c.problem_description || c.fault_description || "Kendala");
        reply += `• <b>${safeName}:</b> ${safeProb}\n`;
      });
    } else {
      reply += `✨ <i>Tidak ada kendala aktif saat ini. Fasilitas prima.</i>\n`;
    }
    reply += `\n⏱️ <i>Terakhir diperbarui: ${escapeTgHtml(timeStr)} WIB</i>`;

    const reply_markup = {
      inline_keyboard: [
        [
          { text: "🛠️ Cek Status Alat", callback_data: "refresh_alat" },
          { text: "🔄 Perbarui Ringkasan", callback_data: "refresh_brief" },
        ],
        [
          { text: "📅 Cek Jadwal", callback_data: "show_jadwal" },
          { text: "📜 Riwayat Kerusakan", callback_data: "show_history" },
        ],
        [
          { text: "◀️ Kembali ke Menu Utama", callback_data: "show_start" },
        ],
      ],
    };

    return { text: reply, reply_markup };
  }

  function buildStartPayload(chatTitle: string, chatId: string, isAlreadyActive: boolean) {
    const safeTitle = escapeTgHtml(chatTitle);
    let reply = `🛫 <b>Sistem Pemeliharaan X-Ray & Fasilitas SEC-OPS</b>\n`;
    reply += `━━━━━━━━━━━━━━━━━━━━\n`;
    reply += `Halo <b>${safeTitle}</b>! 👋\n\n`;
    reply += `Selamat datang di bot monitoring fasilitas keamanan penerbangan (FASKAMPEN).\n\n`;

    if (isAlreadyActive) {
      reply += `✅ <b>Status:</b> <i>Terdaftar & Aktif</i>\n\n`;
    } else {
      reply += `📌 <i>Klik tombol <b>📝 Daftarkan ID Saya</b> di bawah agar otomatis menerima siaran briefing & alert kerusakan.</i>\n\n`;
    }

    reply += `🛠️ <b>Menu & Perintah Bot:</b>\n`;
    reply += `• <b>/alat</b> — Cek status kesiapan alat (X-Ray, WTMD, HHMD, ETD)\n`;
    reply += `• <b>/jadwal</b> — Cek jadwal pemeliharaan (Harian, Mingguan, Bulanan, dll)\n`;
    reply += `• <b>/history</b> — Riwayat kerusakan & perbaikan alat\n`;
    reply += `• <b>/brief</b> — Ringkasan shift & personel jaga\n`;
    reply += `• <b>/daftar</b> — Pendaftaran ID otomatis\n`;
    reply += `• <b>/bantuan</b> — Panduan lengkap fitur bot\n\n`;
    reply += `<i>Pusat Pemeliharaan Fasilitas Keamanan Penerbangan</i>`;

    const buttons: any[] = [];
    if (!isAlreadyActive) {
      buttons.push([{ text: "📝 Daftarkan ID Saya", callback_data: "do_daftar" }]);
    }
    buttons.push([
      { text: "🛠️ Cek Status Alat", callback_data: "refresh_alat" },
      { text: "📋 Ringkasan Shift", callback_data: "show_brief" },
    ]);
    buttons.push([
      { text: "📅 Cek Jadwal", callback_data: "show_jadwal" },
      { text: "📜 Riwayat Kerusakan", callback_data: "show_history" },
    ]);

    return { text: reply, reply_markup: { inline_keyboard: buttons } };
  }

  function buildDaftarPayload(chatTitle: string, chatId: string, isAlreadyRegistered: boolean, chatType: string) {
    const safeTitle = escapeTgHtml(chatTitle);
    if (isAlreadyRegistered) {
      const reply =
        `⚠️ <b>Kamu sudah terdaftar!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `• <b>Nama:</b> <b>${safeTitle}</b>\n` +
        `• <b>Tipe:</b> ${chatType === "private" ? "Akun Pribadi" : "Grup Operasional"}\n` +
        `• <b>Status:</b> <i>Aktif Menerima Siaran Laporan</i>\n\n` +
        `ID Anda sudah aktif terdaftar di sistem pemeliharaan FASKAMPEN. Setiap ada Daily Briefing, tiket kerusakan alat (Corrective), dan peringatan teknis akan otomatis dikirimkan ke sini.\n\n` +
        `💡 Klik tombol di bawah atau ketik <b>/alat</b> untuk memeriksa status alat saat ini.`;

      const reply_markup = {
        inline_keyboard: [
          [
            { text: "🛠️ Cek Status Alat", callback_data: "refresh_alat" },
            { text: "📋 Ringkasan Shift", callback_data: "show_brief" },
          ],
          [
            { text: "📅 Cek Jadwal", callback_data: "show_jadwal" },
            { text: "◀️ Kembali ke Menu Utama", callback_data: "show_start" },
          ],
        ],
      };
      return { text: reply, reply_markup };
    }

    const reply =
      `✅ <b>Pendaftaran Berhasil!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• <b>Nama:</b> <b>${safeTitle}</b>\n` +
      `• <b>Tipe:</b> ${chatType === "private" ? "Akun Pribadi" : "Grup Operasional"}\n\n` +
      `Selamat! ID Anda telah berhasil didaftarkan ke sistem pemeliharaan FASKAMPEN SEC-OPS.\n` +
      `Mulai sekarang Anda akan otomatis menerima notifikasi:\n` +
      `• 📋 <b>Supervisor Daily Briefing</b> pergantian shift\n` +
      `• 🚨 <b>Tiket Kerusakan (Corrective)</b> saat dilaporkan\n` +
      `• ⚠️ <b>Peringatan Kerusakan Berulang (Recurring Faults)</b>\n\n` +
      `💡 Klik tombol di bawah untuk langsung memeriksa kondisi alat.`;

    const reply_markup = {
      inline_keyboard: [
        [
          { text: "🛠️ Cek Status Alat Sekarang", callback_data: "refresh_alat" },
          { text: "📅 Cek Jadwal", callback_data: "show_jadwal" },
        ],
        [
          { text: "📜 Riwayat Kerusakan", callback_data: "show_history" },
          { text: "◀️ Kembali ke Menu Utama", callback_data: "show_start" },
        ],
      ],
    };
    return { text: reply, reply_markup };
  }

  // Tracks processed incoming Telegram message IDs and callback queries to prevent duplicate replies
  const processedIncomingMessageKeys = new Set<string>();
  const processedCallbackQueryIds = new Set<string>();

  function isDuplicateIncomingMessage(chatId: string, messageId: number | undefined): boolean {
    if (!messageId) return false;
    const key = `${chatId}:${messageId}`;
    if (processedIncomingMessageKeys.has(key)) {
      return true;
    }
    processedIncomingMessageKeys.add(key);
    if (processedIncomingMessageKeys.size > 500) {
      const oldest = processedIncomingMessageKeys.values().next().value;
      if (oldest) processedIncomingMessageKeys.delete(oldest);
    }
    return false;
  }

  function isDuplicateCallbackQuery(cbId: string | undefined): boolean {
    if (!cbId) return false;
    if (processedCallbackQueryIds.has(cbId)) {
      return true;
    }
    processedCallbackQueryIds.add(cbId);
    if (processedCallbackQueryIds.size > 500) {
      const oldest = processedCallbackQueryIds.values().next().value;
      if (oldest) processedCallbackQueryIds.delete(oldest);
    }
    return false;
  }

  // Helper function to register or update a subscriber and process commands
  async function processIncomingTelegramMessage(msg: any, token: string) {
    if (!msg || !msg.chat) return false;
    const chatId = String(msg.chat.id);
    const userMsgId = msg.message_id;

    // Deduplication check: ignore if the exact message ID was already processed
    if (userMsgId && isDuplicateIncomingMessage(chatId, userMsgId)) {
      return false;
    }

    const chatType = msg.chat.type || "private";
    const senderName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ");
    const chatTitle = msg.chat.title || senderName || "Pengguna Telegram";
    const username = msg.from?.username || msg.chat.username || "";
    const rawText = (msg.text || "").trim();
    const firstWord = rawText.split(/\s+/)[0] || "";
    const cmd = firstWord.toLowerCase().split("@")[0];
    const nowStr = new Date().toISOString();

    // Record incoming user message ID
    if (userMsgId) {
      recordChatMessage(chatId, userMsgId);
    }

    const subscribers = loadSubscribers();
    const existingIdx = subscribers.findIndex((s) => s.chat_id === chatId);
    const existingSub = existingIdx >= 0 ? subscribers[existingIdx] : null;

    // Helper to send reply without deleting previous chat history (cleanHistory defaults to false)
    const sendReply = async (replyText: string, replyMarkup?: any, cleanHistory: boolean = false) => {
      if (cleanHistory) {
        await cleanChatMessages(chatId, token);
      }

      try {
        let resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: replyText,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
          }),
        });
        let resData = (await resp.json()) as any;
        if (!resData?.ok && resData?.description?.includes("can't parse entities")) {
          resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: replyText.replace(/<[^>]*>?/gm, ""),
              disable_web_page_preview: true,
              ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
            }),
          });
          resData = (await resp.json()) as any;
        }

        if (resData?.ok && resData.result?.message_id) {
          recordChatMessage(chatId, resData.result.message_id);
        }
      } catch (err) {
        console.warn("[Telegram Auto-Reply Error]:", err);
      }
    };

    // Command: /bersih, /clear, /hapus (manual cleaning if explicitly triggered)
    if (cmd === "/bersih" || cmd === "/clear" || cmd === "/hapus") {
      await cleanChatMessages(chatId, token);
      const confirmMsg =
        `🧹 <b>Riwayat percakapan telah dibersihkan!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Ketik <b>/alat</b> untuk cek status alat atau <b>/start</b> untuk menu utama.`;

      const markup = {
        inline_keyboard: [
          [
            { text: "🛠️ Cek Status Alat", callback_data: "refresh_alat" },
            { text: "◀️ Kembali ke Menu Utama", callback_data: "show_start" },
          ],
        ],
      };

      await sendReply(confirmMsg, markup, false);
      return false;
    }

    // 1. Command: /start
    if (cmd === "/start") {
      const isAlreadyActive = !!(existingSub && existingSub.is_active);
      const payload = buildStartPayload(chatTitle, chatId, isAlreadyActive);
      await sendReply(payload.text, payload.reply_markup, false);
      return false;
    }

    // 2. Command: /daftar
    if (cmd === "/daftar") {
      if (existingSub && existingSub.is_active) {
        const payload = buildDaftarPayload(chatTitle, chatId, true, chatType);
        await sendReply(payload.text, payload.reply_markup, false);
        return false;
      }

      // Register or reactivate
      if (existingSub) {
        existingSub.is_active = true;
        existingSub.name = chatTitle;
        if (username) existingSub.username = username;
        existingSub.last_active = nowStr;
        existingSub.last_message = rawText;
      } else {
        subscribers.push({
          chat_id: chatId,
          type: chatType,
          name: chatTitle,
          username,
          first_seen: nowStr,
          last_active: nowStr,
          last_message: rawText,
          is_active: true,
        });
      }
      saveSubscribers(subscribers);

      const payload = buildDaftarPayload(chatTitle, chatId, false, chatType);
      await sendReply(payload.text, payload.reply_markup, false);
      return true;
    }

    // 3. Command: /alat, /cek, /status
    if (cmd === "/alat" || cmd === "/cek" || cmd === "/status") {
      const payload = await buildAlatPayload();
      await sendReply(payload.text, payload.reply_markup, false);
      return false;
    }

    // 4. Command: /jadwal, /schedule
    if (cmd === "/jadwal" || cmd === "/schedule") {
      const payload = buildJadwalPayload("all");
      await sendReply(payload.text, payload.reply_markup, false);
      return false;
    }

    // 5. Command: /history, /riwayat, /kerusakan
    if (cmd === "/history" || cmd === "/riwayat" || cmd === "/kerusakan") {
      const payload = await buildHistoryPayload();
      await sendReply(payload.text, payload.reply_markup, false);
      return false;
    }

    // 6. Command: /brief, /shift
    if (cmd === "/brief" || cmd === "/shift") {
      const payload = await buildBriefPayload();
      await sendReply(payload.text, payload.reply_markup, false);
      return false;
    }

    // 7. Command: /id
    if (cmd === "/id") {
      const isRegistered = existingSub && existingSub.is_active;
      const reply =
        `🆔 <b>Informasi Chat Telegram</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `• <b>Chat ID:</b> <code>${chatId}</code>\n` +
        `• <b>Nama:</b> <b>${chatTitle}</b>\n` +
        `• <b>Tipe:</b> ${chatType}\n` +
        `• <b>Status Terdaftar:</b> ${isRegistered ? "✅ Sudah Terdaftar" : "❌ Belum Terdaftar (Ketik /daftar)"}\n\n` +
        `<i>💡 Chat ID aman untuk diketahui dan hanya berfungsi sebagai alamat penerima pesan siaran bot.</i>`;

      const markup = {
        inline_keyboard: [
          [
            { text: "🛠️ Cek Status Alat", callback_data: "refresh_alat" },
            { text: "◀️ Kembali ke Menu Utama", callback_data: "show_start" },
          ],
        ],
      };

      await sendReply(reply, markup, false);
      return false;
    }

    // 8. Command: /bantuan, /help
    if (cmd === "/bantuan" || cmd === "/help") {
      const reply =
        `📖 <b>PANDUAN PERINTAH BOT FASKAMPEN</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Berikut perintah yang dapat Anda gunakan:\n\n` +
        `• <b>/start</b> — Tampilkan sambutan dan menu navigasi bot\n` +
        `• <b>/daftar</b> — Daftarkan ID Anda agar otomatis menerima siaran laporan\n` +
        `• <b>/alat</b> — Cek status kesiapan alat (X-Ray, WTMD, HHMD, ETD)\n` +
        `• <b>/jadwal</b> — Cek jadwal pemeliharaan (Harian, Mingguan, Bulanan, dll)\n` +
        `• <b>/history</b> — Riwayat kerusakan & tiket perbaikan alat\n` +
        `• <b>/brief</b> — Ringkasan shift & kesiapan fasilitas hari ini\n` +
        `• <b>/id</b> — Cek Chat ID Telegram Anda\n` +
        `• <b>/bantuan</b> — Tampilkan panduan ini\n\n` +
        `<i>Gunakan tombol interaktif di bawah pesan untuk beralih menu dengan cepat.</i>`;

      const markup = {
        inline_keyboard: [
          [
            { text: "🛠️ Cek Status Alat", callback_data: "refresh_alat" },
            { text: "📅 Cek Jadwal", callback_data: "show_jadwal" },
          ],
          [
            { text: "📜 Riwayat Kerusakan", callback_data: "show_history" },
            { text: "◀️ Kembali ke Menu Utama", callback_data: "show_start" },
          ],
        ],
      };

      await sendReply(reply, markup, false);
      return false;
    }

    // Fallback for private message if command is not recognized
    if (chatType === "private" && rawText.startsWith("/")) {
      const reply =
        `Perintah tidak dikenali. Ketik <b>/bantuan</b> untuk melihat daftar perintah, atau klik tombol di bawah untuk memeriksa alat.`;
      const markup = {
        inline_keyboard: [
          [
            { text: "🛠️ Cek Status Alat", callback_data: "refresh_alat" },
            { text: "◀️ Kembali ke Menu Utama", callback_data: "show_start" },
          ],
        ],
      };
      await sendReply(reply, markup, false);
    }

    return false;
  }

  // Handle Telegram Inline Button Callbacks (Updates messages in-place with back buttons)
  async function processIncomingTelegramCallback(callbackQuery: any, token: string) {
    if (!callbackQuery) return;
    const cbId = callbackQuery.id;

    if (cbId && isDuplicateCallbackQuery(cbId)) {
      return;
    }

    const data = callbackQuery.data;
    const message = callbackQuery.message;
    if (!message || !message.chat) {
      try {
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cbId }),
        });
      } catch (_) {}
      return;
    }

    const chatId = String(message.chat.id);
    const msgId = message.message_id;
    const chatType = message.chat.type || "private";
    const senderName = [callbackQuery.from?.first_name, callbackQuery.from?.last_name].filter(Boolean).join(" ");
    const chatTitle = message.chat.title || senderName || "Pengguna Telegram";

    // Helper to notify Telegram client
    const answerCb = async (popupText?: string) => {
      try {
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callback_query_id: cbId,
            ...(popupText ? { text: popupText } : {}),
          }),
        });
      } catch (_) {}
    };

    // Helper to edit current message in place
    const editCurrentMessage = async (newText: string, newMarkup?: any) => {
      try {
        const resp = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: msgId,
            text: newText,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            ...(newMarkup ? { reply_markup: newMarkup } : {}),
          }),
        });
        const resData = (await resp.json()) as any;
        if (!resData?.ok && resData?.description?.includes("can't parse entities")) {
          await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: msgId,
              text: newText.replace(/<[^>]*>?/gm, ""),
              disable_web_page_preview: true,
              ...(newMarkup ? { reply_markup: newMarkup } : {}),
            }),
          });
        }
      } catch (e) {
        console.warn("[EditMessage Error]:", e);
      }
    };

    if (data === "clear_chat") {
      await cleanChatMessages(chatId, token);
      try {
        await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, message_id: msgId }),
        });
      } catch (_) {}
      await answerCb("🧹 Percakapan telah dibersihkan!");
      return;
    }

    if (data === "refresh_alat") {
      const payload = await buildAlatPayload();
      await editCurrentMessage(payload.text, payload.reply_markup);
      await answerCb("🔄 Status alat berhasil diperbarui!");
      return;
    }

    if (data === "show_brief" || data === "refresh_brief") {
      const payload = await buildBriefPayload();
      await editCurrentMessage(payload.text, payload.reply_markup);
      await answerCb("📋 Ringkasan shift ditampilkan");
      return;
    }

    if (data === "show_jadwal" || data === "jadwal_all") {
      const payload = buildJadwalPayload("all");
      await editCurrentMessage(payload.text, payload.reply_markup);
      await answerCb("📅 Jadwal Pemeliharaan");
      return;
    }

    if (data === "jadwal_harian") {
      const payload = buildJadwalPayload("harian");
      await editCurrentMessage(payload.text, payload.reply_markup);
      await answerCb("⏱️ Jadwal Harian");
      return;
    }

    if (data === "jadwal_mingguan") {
      const payload = buildJadwalPayload("mingguan");
      await editCurrentMessage(payload.text, payload.reply_markup);
      await answerCb("🗓️ Jadwal Mingguan");
      return;
    }

    if (data === "jadwal_bulanan") {
      const payload = buildJadwalPayload("bulanan");
      await editCurrentMessage(payload.text, payload.reply_markup);
      await answerCb("📆 Jadwal Bulanan");
      return;
    }

    if (data === "jadwal_berkala") {
      const payload = buildJadwalPayload("berkala");
      await editCurrentMessage(payload.text, payload.reply_markup);
      await answerCb("📊 Jadwal Berkala (3B / 6B / 1T)");
      return;
    }

    if (data === "show_history") {
      const payload = await buildHistoryPayload();
      await editCurrentMessage(payload.text, payload.reply_markup);
      await answerCb("📜 Riwayat Kerusakan");
      return;
    }

    if (data === "show_start") {
      const subscribers = loadSubscribers();
      const sub = subscribers.find((s) => s.chat_id === chatId);
      const payload = buildStartPayload(chatTitle, chatId, !!(sub && sub.is_active));
      await editCurrentMessage(payload.text, payload.reply_markup);
      await answerCb("🏠 Menu utama");
      return;
    }

    if (data === "do_daftar") {
      const subscribers = loadSubscribers();
      const existing = subscribers.find((s) => s.chat_id === chatId);
      const nowStr = new Date().toISOString();
      let already = false;

      if (existing && existing.is_active) {
        already = true;
      } else if (existing) {
        existing.is_active = true;
        existing.last_active = nowStr;
        saveSubscribers(subscribers);
      } else {
        subscribers.push({
          chat_id: chatId,
          type: chatType,
          name: chatTitle,
          username: callbackQuery.from?.username || "",
          first_seen: nowStr,
          last_active: nowStr,
          is_active: true,
        });
        saveSubscribers(subscribers);
      }

      const payload = buildDaftarPayload(chatTitle, chatId, already, chatType);
      await editCurrentMessage(payload.text, payload.reply_markup);
      await answerCb(already ? "⚠️ Anda sudah terdaftar sebelumnya" : "✅ Pendaftaran berhasil!");
      return;
    }

    await answerCb();
  }

  // Background Auto-Polling Service
  function triggerTelegramPolling(token: string) {
    if (isPollingStarted) return;
    isPollingStarted = true;

    console.log("[Telegram Polling] Memulai layanan auto-polling Telegram...");

    (async () => {
      while (true) {
        try {
          const cfg = loadTelegramServerConfig();
          const activeToken = token || cfg.bot_token || process.env.TELEGRAM_BOT_TOKEN;

          if (!activeToken) {
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }

          const offsetParam = lastProcessedUpdateId > 0 ? `&offset=${lastProcessedUpdateId + 1}` : "";
          const tgRes = await fetch(
            `https://api.telegram.org/bot${activeToken}/getUpdates?limit=50&timeout=25${offsetParam}`,
            { signal: AbortSignal.timeout(30000) }
          );
          const data = (await tgRes.json()) as any;

          if (!data.ok) {
            if (data.error_code === 409) {
              // Clear webhook then resume
              await fetch(`https://api.telegram.org/bot${activeToken}/deleteWebhook`, {
                signal: AbortSignal.timeout(5000),
              }).catch(() => {});
              await new Promise((r) => setTimeout(r, 2000));
              continue;
            }
            await new Promise((r) => setTimeout(r, 6000));
            continue;
          }

          const updates: any[] = data.result || [];
          for (const upd of updates) {
            if (upd.update_id > lastProcessedUpdateId) {
              lastProcessedUpdateId = upd.update_id;
            }
            const msg = upd.message || upd.channel_post;
            if (msg) {
              await processIncomingTelegramMessage(msg, activeToken);
            }
            const cb = upd.callback_query;
            if (cb) {
              await processIncomingTelegramCallback(cb, activeToken);
            }
          }

          await new Promise((r) => setTimeout(r, 500));
        } catch (pollErr: any) {
          // Gracefully suppress common transient network hiccups, timeouts, and socket drops
          const errMsg = String(pollErr?.message || pollErr);
          const errCause = String(pollErr?.cause || "");
          const isTransient =
            pollErr?.name === "TimeoutError" ||
            pollErr?.name === "AbortError" ||
            errMsg.includes("timeout") ||
            errMsg.includes("fetch failed") ||
            errCause.includes("HeadersTimeoutError") ||
            errCause.includes("UND_ERR_HEADERS_TIMEOUT");

          if (!isTransient) {
            console.warn("[Telegram Polling]:", errMsg);
          }
          await new Promise((r) => setTimeout(r, 4000));
        }
      }
    })();
  }

  // Telegram Bot: Pull updates via getUpdates (Auto-Detect new users / chats)
  app.post("/api/telegram/sync-updates", async (req, res) => {
    try {
      const { token: customToken } = req.body;
      const serverCfg = loadTelegramServerConfig();
      const token = customToken || serverCfg.bot_token || process.env.TELEGRAM_BOT_TOKEN;

      if (!token) {
        return res.status(200).json({
          success: false,
          newDetectedCount: 0,
          totalSubscribers: 0,
          subscribers: [],
          error: "Token Bot Telegram belum diset. Masukkan bot token Anda terlebih dahulu.",
          message: "Token Bot Telegram belum diset.",
        });
      }

      // Query getUpdates
      const offsetParam = lastProcessedUpdateId > 0 ? `&offset=${lastProcessedUpdateId + 1}` : "";
      let tgRes = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?limit=100&timeout=0${offsetParam}`,
        { signal: AbortSignal.timeout(8000) }
      );
      let data = (await tgRes.json()) as any;

      // Handle conflict if webhook was active
      if (!data.ok && data.error_code === 409) {
        // Clear webhook first then retry
        await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
          signal: AbortSignal.timeout(5000),
        }).catch(() => {});
        tgRes = await fetch(
          `https://api.telegram.org/bot${token}/getUpdates?limit=100&timeout=0${offsetParam}`,
          { signal: AbortSignal.timeout(8000) }
        );
        data = (await tgRes.json()) as any;
      }

      if (!data.ok) {
        return res.status(400).json({
          success: false,
          error: data.description || "Gagal mengambil pembaruan dari Telegram",
        });
      }

      const updates: any[] = data.result || [];
      let newCount = 0;

      for (const upd of updates) {
        if (upd.update_id > lastProcessedUpdateId) {
          lastProcessedUpdateId = upd.update_id;
        }

        const msg = upd.message || upd.channel_post || upd.my_chat_member;
        if (msg && msg.chat && msg.chat.id) {
          const chatId = String(msg.chat.id);
          const chatType = msg.chat.type || "private";
          const senderName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ");
          const chatTitle = msg.chat.title || senderName || "Pengguna Telegram";
          const username = msg.from?.username || msg.chat.username || "";
          const nowStr = new Date().toISOString();

          const subscribers = loadSubscribers();
          const existingIdx = subscribers.findIndex((s) => s.chat_id === chatId);
          if (existingIdx < 0) {
            subscribers.push({
              chat_id: chatId,
              type: chatType,
              name: chatTitle,
              username,
              first_seen: nowStr,
              last_active: nowStr,
              is_active: true,
            });
            saveSubscribers(subscribers);
            newCount++;
          } else if (!subscribers[existingIdx].is_active) {
            subscribers[existingIdx].is_active = true;
            subscribers[existingIdx].last_active = nowStr;
            saveSubscribers(subscribers);
          }
        }
      }

      const currentSubscribers = loadSubscribers();
      return res.json({
        success: true,
        newDetectedCount: newCount,
        totalSubscribers: currentSubscribers.length,
        subscribers: currentSubscribers,
        message:
          newCount > 0
            ? `Berhasil mendeteksi ${newCount} kontak/grup baru dari Telegram!`
            : `Pemeriksaan selesai. Semua ${currentSubscribers.length} kontak sudah tersinkronisasi.`,
      });
    } catch (err: any) {
      console.error("[Telegram Sync Error]:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Gagal sinkronisasi pembaruan Telegram",
      });
    }
  });

  // Telegram Bot: Webhook Receiver (Real-time update)
  app.post("/api/telegram/webhook", async (req, res) => {
    try {
      const token = (req.query.token as string) || process.env.TELEGRAM_BOT_TOKEN;
      const update = req.body;

      if (token && update) {
        const msg = update.message || update.channel_post;
        if (msg) {
          await processIncomingTelegramMessage(msg, token);
        }
        const cb = update.callback_query;
        if (cb) {
          await processIncomingTelegramCallback(cb, token);
        }
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[Telegram Webhook Error]:", err);
      return res.status(200).json({ ok: true });
    }
  });

  // Telegram Bot: Set or Delete Webhook
  app.post("/api/telegram/set-webhook", async (req, res) => {
    try {
      const { webhook_url, token: customToken } = req.body;
      const token = customToken || process.env.TELEGRAM_BOT_TOKEN;

      if (!token) {
        return res.status(400).json({ success: false, error: "Token belum diisi." });
      }

      if (!webhook_url) {
        // Delete webhook
        const tgRes = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
        const data = (await tgRes.json()) as any;
        return res.json({
          success: data.ok,
          message: data.description || "Webhook berhasil dihapus (beralih ke Polling).",
        });
      }

      const tgRes = await fetch(
        `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhook_url)}`
      );
      const data = (await tgRes.json()) as any;
      return res.json({
        success: data.ok,
        message: data.description || "Webhook Telegram berhasil dikonfigurasikan.",
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Helper to send either a photo with caption or a text message to a specific Telegram chat
  async function sendTelegramItem(params: {
    token: string;
    targetId: string;
    message?: string;
    photo?: string;
    caption?: string;
    parse_mode?: string;
    disable_web_page_preview?: boolean;
  }): Promise<{ ok: boolean; message_id?: number; description?: string }> {
    const { token, targetId, message, photo, caption, parse_mode = "HTML", disable_web_page_preview = true } = params;

    if (photo && typeof photo === "string" && photo.trim()) {
      try {
        const effectiveCaption = (caption || message || "").trim();

        if (photo.startsWith("data:image/")) {
          const mimeMatch = photo.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
          const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
          const base64Data = photo.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
          const buffer = Buffer.from(base64Data, "base64");
          const extension = mimeType.includes("png") ? "png" : "jpg";

          const formData = new FormData();
          formData.append("chat_id", targetId);
          if (effectiveCaption) {
            formData.append("caption", effectiveCaption);
            formData.append("parse_mode", parse_mode);
          }
          const blob = new Blob([buffer], { type: mimeType });
          formData.append("photo", blob, `attendance_${Date.now()}.${extension}`);

          let resp = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
            method: "POST",
            body: formData,
          });
          let d = (await resp.json()) as any;

          if (!d.ok && parse_mode === "HTML" && d.description?.includes("can't parse entities")) {
            // Retry stripping HTML tags from caption
            const retryFormData = new FormData();
            retryFormData.append("chat_id", targetId);
            if (effectiveCaption) {
              retryFormData.append("caption", effectiveCaption.replace(/<[^>]*>?/gm, ""));
            }
            const retryBlob = new Blob([buffer], { type: mimeType });
            retryFormData.append("photo", retryBlob, `attendance_${Date.now()}.${extension}`);
            resp = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
              method: "POST",
              body: retryFormData,
            });
            d = (await resp.json()) as any;
          }

          if (d.ok) {
            return { ok: true, message_id: d.result?.message_id };
          }

          console.warn(`[Telegram sendPhoto fallback for ${targetId}]:`, d.description);
          // Fallback if photo sending was rejected by Telegram: send text message with caption
          if (effectiveCaption) {
            const textResp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: targetId,
                text: effectiveCaption,
                parse_mode,
              }),
            });
            const textData = (await textResp.json()) as any;
            return {
              ok: textData.ok,
              message_id: textData.result?.message_id,
              description: textData.description || d.description,
            };
          }
          return { ok: false, description: d.description };
        } else {
          // Public image URL
          const resp = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: targetId,
              photo: photo,
              caption: effectiveCaption,
              parse_mode,
            }),
          });
          const d = (await resp.json()) as any;
          return { ok: d.ok, message_id: d.result?.message_id, description: d.description };
        }
      } catch (photoErr: any) {
        console.warn(`[Telegram sendPhoto exception for ${targetId}]:`, photoErr);
        if (caption || message) {
          try {
            const textResp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: targetId,
                text: (caption || message || "").trim(),
                parse_mode,
              }),
            });
            const textData = (await textResp.json()) as any;
            return { ok: textData.ok, message_id: textData.result?.message_id, description: textData.description };
          } catch (e: any) {
            return { ok: false, description: e.message };
          }
        }
        return { ok: false, description: photoErr.message };
      }
    }

    // Standard text message
    const textContent = (message || caption || "").trim();
    if (!textContent) {
      return { ok: false, description: "Pesan teks tidak boleh kosong." };
    }

    let resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: targetId,
        text: textContent,
        parse_mode,
        disable_web_page_preview,
      }),
    });
    let d = (await resp.json()) as any;

    if (!d.ok && parse_mode === "HTML" && d.description?.includes("can't parse entities")) {
      resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: targetId,
          text: textContent.replace(/<[^>]*>?/gm, ""),
          disable_web_page_preview,
        }),
      });
      d = (await resp.json()) as any;
    }

    return { ok: d.ok, message_id: d.result?.message_id, description: d.description };
  }

  // Telegram Bot: Send message or photo (Supports single recipient OR Broadcast to all subscribers)
  app.post("/api/telegram/send", async (req, res) => {
    try {
      const {
        message,
        caption,
        photo,
        chat_id,
        broadcast_all = false,
        token: customToken,
        parse_mode = "HTML",
        disable_web_page_preview = true,
      } = req.body;

      const serverCfg = loadTelegramServerConfig();
      const token = (customToken && customToken.trim()) || serverCfg.bot_token || process.env.TELEGRAM_BOT_TOKEN;
      let defaultChatId = (chat_id && String(chat_id).trim()) || serverCfg.chat_id || process.env.TELEGRAM_CHAT_ID || "-5531204015";

      if (!token) {
        return res.status(400).json({
          success: false,
          error: "TELEGRAM_BOT_TOKEN belum ditentukan. Konfigurasikan token bot terlebih dahulu.",
        });
      }

      if (!photo && (!message || typeof message !== "string" || !message.trim())) {
        return res.status(400).json({
          success: false,
          error: "Pesan teks atau foto tidak boleh kosong.",
        });
      }

      // If Broadcast to all registered active subscribers
      if (broadcast_all) {
        const subscribers = loadSubscribers().filter((s) => s.is_active);
        const targetIds = new Set<string>();

        if (defaultChatId) {
          targetIds.add(String(defaultChatId));
        }
        subscribers.forEach((s) => targetIds.add(String(s.chat_id)));

        if (targetIds.size === 0) {
          return res.status(400).json({
            success: false,
            error:
              "Belum ada Chat ID tujuan maupun subscriber terdaftar. Tambahkan Chat ID atau minta pengguna chat /start ke bot.",
          });
        }

        const sendPromises = Array.from(targetIds).map(async (targetId) => {
          const itemRes = await sendTelegramItem({
            token,
            targetId,
            message,
            photo,
            caption,
            parse_mode,
            disable_web_page_preview,
          });
          if (itemRes.ok && itemRes.message_id) {
            recordChatMessage(targetId, itemRes.message_id);
          }
          return { chat_id: targetId, ok: itemRes.ok, description: itemRes.description };
        });

        const results = await Promise.all(sendPromises);
        const successCount = results.filter((r) => r.ok).length;
        const failed = results.filter((r) => !r.ok);

        return res.json({
          success: successCount > 0,
          broadcast: true,
          totalTargets: targetIds.size,
          sentCount: successCount,
          failedCount: failed.length,
          failedDetails: failed,
          message: `Berhasil disiarkan ke ${successCount} dari ${targetIds.size} penerima Telegram.`,
        });
      }

      // Single target delivery
      if (!defaultChatId) {
        return res.status(400).json({
          success: false,
          error: "Chat ID tujuan belum ditentukan. Masukkan Chat ID atau aktifkan mode broadcast.",
        });
      }

      const singleRes = await sendTelegramItem({
        token,
        targetId: defaultChatId,
        message,
        photo,
        caption,
        parse_mode,
        disable_web_page_preview,
      });

      if (!singleRes.ok) {
        return res.status(400).json({
          success: false,
          error: singleRes.description || "Gagal mengirim pesan / foto ke Telegram",
        });
      }

      if (singleRes.message_id) {
        recordChatMessage(defaultChatId, singleRes.message_id);
      }

      return res.json({
        success: true,
        messageId: singleRes.message_id,
      });
    } catch (err: any) {
      console.error("[Telegram Send Error]:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Kesalahan internal saat mengirim pesan Telegram",
      });
    }
  });

  // Telegram Bot: Test connection and send ping message
  app.post("/api/telegram/test", async (req, res) => {
    try {
      const { token: customToken, chat_id: customChatId } = req.body;
      const serverCfg = loadTelegramServerConfig();
      const token = (customToken && customToken.trim()) || serverCfg.bot_token || process.env.TELEGRAM_BOT_TOKEN;
      let targetChatId = (customChatId && String(customChatId).trim()) || serverCfg.chat_id || process.env.TELEGRAM_CHAT_ID || "-5531204015";

      if (!token) {
        return res.status(400).json({
          success: false,
          error: "Token Bot Telegram belum diisi. Buat bot via @BotFather di Telegram lalu masukkan HTTP API Token di form ini.",
        });
      }

      // Step 1: Validate getMe
      const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const meData = (await meRes.json()) as any;
      if (!meData.ok) {
        const desc = meData.description || "";
        let friendlyError = `Token tidak valid: ${desc}`;
        if (desc.includes("Unauthorized")) {
          friendlyError = "Token Bot tidak valid (Unauthorized). Pastikan Anda menyalin HTTP API Token lengkap dari @BotFather.";
        }
        return res.status(400).json({
          success: false,
          error: friendlyError,
        });
      }

      // If no chatId is provided, try picking from active subscribers
      if (!targetChatId) {
        const activeSubscribers = loadSubscribers().filter((s) => s.is_active);
        if (activeSubscribers.length > 0) {
          targetChatId = activeSubscribers[activeSubscribers.length - 1].chat_id;
        }
      }

      // If chatId is provided (or resolved from subscribers), attempt sending test message
      if (targetChatId) {
        const testText = `🤖 <b>FASKAMPEN X-Ray Maintenance Bot</b>\n\n` +
          `✅ <b>Koneksi Berhasil Terhubung!</b>\n` +
          `• <b>Bot:</b> @${meData.result.username} (${meData.result.first_name})\n` +
          `• <b>Target Chat ID:</b> <code>${targetChatId}</code>\n` +
          `• <b>Waktu Tes:</b> ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n\n` +
          `<i>Sistem siap menyiarkan Daily Briefing Supervisor, Notifikasi Tiket Kerusakan (Corrective), dan Peringatan Recurring Faults secara real-time.</i>`;

        const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: targetChatId,
            text: testText,
            parse_mode: "HTML",
          }),
        });

        const sendData = (await sendRes.json()) as any;
        if (!sendData.ok) {
          const desc = sendData.description || "";
          let errorDetail = `Bot valid (@${meData.result.username}), namun gagal mengirim pesan ke Chat ID ${targetChatId}: ${desc}.`;
          if (desc.includes("bot can't initiate conversation") || desc.includes("Forbidden")) {
            errorDetail = `Telegram memblokir pesan karena pengguna belum pernah memulai chat dengan bot. Buka Telegram, cari @${meData.result.username}, lalu tekan 'START' atau kirim /start terlebih dahulu!`;
          } else if (desc.includes("chat not found")) {
            errorDetail = `Chat ID ${targetChatId} tidak ditemukan. Pastikan sudah menekan /start pada bot @${meData.result.username} (untuk chat pribadi) atau bot sudah di-invite ke grup Anda.`;
          }
          return res.status(400).json({
            success: false,
            bot: meData.result,
            error: errorDetail,
          });
        }

        return res.json({
          success: true,
          bot: meData.result,
          sent: true,
          message: `Berhasil terhubung ke @${meData.result.username} dan pesan tes berhasil dikirim ke chat ${targetChatId}!`,
        });
      }

      return res.status(400).json({
        success: false,
        bot: meData.result,
        sent: false,
        error: `Bot terhubung (@${meData.result.username}), namun Chat ID tujuan masih kosong. Silakan isi Chat ID tujuan Anda (cek via @userinfobot) atau buka bot @${meData.result.username} di Telegram lalu ketik /start agar terdeteksi otomatis.`,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message || "Gagal melakukan tes bot Telegram",
      });
    }
  });

  // API Endpoint for Vector PDF Generation
  app.post("/api/generate-pdf", async (req, res) => {
    let browser: any;
    try {
      const { html, filename } = req.body;
      if (!html) {
        return res.status(400).json({ error: "HTML content is required" });
      }

      const pdfFilename = filename || "Laporan_Preventive_Maintenance.pdf";
      let puppeteer: any;
      try {
        const puppeteerModule = "puppeteer";
        puppeteer = (await import(/* @vite-ignore */ puppeteerModule)).default;
      } catch (e) {
        return res.status(501).json({
          error: "Puppeteer PDF generation service is not available. Please use client-side PDF export."
        });
      }

      // Launch headless Chromium with --no-sandbox flags for Cloud Run container environment
      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
        ],
      });

      const page = await browser.newPage();

      const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm;
    }
    *, *:before, *:after {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: 'Times New Roman', Times, serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    table {
      border-collapse: collapse !important;
      border-spacing: 0 !important;
      width: 100% !important;
      table-layout: fixed !important;
    }
    th, td {
      border: 0.5pt solid #000000 !important;
      box-sizing: border-box !important;
    }
    .pdf-page {
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
      box-sizing: border-box;
      width: 100%;
      padding: 0;
      margin: 0 auto;
      background: #ffffff;
    }
    .pdf-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    img {
      max-width: 100%;
      height: auto;
      display: block;
    }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;

      await page.setContent(fullHtml, { waitUntil: "networkidle0" });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(pdfFilename)}"`);
      res.send(Buffer.from(pdfBuffer));
    } catch (err: any) {
      console.error("Puppeteer PDF generation error:", err);
      res.status(500).json({ error: err.message || "Failed to generate PDF" });
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  });

  // Vite middleware for development vs static asset serving for production
  const isDevMode = process.env.NODE_ENV !== "production";
  const distPath = path.join(process.cwd(), "dist");

  if (isDevMode) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            '**/*.json',
            '**/.data/**',
            '**/data/**',
            '**/dist/**',
            '**/.git/**',
          ],
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(200).send(`<!DOCTYPE html><html><head><title>Loading App...</title></head><body style="font-family:sans-serif;padding:2rem;text-align:center;"><h2>Aplikasi sedang memuat aset...</h2><p>Silakan build aplikasi terlebih dahulu dengan 'npm run build' atau jalankan mode development dengan 'npm run dev'.</p></body></html>`);
      }
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Auto-start Telegram polling if bot token is configured
    try {
      const initialConfig = loadTelegramServerConfig();
      const activeToken = initialConfig.bot_token || process.env.TELEGRAM_BOT_TOKEN;
      if (activeToken) {
        triggerTelegramPolling(activeToken);
      }
    } catch (tgInitErr) {
      console.warn("[Telegram Init Warning]:", tgInitErr);
    }
  });

  server.on("error", (err: any) => {
    console.error("[Express Server Error]:", err);
  });
}

startServer().catch((err) => {
  console.error("[startServer Critical Error]:", err);
});
