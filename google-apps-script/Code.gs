/**
 * GOOGLE APPS SCRIPT WEB APP FOR SYSTEM MAINTENANCE & INSPECTION REPORTING
 * PT NARARYA TEKNOLOGI INDONESIA (v0.5.0)
 *
 * Setup instructions:
 * 1. Open Google Sheets -> Extensions -> Apps Script.
 * 2. Paste this Code.gs content into the editor.
 * 3. Click "Deploy" -> "New deployment".
 * 4. Select type: "Web app".
 * 5. Set "Execute as": "Me".
 * 6. Set "Who has access": "Anyone".
 * 7. Click "Deploy" and authorize permissions.
 * 8. Copy the Web App URL (e.g., https://script.google.com/macros/s/.../exec).
 * 9. Set environment variable in your Vite project: VITE_GAS_API_URL="<WEB_APP_URL>"
 */

const PREVENTIVE_TAB = "Preventive_Records";
const CORRECTIVE_TAB = "Corrective_Records";
const APP_ROOT_FOLDER = "XRAY REPORTING APP";
const DRIVE_ROOT_FOLDER = "XRAY REPORTING APP/2. Foto Laporan";
const DRIVE_PDF_ROOT_FOLDER = "XRAY REPORTING APP/1. Laporan";

// Helper for cleaning file & folder names
function sanitizeFileName(str) {
  if (!str) return "";
  return String(str).replace(/[\\/:*?"<>|#%&{}]/g, "").replace(/\s+/g, " ").trim();
}

// Generate Standardized Filename: "Lokasi Equipment_JJMM_TTGGBBYY"
function generateDriveFileName(locationOrEquipment, timeStr, dateStr, index) {
  var sanitized = sanitizeFileName(locationOrEquipment) || "Equipment";

  var hhmm = "";
  if (timeStr) {
    var clean = String(timeStr).trim();
    if (clean.indexOf("T") !== -1) {
      try {
        var d = new Date(clean);
        if (!isNaN(d.getTime())) {
          hhmm = Utilities.formatDate(d, "Asia/Jakarta", "HHmm");
        }
      } catch (e) {
        clean = clean.split("T")[1] || "";
      }
    }
    if (!hhmm) {
      var digits = clean.replace(/\D/g, "");
      if (digits.length >= 4) {
        hhmm = digits.substring(0, 4);
      } else if (digits.length === 2) {
        hhmm = digits + "00";
      }
    }
  }
  if (!hhmm) {
    var now = new Date();
    try {
      hhmm = Utilities.formatDate(now, "Asia/Jakarta", "HHmm");
    } catch (e) {
      hhmm = ("0" + now.getHours()).slice(-2) + ("0" + now.getMinutes()).slice(-2);
    }
  }

  var ddmmyy = "";
  if (dateStr && dateStr.indexOf("-") !== -1) {
    var parts = dateStr.split("-");
    if (parts.length === 3) {
      ddmmyy = ("0" + parts[2]).slice(-2) + ("0" + parts[1]).slice(-2) + parts[0].substring(2);
    }
  }
  if (!ddmmyy) {
    var now = new Date();
    try {
      ddmmyy = Utilities.formatDate(now, "Asia/Jakarta", "ddMMyy");
    } catch (e) {
      ddmmyy = ("0" + now.getDate()).slice(-2) + ("0" + (now.getMonth() + 1)).slice(-2) + String(now.getFullYear()).substring(2);
    }
  }

  var sfx = (typeof index === "number" && index >= 0) ? ("_" + (index + 1)) : "";
  return sanitized + "_" + hhmm + "_" + ddmmyy + sfx + ".jpg";
}

// Build Preventive Folder Path: XRAY REPORTING APP/2. Foto Laporan/{CategoryFolder}/{YYYY}/{MM. NamaBulan YYYY}/{DD NamaBulan}/{Shift}/{Jenis Equipment} - {Lokasi Equipment}
function buildPreventiveFolderPath(record) {
  if (record && record.folder_path) {
    return record.folder_path;
  }

  var dateStr = record.operational_date || new Date().toISOString().split("T")[0];
  var dateParts = dateStr.split("-");
  var year = dateParts[0] || "2026";
  var monthNum = dateParts[1] || "01";
  var dayNum = dateParts[2] || "01";

  var monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  var mIdx = parseInt(monthNum, 10) - 1;
  var monthName = (mIdx >= 0 && mIdx < 12) ? monthNames[mIdx] : "Januari";

  var categoryFolder = "1. Foto Laporan Harian";
  var freq = String(record.checklist_frequency_name || "").toLowerCase();
  if (freq.indexOf("minggu") !== -1) categoryFolder = "2. Foto Laporan Mingguan";
  else if (freq.indexOf("bulan") !== -1) categoryFolder = "3. Foto Laporan Bulanan";
  else if (freq.indexOf("triwulan") !== -1) categoryFolder = "4. Foto Laporan Triwulan";
  else if (freq.indexOf("semester") !== -1) categoryFolder = "5. Foto Laporan Semesteran";
  else if (freq.indexOf("tahun") !== -1) categoryFolder = "6. Foto Laporan Tahunan";

  var monthFolder = monthNum + ". " + monthName + " " + year;
  var dayFolder = dayNum + " " + monthName;
  var shiftFolder = record.shift || "Pagi";

  var eqType = sanitizeFileName(record.equipment_type || "EQUIPMENT");
  var eqLoc = sanitizeFileName(record.location_name || record.equipment_name || record.equipment_code || "LOCATION");
  var eqLocFolder = eqType + " - " + eqLoc;

  return DRIVE_ROOT_FOLDER + "/" + categoryFolder + "/" + year + "/" + monthFolder + "/" + dayFolder + "/" + shiftFolder + "/" + eqLocFolder;
}

// Build Corrective Folder Path: XRAY REPORTING APP/2. Foto Laporan/1.1 Foto Laporan Corrective/{YYYY}/{MM. NamaBulan YYYY}/{DD NamaBulan}/{Shift}/{Jenis Equipment} - {Lokasi Equipment}
function buildCorrectiveFolderPath(record) {
  if (record && record.folder_path) {
    return record.folder_path;
  }

  var dateStr = record.corrective_date || record.operational_date || new Date().toISOString().split("T")[0];
  var dateParts = dateStr.split("-");
  var year = dateParts[0] || "2026";
  var monthNum = dateParts[1] || "01";
  var dayNum = dateParts[2] || "01";

  var monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  var mIdx = parseInt(monthNum, 10) - 1;
  var monthName = (mIdx >= 0 && mIdx < 12) ? monthNames[mIdx] : "Januari";

  var categoryFolder = "1.1 Foto Laporan Corrective";
  var monthFolder = monthNum + ". " + monthName + " " + year;
  var dayFolder = dayNum + " " + monthName;
  var shiftFolder = record.shift || "Pagi";

  var eqType = sanitizeFileName(record.equipment_type || "EQUIPMENT");
  var eqLoc = sanitizeFileName(record.location_name || record.equipment_name || "LOCATION");
  var eqLocFolder = eqType + " - " + eqLoc;

  return DRIVE_ROOT_FOLDER + "/" + categoryFolder + "/" + year + "/" + monthFolder + "/" + dayFolder + "/" + shiftFolder + "/" + eqLocFolder;
}

function doPost(e) {
  try {
    var contents = e.postData ? e.postData.contents : "";
    var payload = contents ? JSON.parse(contents) : {};
    var action = payload.action;

    var result = { success: false, message: "Unknown action" };

    if (action === "healthCheck" || action === "health_check") {
      result = {
        success: true,
        message: "Google Apps Script API is active",
        data: { timestamp: new Date().toISOString() }
      };
    } else if (action === "getDatasets" || action === "get_datasets") {
      result = getDatasets();
    } else if (action === "getPreventiveRecords" || action === "get_preventive_records" || action === "get_preventive") {
      result = getPreventiveRecords(payload.operationalDate || payload.operational_date, payload.shift, payload.datasetId || payload.dataset_id);
    } else if (action === "savePreventiveRecord" || action === "save_preventive_record" || action === "save_preventive") {
      result = savePreventiveRecord(payload.record || payload.data);
    } else if (action === "deletePreventiveRecord" || action === "delete_preventive_record" || action === "delete_preventive") {
      result = deletePreventiveRecord(payload.record || payload.data || payload);
    } else if (action === "getCorrectiveRecords" || action === "get_corrective_records" || action === "get_corrective") {
      result = getCorrectiveRecords(payload.operationalDate || payload.operational_date, payload.shift, payload.datasetId || payload.dataset_id);
    } else if (action === "saveCorrectiveRecord" || action === "save_corrective_record" || action === "save_corrective") {
      result = saveCorrectiveRecord(payload.record || payload.data);
    } else if (action === "deleteCorrectiveRecord" || action === "delete_corrective_record" || action === "delete_corrective") {
      result = deleteCorrectiveRecord(payload.record || payload.data || payload);
    } else if (action === "deleteFolder" || action === "delete_folder") {
      result = deleteFolderByPath(payload.folderPath || payload.folder_path);
    } else if (action === "deleteFile" || action === "delete_file") {
      result = deleteFileByIdOrUrl(payload.fileId || payload.file_id || payload.url);
    } else if (action === "uploadPhoto" || action === "upload_photo") {
      result = handlePhotoUpload(payload.base64Data || payload.base64_data, payload.folderPath || payload.folder_path, payload.fileName || payload.file_name, payload.photoType || payload.photo_type);
    } else if (action === "uploadPhotosBatch" || action === "upload_photos_batch") {
      result = handleBatchPhotoUpload(payload.photos || payload.items, payload.folderPath || payload.folder_path);
    } else if (action === "uploadPdf" || action === "upload_pdf") {
      result = handlePdfUpload(payload.base64Data || payload.base64_data, payload.folderPath || payload.folder_path, payload.fileName || payload.file_name, payload.metadata);
    } else {
      result = { success: false, message: "Invalid action: " + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: err.toString(),
      stack: err.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    message: "Google Apps Script Endpoint for PT Nararya NTI Reporting is active. Please use POST for API requests."
  })).setMimeType(ContentService.MimeType.JSON);
}

// Ensure Sheet Tabs Exist with Standardized Headers
function getOrCreateSheet(sheetName, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e2e8f0");
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

// Global in-memory cache for resolved Drive folders in the current execution
var FOLDER_CACHE = {};

function getFolderCacheKey(folderPath) {
  var raw = String(folderPath || DRIVE_ROOT_FOLDER).trim();
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw);
  return "fld_" + Utilities.base64EncodeWebSafe(digest).substring(0, 24);
}

// Drive Nested Folder Creator with In-Memory, Cross-Execution ScriptCache, and Thread-Safe Mutex Lock
function getOrCreateFolder(folderPath) {
  var t0 = Date.now();
  var targetPath = folderPath || DRIVE_ROOT_FOLDER;

  // 1. Check in-memory cache (Fastest: ~0ms)
  if (FOLDER_CACHE[targetPath]) {
    try {
      var memFolder = DriveApp.getFolderById(FOLDER_CACHE[targetPath]);
      if (memFolder && !memFolder.isTrashed()) {
        Logger.log("[UploadTiming] folder resolve (in-memory cache): " + (Date.now() - t0) + "ms for '" + targetPath + "'");
        return memFolder;
      }
    } catch (e) {
      delete FOLDER_CACHE[targetPath];
    }
  }

  // 2. Check ScriptCache (Cross-execution in GAS: ~30-50ms)
  var cacheKey = getFolderCacheKey(targetPath);
  try {
    var scriptCache = CacheService.getScriptCache();
    var cachedFolderId = scriptCache.get(cacheKey);
    if (cachedFolderId) {
      var cachedFolder = DriveApp.getFolderById(cachedFolderId);
      if (cachedFolder && !cachedFolder.isTrashed()) {
        FOLDER_CACHE[targetPath] = cachedFolderId;
        Logger.log("[UploadTiming] folder resolve (script cache): " + (Date.now() - t0) + "ms for '" + targetPath + "'");
        return cachedFolder;
      }
    }
  } catch (cacheErr) {
    Logger.log("Folder cache lookup warning: " + cacheErr);
  }

  // 3. Thread-safe traversal with LockService to prevent duplicate folder creation under concurrent uploads
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    hasLock = lock.tryLock(15000);
  } catch (lErr) {
    Logger.log("Lock acquisition warning: " + lErr);
  }

  try {
    // Re-check cache under lock in case another worker just resolved it
    if (hasLock) {
      try {
        var freshCache = CacheService.getScriptCache().get(cacheKey);
        if (freshCache) {
          var fld = DriveApp.getFolderById(freshCache);
          if (fld && !fld.isTrashed()) {
            FOLDER_CACHE[targetPath] = freshCache;
            return fld;
          }
        }
      } catch (fErr) {}
    }

    var parts = targetPath.split("/").filter(Boolean);
    var currentFolder = DriveApp.getRootFolder();
    for (var i = 0; i < parts.length; i++) {
      var folderName = parts[i];
      var folders = currentFolder.getFoldersByName(folderName);
      if (folders.hasNext()) {
        currentFolder = folders.next();
      } else {
        currentFolder = currentFolder.createFolder(folderName);
        currentFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      }
    }

    var resolvedId = currentFolder.getId();
    FOLDER_CACHE[targetPath] = resolvedId;
    try {
      CacheService.getScriptCache().put(cacheKey, resolvedId, 21600); // 6 hours expiration
    } catch (putErr) {
      Logger.log("Folder cache save warning: " + putErr);
    }

    Logger.log("[UploadTiming] folder resolve (full traversal): " + (Date.now() - t0) + "ms for '" + targetPath + "'");
    return currentFolder;
  } finally {
    if (hasLock) {
      try {
        lock.releaseLock();
      } catch (relErr) {}
    }
  }
}

// Upload base64 image to Google Drive with timing logs and folder caching
function saveImageToDrive(base64Data, folderPath, fileName) {
  if (!base64Data || typeof base64Data !== "string") return null;
  if (base64Data.indexOf("http://") === 0 || base64Data.indexOf("https://") === 0) {
    return { url: base64Data, drive_url: base64Data, isNew: false };
  }

  var tStart = Date.now();
  try {
    var matches = base64Data.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
    var contentType = "image/jpeg";
    var base64String = base64Data;

    if (matches && matches.length === 3) {
      contentType = matches[1];
      base64String = matches[2];
    } else if (base64Data.indexOf("base64,") !== -1) {
      base64String = base64Data.substring(base64Data.indexOf("base64,") + 7);
    }

    var bytes = Utilities.base64Decode(base64String);
    var blob = Utilities.newBlob(bytes, contentType, fileName || ("photo_" + Date.now() + ".jpg"));

    var tFolder0 = Date.now();
    var folder = getOrCreateFolder(folderPath);
    var folderDuration = Date.now() - tFolder0;

    var file;
    var isNew = true;
    var targetFileName = fileName || ("photo_" + Date.now() + ".jpg");

    // Check if a file with the exact same name already exists in target folder (Idempotency / Prevent Duplicates on network retry)
    var existingFiles = folder.getFilesByName(targetFileName);
    if (existingFiles.hasNext()) {
      file = existingFiles.next();
      isNew = false;
      // Clean up any remaining duplicate files with the same name
      while (existingFiles.hasNext()) {
        try {
          existingFiles.next().setTrashed(true);
        } catch (e) {}
      }
      Logger.log("[UploadTiming] photo '" + targetFileName + "' already exists, reusing fileId=" + file.getId());
    } else {
      var tCreate0 = Date.now();
      file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var createDuration = Date.now() - tCreate0;
    }

    var fileId = file.getId();
    var driveUrl = "https://lh3.googleusercontent.com/d/" + fileId;
    var folderUrl = folder.getUrl();
    var folderId = folder.getId();
    var totalDuration = Date.now() - tStart;

    Logger.log("[UploadTiming] photo upload (" + targetFileName + "): total=" + totalDuration + "ms (folder=" + folderDuration + "ms, isNew=" + isNew + ")");

    return {
      file_id: fileId,
      file_name: file.getName(),
      drive_url: driveUrl,
      download_url: file.getUrl(),
      url: driveUrl,
      folder_url: folderUrl,
      folder_id: folderId,
      isNew: isNew,
      duration_ms: totalDuration
    };
  } catch (err) {
    Logger.log("Error uploading image: " + err);
    return null;
  }
}

// Upload base64 PDF report to Google Drive with duplicate prevention (in-place update)
function savePdfToDrive(base64Data, folderPath, fileName) {
  if (!base64Data || typeof base64Data !== "string") return null;

  try {
    var base64String = base64Data;
    if (base64Data.indexOf("base64,") !== -1) {
      base64String = base64Data.substring(base64Data.indexOf("base64,") + 7);
    }

    var bytes = Utilities.base64Decode(base64String);
    var blob = Utilities.newBlob(bytes, "application/pdf", fileName || "laporan.pdf");

    var targetFolder = getOrCreateFolder(folderPath || (DRIVE_PDF_ROOT_FOLDER + "/1. Laporan Harian"));

    // Check for existing file with same name to prevent duplicates
    var existingFiles = targetFolder.getFilesByName(fileName);
    var file;

    if (existingFiles.hasNext()) {
      var oldFile = existingFiles.next();
      var oldFileId = oldFile.getId();

      var updatedViaDriveApi = false;
      try {
        if (typeof Drive !== "undefined" && Drive.Files && typeof Drive.Files.update === "function") {
          Drive.Files.update({ name: fileName, mimeType: "application/pdf" }, oldFileId, blob);
          file = DriveApp.getFileById(oldFileId);
          updatedViaDriveApi = true;
        }
      } catch (driveApiErr) {
        Logger.log("Advanced Drive Service update error: " + driveApiErr);
      }

      if (!updatedViaDriveApi) {
        file = targetFolder.createFile(blob);
        oldFile.setTrashed(true);
      }

      // Clean up any remaining duplicate files with the same name
      while (existingFiles.hasNext()) {
        var dup = existingFiles.next();
        dup.setTrashed(true);
      }
    } else {
      file = targetFolder.createFile(blob);
    }

    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var fileId = file.getId();
    var fileUrl = file.getUrl();

    return {
      file_id: fileId,
      file_name: file.getName(),
      drive_url: fileUrl,
      download_url: fileUrl,
      url: fileUrl,
      updated_at: new Date().toISOString()
    };
  } catch (err) {
    Logger.log("Error uploading PDF to Drive: " + err);
    return null;
  }
}

function handlePdfUpload(base64Data, folderPath, fileName, metadata) {
  if (!base64Data) {
    return { success: false, message: "Base64 data PDF tidak ditemukan" };
  }
  var uploaded = savePdfToDrive(base64Data, folderPath, fileName);
  if (uploaded) {
    return {
      success: true,
      message: "PDF berhasil disimpan/diperbarui di Google Drive",
      data: uploaded
    };
  } else {
    return { success: false, message: "Gagal menyimpan PDF ke Google Drive" };
  }
}

// DATASET & WORKSPACE MANAGEMENT
function ensureDatasetColumnExists(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length === 0) return;
  var headers = data[0];
  if (headers.indexOf("dataset_id") === -1) {
    sheet.insertColumnAfter(1); // Insert dataset_id as column 2
    sheet.getRange(1, 2).setValue("dataset_id").setFontWeight("bold").setBackground("#e2e8f0");
  }
}

function getDatasets() {
  var datasetsMap = {};
  datasetsMap["default"] = {
    id: "default",
    name: "Default (Data Existing)",
    preventive_count: 0,
    corrective_count: 0,
    last_updated: ""
  };

  // Scan Preventive Records
  var prevSheet = getPreventiveSheet();
  var prevData = prevSheet.getDataRange().getValues();
  if (prevData.length > 1) {
    var pHeaders = prevData[0];
    var pDsIdx = pHeaders.indexOf("dataset_id");
    var pUpdatedIdx = pHeaders.indexOf("updated_at");

    for (var i = 1; i < prevData.length; i++) {
      var row = prevData[i];
      if (!row[0]) continue;
      var dsId = pDsIdx !== -1 ? (String(row[pDsIdx] || "").trim() || "default") : "default";
      var updatedAt = pUpdatedIdx !== -1 ? String(row[pUpdatedIdx] || "") : "";

      if (!datasetsMap[dsId]) {
        datasetsMap[dsId] = {
          id: dsId,
          name: dsId,
          preventive_count: 0,
          corrective_count: 0,
          last_updated: ""
        };
      }
      datasetsMap[dsId].preventive_count++;
      if (updatedAt && (!datasetsMap[dsId].last_updated || updatedAt > datasetsMap[dsId].last_updated)) {
        datasetsMap[dsId].last_updated = updatedAt;
      }
    }
  }

  // Scan Corrective Records
  var corrSheet = getCorrectiveSheet();
  var corrData = corrSheet.getDataRange().getValues();
  if (corrData.length > 1) {
    var cHeaders = corrData[0];
    var cDsIdx = cHeaders.indexOf("dataset_id");
    var cUpdatedIdx = cHeaders.indexOf("updated_at");

    for (var j = 1; j < corrData.length; j++) {
      var cRow = corrData[j];
      if (!cRow[0]) continue;
      var cDsId = cDsIdx !== -1 ? (String(cRow[cDsIdx] || "").trim() || "default") : "default";
      var cUpdatedAt = cUpdatedIdx !== -1 ? String(cRow[cUpdatedIdx] || "") : "";

      if (!datasetsMap[cDsId]) {
        datasetsMap[cDsId] = {
          id: cDsId,
          name: cDsId,
          preventive_count: 0,
          corrective_count: 0,
          last_updated: ""
        };
      }
      datasetsMap[cDsId].corrective_count++;
      if (cUpdatedAt && (!datasetsMap[cDsId].last_updated || cUpdatedAt > datasetsMap[cDsId].last_updated)) {
        datasetsMap[cDsId].last_updated = cUpdatedAt;
      }
    }
  }

  var datasetsList = [];
  for (var key in datasetsMap) {
    datasetsList.push(datasetsMap[key]);
  }

  return { success: true, data: datasetsList };
}

// PREVENTIVE RECORDS
function getPreventiveSheet() {
  var headers = [
    "record_id", "dataset_id", "equipment_id", "equipment_code", "equipment_name", "equipment_type",
    "checklist_frequency_id", "period_key", "operational_date", "shift",
    "preventive_session_id", "sequence", "submitted_at", "submitted_by_technician_ids",
    "status", "notes", "checklist_results", "measurements", "evidences", "created_at", "updated_at"
  ];
  return getOrCreateSheet(PREVENTIVE_TAB, headers);
}

function getPreventiveRecords(operationalDate, shift, targetDatasetId) {
  var sheet = getPreventiveSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { success: true, data: [] };
  }

  var headers = data[0];
  var records = [];
  var activeDs = (targetDatasetId && String(targetDatasetId).trim()) ? String(targetDatasetId).trim() : "default";
  var dsColIdx = headers.indexOf("dataset_id");

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;

    var rowDsId = dsColIdx !== -1 ? (String(row[dsColIdx] || "").trim() || "default") : "default";
    if (rowDsId !== activeDs) continue;

    var recOpDate = String(row[headers.indexOf("operational_date")] || "");
    var recShift = String(row[headers.indexOf("shift")] || "");

    if (operationalDate && recOpDate !== operationalDate) continue;
    if (shift && recShift !== shift) continue;

    try {
      var record = {
        id: Number(row[headers.indexOf("record_id")]),
        dataset_id: rowDsId,
        equipment_id: Number(row[headers.indexOf("equipment_id")]),
        checklist_frequency_id: Number(row[headers.indexOf("checklist_frequency_id")]),
        period_key: String(row[headers.indexOf("period_key")]),
        operational_date: recOpDate,
        shift: recShift,
        preventive_session_id: Number(row[headers.indexOf("preventive_session_id")] || 1),
        sequence: Number(row[headers.indexOf("sequence")] || 1),
        submitted_at: String(row[headers.indexOf("submitted_at")] || ""),
        submitted_by_technician_ids: JSON.parse(row[headers.indexOf("submitted_by_technician_ids")] || "[]"),
        status: String(row[headers.indexOf("status")] || "OK"),
        notes: String(row[headers.indexOf("notes")] || ""),
        checklist_results: JSON.parse(row[headers.indexOf("checklist_results")] || "[]"),
        measurements: JSON.parse(row[headers.indexOf("measurements")] || "[]"),
        evidences: JSON.parse(row[headers.indexOf("evidences")] || "[]"),
        created_at: String(row[headers.indexOf("created_at")] || ""),
        updated_at: String(row[headers.indexOf("updated_at")] || "")
      };
      records.push(record);
    } catch (e) {
      Logger.log("Row parse error at row " + i + ": " + e);
    }
  }

  return { success: true, data: records };
}

function savePreventiveRecord(record) {
  if (!record || record.equipment_id === undefined || record.equipment_id === null || record.checklist_frequency_id === undefined || record.checklist_frequency_id === null) {
    return { success: false, message: "Invalid preventive record payload: missing equipment_id or checklist_frequency_id" };
  }

  var targetDsId = (record.dataset_id && String(record.dataset_id).trim()) ? String(record.dataset_id).trim() : "default";
  record.dataset_id = targetDsId;

  var folderPath = buildPreventiveFolderPath(record);
  var locationOrEqLabel = record.location_name || record.equipment_name || record.equipment_code || "Equipment";

  var processedEvidences = [];
  if (record.evidences && Array.isArray(record.evidences)) {
    for (var i = 0; i < record.evidences.length; i++) {
      try {
        var ev = record.evidences[i];
        var fName = generateDriveFileName(locationOrEqLabel, record.submitted_at, record.operational_date, i);

        if (typeof ev === "string") {
          if (ev.indexOf("http") === 0) {
            processedEvidences.push({ id: i + 1, file_path: ev, caption: "" });
          } else if (ev.indexOf("data:image/") === 0) {
            var uploaded = saveImageToDrive(ev, folderPath, fName);
            processedEvidences.push({
              id: i + 1,
              file_path: uploaded ? uploaded.drive_url : ev,
              caption: "",
              drive_url: uploaded ? uploaded.drive_url : ""
            });
          } else {
            processedEvidences.push({ id: i + 1, file_path: ev, caption: "" });
          }
        } else if (ev && typeof ev === "object") {
          var path = ev.file_path || ev.url || "";
          if (path && path.indexOf("data:image/") === 0) {
            var uploaded = saveImageToDrive(path, folderPath, fName);
            processedEvidences.push({
              ...ev,
              file_path: uploaded ? uploaded.drive_url : path,
              drive_url: uploaded ? uploaded.drive_url : (ev.drive_url || "")
            });
          } else {
            processedEvidences.push(ev);
          }
        } else {
          processedEvidences.push(ev);
        }
      } catch (evErr) {
        Logger.log("Error processing evidence " + i + ": " + evErr);
        processedEvidences.push(record.evidences[i]);
      }
    }
  }

  var now = new Date().toISOString();
  record.evidences = processedEvidences;
  record.updated_at = now;
  if (!record.created_at) record.created_at = now;
  if (!record.id) record.id = Date.now();

  var reqId = record.id ? Number(record.id) : null;
  var eqId = Number(record.equipment_id);
  var freqId = Number(record.checklist_frequency_id);
  var periodKey = String(record.period_key || "").trim();
  var shiftCode = normalizeShiftCode(record.shift);

  // SERVER-SIDE CONCURRENCY PROTECTION VIA SCRIPT LOCK
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    Logger.log("Preventive lock timeout: " + lockErr);
    return {
      success: false,
      message: "Server is busy processing another request. Please retry in a few seconds."
    };
  }

  try {
    var sheet = getPreventiveSheet();
    ensureDatasetColumnExists(sheet);

    var data = sheet.getDataRange().getValues();
    var headers = data[0];

    var dsColIdx = headers.indexOf("dataset_id");
    var recordIdColIdx = headers.indexOf("record_id");

    // Deterministic matching:
    // 1. Check exact record_id match
    // 2. Fallback to canonical tuple match: (dataset_id, equipment_id, checklist_frequency_id, period_key, shift)
    var existingRowIndex = -1;
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var rowRecordId = recordIdColIdx !== -1 ? Number(row[recordIdColIdx]) : Number(row[0]);
      var rEq = Number(row[headers.indexOf("equipment_id")]);
      var rFreq = Number(row[headers.indexOf("checklist_frequency_id")]);
      var rPeriod = String(row[headers.indexOf("period_key")] || "").trim();
      var rShift = normalizeShiftCode(row[headers.indexOf("shift")]);
      var rDs = dsColIdx !== -1 ? (String(row[dsColIdx] || "").trim() || "default") : "default";

      if (rDs !== targetDsId) continue;

      if (reqId && rowRecordId && reqId === rowRecordId) {
        existingRowIndex = r + 1;
        break;
      }

      if (rEq === eqId && rFreq === freqId && rPeriod === periodKey && rShift === shiftCode) {
        existingRowIndex = r + 1;
        break;
      }
    }

    // OPTIMISTIC CONCURRENCY PROTECTION (updated_at)
    var updatedColIdx = headers.indexOf("updated_at");
    if (existingRowIndex > 0 && record.expected_updated_at && updatedColIdx !== -1) {
      var currentDbUpdatedAt = String(data[existingRowIndex - 1][updatedColIdx] || "");
      if (currentDbUpdatedAt && record.expected_updated_at !== currentDbUpdatedAt) {
        return {
          success: false,
          conflict: true,
          code: "CONFLICT",
          message: "Konflik data: Laporan telah diperbarui oleh pengguna/perangkat lain (Waktu terbaru: " + currentDbUpdatedAt + "). Silakan refresh data untuk melihat versi terkini.",
          current_updated_at: currentDbUpdatedAt
        };
      }
    }

    var rowValues = [
      record.id,
      record.dataset_id,
      record.equipment_id,
      record.equipment_code || "",
      record.equipment_name || "",
      record.equipment_type || "",
      record.checklist_frequency_id,
      record.period_key || "",
      record.operational_date || "",
      record.shift || "",
      record.preventive_session_id || 1,
      record.sequence || 1,
      record.submitted_at || "",
      JSON.stringify(record.submitted_by_technician_ids || []),
      record.status || "OK",
      record.notes || "",
      JSON.stringify(record.checklist_results || []),
      JSON.stringify(record.measurements || []),
      JSON.stringify(record.evidences || []),
      record.created_at,
      record.updated_at
    ];

    if (existingRowIndex > 0) {
      sheet.getRange(existingRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }

    SpreadsheetApp.flush();

    return {
      success: true,
      message: existingRowIndex > 0 ? "Preventive record updated successfully" : "Preventive record created successfully",
      data: record
    };
  } finally {
    try {
      lock.releaseLock();
    } catch (relErr) {
      Logger.log("Error releasing preventive script lock: " + relErr);
    }
  }
}

function normalizeShiftCode(shiftStr) {
  if (!shiftStr) return "PS";
  var sUpper = String(shiftStr).toUpperCase().trim();
  if (sUpper.indexOf("MALAM") !== -1 || sUpper === "M") {
    return "M";
  } else if (sUpper.indexOf("PAGI") !== -1 || sUpper === "PS") {
    return "PS";
  }
  return sUpper;
}

// Helper to extract file ID from URL or raw ID
function extractFileId(fileIdOrUrl) {
  if (!fileIdOrUrl || typeof fileIdOrUrl !== "string") return null;
  var str = fileIdOrUrl.trim();
  if (str.indexOf("lh3.googleusercontent.com/d/") !== -1) {
    return str.split("lh3.googleusercontent.com/d/")[1].split("/")[0].split("?")[0];
  }
  if (str.indexOf("drive.google.com/file/d/") !== -1) {
    return str.split("drive.google.com/file/d/")[1].split("/")[0].split("?")[0];
  }
  if (str.indexOf("id=") !== -1) {
    var match = str.match(/id=([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
  }
  if (str.indexOf("http") !== 0 && str.length >= 10 && str.indexOf("/") === -1) {
    return str;
  }
  return null;
}

// Delete / Trash a single file by ID or URL
function deleteFileByIdOrUrl(fileIdOrUrl) {
  var fileId = extractFileId(fileIdOrUrl);
  if (!fileId) return { success: false, message: "File ID tidak ditemukan" };
  try {
    var file = DriveApp.getFileById(fileId);
    if (file) {
      file.setTrashed(true);
      return { success: true, message: "File berhasil dihapus dari Google Drive" };
    }
    return { success: false, message: "File tidak ditemukan" };
  } catch (err) {
    Logger.log("Delete file warning: " + err);
    return { success: false, message: err.toString() };
  }
}

// Delete / Trash a folder by relative path
function deleteFolderByPath(folderPath) {
  if (!folderPath || typeof folderPath !== "string") {
    return { success: false, message: "Folder path tidak valid" };
  }
  try {
    var targetPath = folderPath.trim();
    var parts = targetPath.split("/").filter(Boolean);
    if (parts.length === 0) {
      return { success: false, message: "Path root tidak boleh dihapus" };
    }

    var currentFolder = DriveApp.getRootFolder();
    for (var i = 0; i < parts.length; i++) {
      var folderName = parts[i];
      var folders = currentFolder.getFoldersByName(folderName);
      if (folders.hasNext()) {
        currentFolder = folders.next();
      } else {
        return { success: true, message: "Folder tidak ditemukan atau sudah dihapus" };
      }
    }

    // Move folder to Trash
    currentFolder.setTrashed(true);

    // Invalidate cache
    var cacheKey = getFolderCacheKey(targetPath);
    try {
      CacheService.getScriptCache().remove(cacheKey);
    } catch (cErr) {}
    delete FOLDER_CACHE[targetPath];

    return { success: true, message: "Folder '" + targetPath + "' berhasil dihapus dari Google Drive" };
  } catch (err) {
    Logger.log("Delete folder error: " + err);
    return { success: false, message: err.toString() };
  }
}

// Delete Preventive Record from Sheet and Trash its Google Drive folder/files
function deletePreventiveRecord(payload) {
  if (!payload) {
    return { success: false, message: "Payload delete preventif kosong" };
  }

  var record = payload.record || payload.data || payload;
  var targetDsId = (record.dataset_id && String(record.dataset_id).trim()) ? String(record.dataset_id).trim() : "default";
  var reqId = record.id ? Number(record.id) : null;
  var eqId = (record.equipment_id !== undefined && record.equipment_id !== null) ? Number(record.equipment_id) : null;
  var freqId = (record.checklist_frequency_id !== undefined && record.checklist_frequency_id !== null) ? Number(record.checklist_frequency_id) : null;
  var periodKey = String(record.period_key || "").trim();
  var shiftCode = normalizeShiftCode(record.shift);

  var deletedRowCount = 0;

  // 1. Delete matching row from Google Sheet
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    Logger.log("Delete lock timeout: " + lockErr);
  }

  try {
    var sheet = getPreventiveSheet();
    ensureDatasetColumnExists(sheet);
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var dsColIdx = headers.indexOf("dataset_id");
    var recordIdColIdx = headers.indexOf("record_id");
    var eqColIdx = headers.indexOf("equipment_id");
    var freqColIdx = headers.indexOf("checklist_frequency_id");
    var periodColIdx = headers.indexOf("period_key");
    var shiftColIdx = headers.indexOf("shift");

    var rowsToDelete = [];
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var rowDs = dsColIdx !== -1 ? (String(row[dsColIdx] || "").trim() || "default") : "default";
      if (rowDs !== targetDsId) continue;

      var rowRecordId = recordIdColIdx !== -1 ? Number(row[recordIdColIdx]) : Number(row[0]);
      var rEq = eqColIdx !== -1 ? Number(row[eqColIdx]) : null;
      var rFreq = freqColIdx !== -1 ? Number(row[freqColIdx]) : null;
      var rPeriod = periodColIdx !== -1 ? String(row[periodColIdx] || "").trim() : "";
      var rShift = shiftColIdx !== -1 ? normalizeShiftCode(row[shiftColIdx]) : "";

      var isMatch = false;
      if (reqId && rowRecordId === reqId) {
        isMatch = true;
      } else if (eqId !== null && freqId !== null && rEq === eqId && rFreq === freqId && rPeriod === periodKey && rShift === shiftCode) {
        isMatch = true;
      }

      if (isMatch) {
        rowsToDelete.push(r + 1);
      }
    }

    for (var d = rowsToDelete.length - 1; d >= 0; d--) {
      sheet.deleteRow(rowsToDelete[d]);
      deletedRowCount++;
    }
  } catch (sheetErr) {
    Logger.log("Error deleting row in Google Sheet: " + sheetErr);
  } finally {
    try {
      lock.releaseLock();
    } catch (relErr) {}
  }

  // 2. Delete / Trash folder in Google Drive
  var folderPath = record.folder_path || payload.folder_path || (eqId ? buildPreventiveFolderPath(record) : null);
  var folderDeleted = false;
  if (folderPath) {
    // If folder path points to subfolder e.g. ".../XRAY SCP LINE E/Foto Preventif"
    // We want to delete the whole equipment folder ".../XRAY SCP LINE E" so both Foto Preventif and Foto Kolase are removed
    var cleanEquipmentFolder = folderPath.replace(/\/(Foto Preventif|Foto Kolase)$/i, "");
    var delRes = deleteFolderByPath(cleanEquipmentFolder);
    if (!delRes.success) {
      deleteFolderByPath(folderPath);
    }
    folderDeleted = true;
  }

  // 3. Delete individual evidence files if any remaining
  if (record.evidences && Array.isArray(record.evidences)) {
    for (var i = 0; i < record.evidences.length; i++) {
      var ev = record.evidences[i];
      var pathOrUrl = typeof ev === "string" ? ev : (ev.file_path || ev.drive_url || ev.url || ev.file_id);
      if (pathOrUrl) {
        deleteFileByIdOrUrl(pathOrUrl);
      }
    }
  }

  return {
    success: true,
    message: "Data preventif (" + deletedRowCount + " baris) dan folder foto Google Drive berhasil dihapus.",
    data: {
      deleted_rows: deletedRowCount,
      folder_path: folderPath,
      folder_deleted: folderDeleted
    }
  };
}

// Delete Corrective Record from Sheet and Trash its Google Drive folder/files
function deleteCorrectiveRecord(payload) {
  if (!payload) {
    return { success: false, message: "Payload delete corrective kosong" };
  }

  var record = payload.record || payload.data || payload;
  var targetDsId = (record.dataset_id && String(record.dataset_id).trim()) ? String(record.dataset_id).trim() : "default";
  var eventId = record.event_id || record.id || payload.event_id || payload.id;

  var deletedRowCount = 0;

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    Logger.log("Corrective delete lock timeout: " + lockErr);
  }

  try {
    var sheet = getCorrectiveSheet();
    ensureDatasetColumnExists(sheet);
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var dsColIdx = headers.indexOf("dataset_id");
    var eventIdColIdx = headers.indexOf("event_id");

    var rowsToDelete = [];
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var rowDs = dsColIdx !== -1 ? (String(row[dsColIdx] || "").trim() || "default") : "default";
      if (rowDs !== targetDsId) continue;

      var rowEventId = eventIdColIdx !== -1 ? String(row[eventIdColIdx] || "") : String(row[0]);
      if (eventId && String(rowEventId) === String(eventId)) {
        rowsToDelete.push(r + 1);
      }
    }

    for (var d = rowsToDelete.length - 1; d >= 0; d--) {
      sheet.deleteRow(rowsToDelete[d]);
      deletedRowCount++;
    }
  } catch (sheetErr) {
    Logger.log("Error deleting corrective row in Google Sheet: " + sheetErr);
  } finally {
    try {
      lock.releaseLock();
    } catch (relErr) {}
  }

  // Delete folder
  var folderPath = record.folder_path || payload.folder_path || (record.equipment_name ? buildCorrectiveFolderPath(record) : null);
  if (folderPath) {
    var cleanEqFolder = folderPath.replace(/\/(Foto Preventif|Foto Kolase)$/i, "");
    deleteFolderByPath(cleanEqFolder);
  }

  // Delete evidence files
  if (record.evidences && Array.isArray(record.evidences)) {
    for (var i = 0; i < record.evidences.length; i++) {
      var ev = record.evidences[i];
      var pathOrUrl = typeof ev === "string" ? ev : (ev.file_path || ev.drive_url || ev.url || ev.file_id);
      if (pathOrUrl) {
        deleteFileByIdOrUrl(pathOrUrl);
      }
    }
  }

  return {
    success: true,
    message: "Data corrective (" + deletedRowCount + " baris) dan folder foto Google Drive berhasil dihapus."
  };
}

/**
 * SAFE MANUAL CLEANUP FUNCTION FOR DUPLICATE PREVENTIVE RECORDS
 * Can be run manually from Google Apps Script Editor or triggered via API action 'deduplicate_preventive'.
 * Scans Preventive_Records, groups by dataset_id + equipment_id + checklist_frequency_id + period_key + shift,
 * keeps the newest row per group, and deletes older duplicates.
 */
function deduplicatePreventiveRecords() {
  var sheet = getPreventiveSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return {
      success: true,
      message: "No data rows to deduplicate",
      summary: { rows_scanned: 0, duplicate_groups_found: 0, rows_removed: 0, rows_retained: 0 }
    };
  }

  var headers = data[0];
  var dsColIdx = headers.indexOf("dataset_id");
  var eqColIdx = headers.indexOf("equipment_id");
  var freqColIdx = headers.indexOf("checklist_frequency_id");
  var periodColIdx = headers.indexOf("period_key");
  var shiftColIdx = headers.indexOf("shift");
  var updatedColIdx = headers.indexOf("updated_at");
  var submittedColIdx = headers.indexOf("submitted_at");

  var groups = {};
  var totalScanned = data.length - 1;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[eqColIdx]) continue;

    var rDs = dsColIdx !== -1 ? (String(row[dsColIdx] || "").trim() || "default") : "default";
    var rEq = Number(row[eqColIdx]);
    var rFreq = Number(row[freqColIdx]);
    var rPeriod = String(row[periodColIdx] || "").trim();
    var rShift = normalizeShiftCode(row[shiftColIdx]);

    var key = rDs + "|" + rEq + "|" + rFreq + "|" + rPeriod + "|" + rShift;

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push({
      rowIndex: i + 1,
      rowData: row,
      updatedAt: String(row[updatedColIdx] || row[submittedColIdx] || "")
    });
  }

  var duplicateGroupsCount = 0;
  var rowsToRemove = [];
  var rowsRetainedCount = 0;

  for (var k in groups) {
    var items = groups[k];
    if (items.length > 1) {
      duplicateGroupsCount++;
      items.sort(function(a, b) {
        if (a.updatedAt && b.updatedAt && a.updatedAt !== b.updatedAt) {
          return b.updatedAt.localeCompare(a.updatedAt);
        }
        return b.rowIndex - a.rowIndex;
      });

      rowsRetainedCount++;
      for (var j = 1; j < items.length; j++) {
        rowsToRemove.push(items[j].rowIndex);
      }
    } else {
      rowsRetainedCount++;
    }
  }

  // Delete from bottom to top to avoid shifting row numbers
  rowsToRemove.sort(function(a, b) { return b - a; });

  for (var d = 0; d < rowsToRemove.length; d++) {
    sheet.deleteRow(rowsToRemove[d]);
  }

  var summary = {
    rows_scanned: totalScanned,
    duplicate_groups_found: duplicateGroupsCount,
    rows_removed: rowsToRemove.length,
    rows_retained: rowsRetainedCount
  };

  Logger.log("Deduplication summary: " + JSON.stringify(summary));

  return {
    success: true,
    message: "Deduplication of Preventive_Records complete. Removed " + rowsToRemove.length + " duplicate rows.",
    summary: summary
  };
}

// CORRECTIVE RECORDS
function getCorrectiveSheet() {
  var headers = [
    "record_id", "dataset_id", "corrective_code", "operational_date", "shift",
    "equipment_id", "equipment_name", "equipment_type", "location_id",
    "problem_description", "action_taken", "result", "result_text",
    "start_time", "end_time", "technicians", "created_by", "notes",
    "evidences", "created_at", "updated_at"
  ];
  return getOrCreateSheet(CORRECTIVE_TAB, headers);
}

function getCorrectiveRecords(operationalDate, shift, targetDatasetId) {
  var sheet = getCorrectiveSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { success: true, data: [] };
  }

  var headers = data[0];
  var records = [];
  var activeDs = (targetDatasetId && String(targetDatasetId).trim()) ? String(targetDatasetId).trim() : "default";
  var dsColIdx = headers.indexOf("dataset_id");

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;

    var rowDsId = dsColIdx !== -1 ? (String(row[dsColIdx] || "").trim() || "default") : "default";
    if (rowDsId !== activeDs) continue;

    var recOpDate = String(row[headers.indexOf("operational_date")] || "");
    var recShift = String(row[headers.indexOf("shift")] || "");

    if (operationalDate && recOpDate !== operationalDate) continue;
    if (shift && recShift !== shift) continue;

    try {
      var record = {
        id: Number(row[headers.indexOf("record_id")]),
        dataset_id: rowDsId,
        corrective_code: String(row[headers.indexOf("corrective_code")] || ""),
        corrective_date: recOpDate,
        shift: recShift,
        equipment_id: Number(row[headers.indexOf("equipment_id")]),
        location_id: Number(row[headers.indexOf("location_id")]),
        problem_description: String(row[headers.indexOf("problem_description")] || ""),
        action_taken: String(row[headers.indexOf("action_taken")] || ""),
        result: String(row[headers.indexOf("result")] || "Resolved"),
        result_text: String(row[headers.indexOf("result_text")] || ""),
        start_time: String(row[headers.indexOf("start_time")] || ""),
        end_time: String(row[headers.indexOf("end_time")] || ""),
        technicians: JSON.parse(row[headers.indexOf("technicians")] || "[]"),
        created_by: String(row[headers.indexOf("created_by")] || ""),
        notes: String(row[headers.indexOf("notes")] || ""),
        evidences: JSON.parse(row[headers.indexOf("evidences")] || "[]"),
        created_at: String(row[headers.indexOf("created_at")] || ""),
        updated_at: String(row[headers.indexOf("updated_at")] || "")
      };
      records.push(record);
    } catch (e) {
      Logger.log("Corrective parse error: " + e);
    }
  }

  return { success: true, data: records };
}

function saveCorrectiveRecord(record) {
  if (!record) {
    return { success: false, message: "Invalid corrective payload" };
  }

  var targetDsId = (record.dataset_id && String(record.dataset_id).trim()) ? String(record.dataset_id).trim() : "default";
  record.dataset_id = targetDsId;

  var folderPath = buildCorrectiveFolderPath(record);
  var locationOrEqLabel = record.location_name || record.equipment_name || "Equipment";

  var processedEvidences = [];
  if (record.evidences && Array.isArray(record.evidences)) {
    for (var i = 0; i < record.evidences.length; i++) {
      try {
        var ev = record.evidences[i];
        var fName = generateDriveFileName(locationOrEqLabel, record.start_time, record.corrective_date || record.operational_date, i);

        if (typeof ev === "string") {
          if (ev.indexOf("http") === 0) {
            processedEvidences.push(ev);
          } else if (ev.indexOf("data:image/") === 0) {
            var uploaded = saveImageToDrive(ev, folderPath, fName);
            processedEvidences.push(uploaded ? uploaded.drive_url : ev);
          } else {
            processedEvidences.push(ev);
          }
        } else if (ev && typeof ev === "object") {
          var path = ev.file_path || ev.url || "";
          if (path && path.indexOf("data:image/") === 0) {
            var uploaded = saveImageToDrive(path, folderPath, fName);
            processedEvidences.push({
              ...ev,
              file_path: uploaded ? uploaded.drive_url : path,
              drive_url: uploaded ? uploaded.drive_url : (ev.drive_url || "")
            });
          } else {
            processedEvidences.push(ev);
          }
        } else {
          processedEvidences.push(ev);
        }
      } catch (evErr) {
        Logger.log("Error processing corrective evidence " + i + ": " + evErr);
        processedEvidences.push(record.evidences[i]);
      }
    }
  }

  var now = new Date().toISOString();
  record.evidences = processedEvidences;
  record.updated_at = now;
  if (!record.created_at) record.created_at = now;
  if (!record.id) record.id = Date.now();

  var recId = Number(record.id);
  var corrCode = String(record.corrective_code || "").trim();

  // SERVER-SIDE CONCURRENCY PROTECTION VIA SCRIPT LOCK
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    Logger.log("Corrective lock timeout: " + lockErr);
    return {
      success: false,
      message: "Server is busy processing another request. Please retry in a few seconds."
    };
  }

  try {
    var sheet = getCorrectiveSheet();
    ensureDatasetColumnExists(sheet);

    var data = sheet.getDataRange().getValues();
    var headers = data[0];

    var dsColIdx = headers.indexOf("dataset_id");
    var recordIdColIdx = headers.indexOf("record_id");
    var corrCodeColIdx = headers.indexOf("corrective_code");

    var existingRowIndex = -1;
    for (var r = 1; r < data.length; r++) {
      var rowId = recordIdColIdx !== -1 ? Number(data[r][recordIdColIdx]) : Number(data[r][0]);
      var rowCode = corrCodeColIdx !== -1 ? String(data[r][corrCodeColIdx] || "").trim() : "";
      var rDs = dsColIdx !== -1 ? (String(data[r][dsColIdx] || "").trim() || "default") : "default";

      if (rDs !== targetDsId) continue;

      if ((recId && rowId === recId) || (corrCode && rowCode === corrCode)) {
        existingRowIndex = r + 1;
        break;
      }
    }

    // OPTIMISTIC CONCURRENCY PROTECTION (updated_at)
    var updatedColIdx = headers.indexOf("updated_at");
    if (existingRowIndex > 0 && record.expected_updated_at && updatedColIdx !== -1) {
      var currentDbUpdatedAt = String(data[existingRowIndex - 1][updatedColIdx] || "");
      if (currentDbUpdatedAt && record.expected_updated_at !== currentDbUpdatedAt) {
        return {
          success: false,
          conflict: true,
          code: "CONFLICT",
          message: "Konflik data: Laporan Corrective telah diperbarui oleh pengguna/perangkat lain (Waktu terbaru: " + currentDbUpdatedAt + "). Silakan refresh data untuk melihat versi terkini.",
          current_updated_at: currentDbUpdatedAt
        };
      }
    }

    var rowValues = [
      record.id,
      record.dataset_id,
      record.corrective_code || "",
      record.corrective_date || "",
      record.shift || "",
      record.equipment_id || "",
      record.equipment_name || "",
      record.equipment_type || "",
      record.location_id || "",
      record.problem_description || "",
      record.action_taken || "",
      record.result || "Resolved",
      record.result_text || "",
      record.start_time || "",
      record.end_time || "",
      JSON.stringify(record.technicians || []),
      record.created_by || "",
      record.notes || "",
      JSON.stringify(record.evidences || []),
      record.created_at,
      record.updated_at
    ];

    if (existingRowIndex > 0) {
      sheet.getRange(existingRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }

    SpreadsheetApp.flush();

    return {
      success: true,
      message: existingRowIndex > 0 ? "Corrective record updated successfully" : "Corrective record created successfully",
      data: record
    };
  } finally {
    try {
      lock.releaseLock();
    } catch (relErr) {
      Logger.log("Error releasing corrective script lock: " + relErr);
    }
  }
}

function handlePhotoUpload(base64Data, folderPath, fileName, photoType) {
  var path = folderPath || (DRIVE_ROOT_FOLDER + "/Uploaded_Photos");
  var res = saveImageToDrive(base64Data, path, fileName || "upload.jpg");
  if (res) {
    return {
      success: true,
      data: res,
      folder_url: res.folder_url,
      folder_id: res.folder_id
    };
  } else {
    return { success: false, message: "Failed to upload photo to Drive" };
  }
}

// Batch photo upload handler: processes multiple photos, resolves folder efficiently
function handleBatchPhotoUpload(photos, defaultFolderPath) {
  var tBatchStart = Date.now();
  if (!photos || !Array.isArray(photos) || photos.length === 0) {
    return { success: false, message: "Daftar foto batch kosong." };
  }

  var results = [];
  var hasFailures = false;
  var resolvedFolderUrl = "";
  var resolvedFolderId = "";

  for (var i = 0; i < photos.length; i++) {
    var p = photos[i];
    var path = p.folderPath || p.folder_path || defaultFolderPath || (DRIVE_ROOT_FOLDER + "/Uploaded_Photos");
    var base64 = p.base64Data || p.base64_data || p.dataUrl || p.file_path;
    var fileName = p.fileName || p.file_name || ("photo_" + (i + 1) + ".jpg");

    var res = saveImageToDrive(base64, path, fileName);
    if (res) {
      if (!resolvedFolderUrl && res.folder_url) {
        resolvedFolderUrl = res.folder_url;
        resolvedFolderId = res.folder_id;
      }
      results.push({
        id: p.id,
        index: i,
        success: true,
        data: res
      });
    } else {
      hasFailures = true;
      results.push({
        id: p.id,
        index: i,
        success: false,
        message: "Gagal mengunggah foto index #" + (i + 1)
      });
    }
  }

  var batchDuration = Date.now() - tBatchStart;
  Logger.log("[UploadTiming] batch total (" + photos.length + " photos): " + batchDuration + "ms");

  return {
    success: !hasFailures,
    total: photos.length,
    duration_ms: batchDuration,
    folder_url: resolvedFolderUrl,
    folder_id: resolvedFolderId,
    results: results
  };
}
