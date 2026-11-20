import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_TIP: 12,
  RING_TIP: 16,
  PINKY_TIP: 20,
  MIDDLE_MCP: 9,
  RING_MCP: 13,
  PINKY_MCP: 17,
};

// Cubit dinilai relatif terhadap ukuran telapak, jadi tetap akurat
// saat tangan dekat maupun jauh dari kamera. Dua ambang (hysteresis)
// mencegah status cubit "berkedip" di sekitar batas.
const PINCH_ENTER_RATIO = 0.33;
const PINCH_RELEASE_RATIO = 0.5;
const DRAG_LOST_GRACE_MS = 300;
const FRAME_PADDING = 28;
const FREEZE_HOLD_MS = 250;
const COUNTDOWN_SECONDS = 3;
const FIST_HOLD_FRAMES = 12;
const SNAP_DISTANCE_RATIO = 0.45;
const GRID = 3;
const LOAD_TIMEOUT_MS = 20000;

const PHOTOBOOTH_CONTRAST_ALPHA = 1.3;
const PHOTOBOOTH_BRIGHTNESS_BETA = 10;
const PHOTOBOOTH_NOISE_STD = 15;

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const videoEl = document.getElementById("webcam");
const canvas = document.getElementById("sceneCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const loadingOverlay = document.getElementById("loadingOverlay");
const loaderText = document.getElementById("loaderText");
const loaderRetry = document.getElementById("loaderRetry");
const errorBanner = document.getElementById("errorBanner");
const progressBadge = document.getElementById("progressBadge");
const progressText = document.getElementById("progressText");

const galleryStrip = document.getElementById("galleryStrip");
const galleryEmpty = document.getElementById("galleryEmpty");
const galleryCount = document.getElementById("galleryCount");
const downloadStripBtn = document.getElementById("downloadStripBtn");
const resetAllBtn = document.getElementById("resetAllBtn");
const stripCompleteMsg = document.getElementById("stripCompleteMsg");
const startBtn = document.getElementById("startBtn");
const loaderBox = document.getElementById("loaderBox");
const confirmDialog = document.getElementById("confirmDialog");
const confirmOk = document.getElementById("confirmOk");
const confirmCancel = document.getElementById("confirmCancel");

const COLOR_FLASH = "#ffd84a";
const COLOR_OK = "#3fb37f";
const DISPLAY_FONT = "'Bricolage Grotesque', 'DM Sans', sans-serif";

let appState = "tracking";

const puzzle = {
  boardBox: null,
  pieces: [],
  solved: false,
  tileW: 0,
  tileH: 0,
};

const SHATTER_COLS = 6;
const SHATTER_ROWS = 6;
const SHATTER_DURATION_MS = 850;
const shatter = {
  active: false,
  startedAt: 0,
  fragments: [],
  pendingCanvas: null,
};

const STRIP_MAX_PHOTOS = 3;
const galleryEntries = [];

function addToGallery(snapshotCanvas) {
  if (galleryEntries.length >= STRIP_MAX_PHOTOS) return;

  galleryEntries.push({ canvas: snapshotCanvas, time: Date.now() });
  renderGalleryThumb(snapshotCanvas, galleryEntries.length);
  galleryCount.textContent = `${galleryEntries.length} / ${STRIP_MAX_PHOTOS}`;
  if (galleryEmpty) galleryEmpty.style.display = "none";
  updateStripDownloadAvailability();

  if (galleryEntries.length >= STRIP_MAX_PHOTOS) {
    showStripComplete();
  }
}

function isStripFull() {
  return galleryEntries.length >= STRIP_MAX_PHOTOS;
}

function showStripComplete() {
  if (stripCompleteMsg) stripCompleteMsg.classList.add("visible");
  updateStripDownloadAvailability();
}

function hideStripComplete() {
  if (stripCompleteMsg) stripCompleteMsg.classList.remove("visible");
}

function updateStripDownloadAvailability() {
  if (!downloadStripBtn) return;
  downloadStripBtn.disabled = galleryEntries.length === 0;
}

const STRIP_FILE_BORDER = 24;
const STRIP_FILE_GAP = 16;
const STRIP_FILE_BG = "#ffffff";

function downloadPhotoStrip() {
  if (galleryEntries.length === 0) return;

  const frameW = 480;
  const frameH = 360;
  const footerH = 64;
  const n = galleryEntries.length;
  const totalW = frameW + STRIP_FILE_BORDER * 2;
  const totalH = STRIP_FILE_BORDER + n * frameH + (n - 1) * STRIP_FILE_GAP + footerH;

  const stripCanvas = document.createElement("canvas");
  stripCanvas.width = totalW;
  stripCanvas.height = totalH;
  const stripCtx = stripCanvas.getContext("2d");

  stripCtx.fillStyle = STRIP_FILE_BG;
  stripCtx.fillRect(0, 0, totalW, totalH);

  let cursorY = STRIP_FILE_BORDER;
  galleryEntries.forEach((entry) => {
    const img = entry.thumb || entry.canvas;
    stripCtx.drawImage(img, STRIP_FILE_BORDER, cursorY, frameW, frameH);
    cursorY += frameH + STRIP_FILE_GAP;
  });

  const date = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  stripCtx.fillStyle = "#8e1b2c";
  stripCtx.textAlign = "center";
  stripCtx.textBaseline = "middle";
  stripCtx.font = `800 26px ${DISPLAY_FONT}`;
  stripCtx.fillText("PuzzleCam", totalW / 2, totalH - footerH / 2 - 8);
  stripCtx.font = `500 14px 'DM Sans', sans-serif`;
  stripCtx.fillText(date, totalW / 2, totalH - footerH / 2 + 16);

  stripCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `puzzlecam-tira-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, "image/png");
}

function resetEverything() {
  galleryEntries.length = 0;
  galleryStrip.querySelectorAll(".slot").forEach((slot) => {
    slot.querySelector("canvas")?.remove();
  });
  galleryCount.textContent = `0 / ${STRIP_MAX_PHOTOS}`;
  if (galleryEmpty) galleryEmpty.style.display = "";
  hideStripComplete();
  updateStripDownloadAvailability();
  resetPuzzleOnly();
  statusText.textContent = "tira baru siap";
}

function renderGalleryThumb(snapshotCanvas, index) {
  const slot = galleryStrip.querySelector(`.slot[data-slot="${index}"]`);
  if (!slot) return;

  // Crop ke rasio 4:3 agar semua slot rapi
  const THUMB_W = 480;
  const THUMB_H = 360;
  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = THUMB_W;
  thumbCanvas.height = THUMB_H;
  const tctx = thumbCanvas.getContext("2d");
  const srcAspect = snapshotCanvas.width / snapshotCanvas.height;
  const dstAspect = THUMB_W / THUMB_H;
  let sw = snapshotCanvas.width, sh = snapshotCanvas.height, sx = 0, sy = 0;
  if (srcAspect > dstAspect) {
    sw = sh * dstAspect;
    sx = (snapshotCanvas.width - sw) / 2;
  } else {
    sh = sw / dstAspect;
    sy = (snapshotCanvas.height - sh) / 2;
  }
  tctx.drawImage(snapshotCanvas, sx, sy, sw, sh, 0, 0, THUMB_W, THUMB_H);
  galleryEntries[index - 1].thumb = thumbCanvas;

  slot.querySelector("canvas")?.remove();
  slot.appendChild(thumbCanvas);
}

function resetPuzzleOnly() {
  puzzle.boardBox = null;
  puzzle.pieces = [];
  puzzle.solved = false;
  puzzle.fullPhotoboothCanvas = null;
  appState = "tracking";
  countdown.active = false;
  drag.activeHand = null;
  drag.piece = null;
  shatter.active = false;
  shatter.fragments = [];
  shatter.pendingCanvas = null;
  fistHoldCounter = 0;
  lastSeenFrame.box = null;
  lastSeenFrame.at = 0;
  updateProgressBadge();
}

function fitCanvasToWindow() {
  const stageEl = document.getElementById("stage");
  const vw = stageEl.clientWidth;
  const vh = stageEl.clientHeight;
  const videoAspect = canvas.width / canvas.height;
  const containerAspect = vw / vh;

  let cssWidth, cssHeight;
  if (containerAspect > videoAspect) {
    cssWidth = vw;
    cssHeight = vw / videoAspect;
  } else {
    cssHeight = vh;
    cssWidth = vh * videoAspect;
  }

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
}

window.addEventListener("resize", fitCanvasToWindow);

async function initWebcam() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Browser ini tidak mendukung akses kamera. Gunakan Chrome atau Edge versi terbaru.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
    audio: false,
  });
  videoEl.srcObject = stream;

  await new Promise((resolve) => {
    videoEl.onloadedmetadata = () => {
      videoEl.play();
      resolve();
    };
  });

  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  fitCanvasToWindow();
}

function withTimeout(promise, ms, timeoutMessage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function initHandLandmarker() {
  let vision;
  try {
    vision = await withTimeout(
      FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      ),
      LOAD_TIMEOUT_MS,
      "Gagal memuat runtime MediaPipe (waktu habis). Periksa koneksi internet atau apakah cdn.jsdelivr.net diblokir."
    );
  } catch (err) {
    throw err;
  }

  try {
    const handLandmarker = await withTimeout(
      HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "video",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }),
      LOAD_TIMEOUT_MS,
      "Waktu habis saat mengunduh model tangan (mode GPU)."
    );
    return handLandmarker;
  } catch (gpuErr) {
    console.warn("[PuzzleCam] Mode GPU gagal, mencoba ulang dengan CPU…", gpuErr);
  }

  try {
    const handLandmarker = await withTimeout(
      HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "video",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }),
      LOAD_TIMEOUT_MS,
      "Gagal mengunduh model tangan (±10 MB). Periksa koneksi internet atau apakah storage.googleapis.com diblokir di jaringanmu."
    );
    return handLandmarker;
  } catch (cpuErr) {
    throw cpuErr;
  }
}

function dist2D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function distPx(a, b) {
  // Jarak dalam piksel (koordinat MediaPipe dinormalisasi terpisah untuk x dan y)
  const dx = (a.x - b.x) * canvas.width;
  const dy = (a.y - b.y) * canvas.height;
  return Math.hypot(dx, dy);
}

function palmSize(landmarks) {
  return Math.max(1, distPx(landmarks[LM.WRIST], landmarks[LM.MIDDLE_MCP]));
}

const pinchMemory = new Map();

function isPinching(landmarks, key = "_") {
  const ratio = distPx(landmarks[LM.THUMB_TIP], landmarks[LM.INDEX_TIP]) / palmSize(landmarks);
  const was = pinchMemory.get(key) || false;
  const now = was ? ratio < PINCH_RELEASE_RATIO : ratio < PINCH_ENTER_RATIO;
  pinchMemory.set(key, now);
  return now;
}

function isFist(landmarks) {
  const wrist = landmarks[LM.WRIST];
  const pairs = [
    [LM.INDEX_TIP, LM.INDEX_MCP],
    [LM.MIDDLE_TIP, LM.MIDDLE_MCP],
    [LM.RING_TIP, LM.RING_MCP],
    [LM.PINKY_TIP, LM.PINKY_MCP],
  ];
  let curled = 0;
  for (const [tipIdx, mcpIdx] of pairs) {
    if (distPx(landmarks[tipIdx], wrist) < distPx(landmarks[mcpIdx], wrist) * 1.05) curled++;
  }
  return curled >= 4;
}

// Titik tengah jempol–telunjuk (sudah dicerminkan), lebih stabil saat mencubit
function pinchPointNorm(landmarks) {
  const t = landmarks[LM.THUMB_TIP];
  const i = landmarks[LM.INDEX_TIP];
  return { x: 1 - (t.x + i.x) / 2, y: (t.y + i.y) / 2 };
}

/* ---------- Penghalusan titik tangan (mengurangi getar) ---------- */

const smoothMemory = new Map();

function smoothResult(raw) {
  const landmarks = raw.landmarks || [];
  const seen = new Set();
  const out = landmarks.map((lm, i) => {
    const label = handLabelFor(raw, i);
    seen.add(label);
    const prev = smoothMemory.get(label);
    if (!prev || prev.length !== lm.length) {
      const copy = lm.map((p) => ({ x: p.x, y: p.y, z: p.z }));
      smoothMemory.set(label, copy);
      return copy;
    }
    // Gerakan cepat -> ikuti lebih cepat; gerakan pelan -> lebih halus
    let move = 0;
    for (let k = 0; k < lm.length; k++) move += Math.hypot(lm[k].x - prev[k].x, lm[k].y - prev[k].y);
    move /= lm.length;
    const alpha = Math.min(0.9, Math.max(0.35, 0.35 + move * 15));
    const next = lm.map((p, k) => ({
      x: prev[k].x + (p.x - prev[k].x) * alpha,
      y: prev[k].y + (p.y - prev[k].y) * alpha,
      z: p.z,
    }));
    smoothMemory.set(label, next);
    return next;
  });
  for (const key of [...smoothMemory.keys()]) {
    if (!seen.has(key)) smoothMemory.delete(key);
  }
  for (const key of [...pinchMemory.keys()]) {
    if (!seen.has(key) && key !== "_") pinchMemory.delete(key);
  }
  return { ...raw, landmarks: out, handednesses: raw.handednesses || raw.handedness };
}

/* ---------- Umpan balik visual: kerangka tangan + kursor cubit ---------- */

function drawHandCursors(result) {
  const hands = result.landmarks || [];
  hands.forEach((lm, i) => {
    const label = handLabelFor(result, i);
    const pts = lm.map((pt) => toPixel(mirrorLandmarkX(pt)));

    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 2;
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    }

    const pinching = pinchMemory.get(label) || false;
    const pp = toPixel(pinchPointNorm(lm));
    const r = Math.max(10, palmSize(lm) * 0.18);
    ctx.lineWidth = 3;
    ctx.strokeStyle = pinching ? COLOR_FLASH : "rgba(255,255,255,0.9)";
    ctx.fillStyle = pinching ? "rgba(255,216,74,0.55)" : "rgba(255,255,255,0.08)";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, pinching ? r * 0.75 : r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
}

function toPixel(landmarkNorm) {
  return { x: landmarkNorm.x * canvas.width, y: landmarkNorm.y * canvas.height };
}

function mirrorLandmarkX(landmark) {
  return { x: 1 - landmark.x, y: landmark.y };
}

function computeHandFrame(indexTipA, indexTipB) {
  const a = toPixel(indexTipA);
  const b = toPixel(indexTipB);

  const minX = Math.min(a.x, b.x) - FRAME_PADDING;
  const maxX = Math.max(a.x, b.x) + FRAME_PADDING;
  const minY = Math.min(a.y, b.y) - FRAME_PADDING;
  const maxY = Math.max(a.y, b.y) + FRAME_PADDING;

  const x = Math.max(0, minX);
  const y = Math.max(0, minY);
  const width = Math.min(canvas.width, maxX) - x;
  const height = Math.min(canvas.height, maxY) - y;

  return { x, y, width, height };
}

const freezeGate = { holding: false, since: 0 };

const FRAME_GRACE_MS = 450;
const lastSeenFrame = { box: null, at: 0 };

const countdown = {
  active: false,
  startedAt: 0,
};

function startCountdown(frameBox) {
  puzzle.boardBox = { ...frameBox };
  appState = "countdown";
  countdown.active = true;
  countdown.startedAt = performance.now();
}

function drawCountdownOverlay(box) {
  const elapsed = (performance.now() - countdown.startedAt) / 1000;
  const remaining = COUNTDOWN_SECONDS - elapsed;

  if (remaining <= 0) {
    finishCountdownAndCapture(box);
    return;
  }

  applyBWInsideBox(box);

  ctx.save();
  ctx.strokeStyle = COLOR_FLASH;
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  const n = Math.ceil(remaining);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  ctx.fillStyle = "rgba(10,10,8,0.45)";
  ctx.fillRect(box.x, box.y, box.width, box.height);

  ctx.font = `800 ${Math.max(48, Math.min(box.width, box.height) * 0.45)}px ${DISPLAY_FONT}`;
  ctx.fillStyle = COLOR_FLASH;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), cx, cy);
  ctx.restore();

  statusText.textContent = `foto dalam ${n}…`;
}

function gaussianNoise(std) {
  const u1 = Math.random() || 1e-6;
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * std;
}

function applyPhotoboothEffect(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let v = gray * PHOTOBOOTH_CONTRAST_ALPHA + PHOTOBOOTH_BRIGHTNESS_BETA;
    v += gaussianNoise(PHOTOBOOTH_NOISE_STD);
    v = Math.max(0, Math.min(255, v));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  return imageData;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function finishCountdownAndCapture(box) {
  countdown.active = false;

  const mirroredFrame = document.createElement("canvas");
  mirroredFrame.width = canvas.width;
  mirroredFrame.height = canvas.height;
  const mirroredCtx = mirroredFrame.getContext("2d");
  mirroredCtx.save();
  mirroredCtx.translate(mirroredFrame.width, 0);
  mirroredCtx.scale(-1, 1);
  mirroredCtx.drawImage(videoEl, 0, 0, mirroredFrame.width, mirroredFrame.height);
  mirroredCtx.restore();

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = Math.max(1, Math.round(box.width));
  cropCanvas.height = Math.max(1, Math.round(box.height));
  const cropCtx = cropCanvas.getContext("2d");
  cropCtx.drawImage(
    mirroredFrame,
    box.x, box.y, box.width, box.height,
    0, 0, cropCanvas.width, cropCanvas.height
  );

  const fullImageData = cropCtx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
  applyPhotoboothEffect(fullImageData);
  cropCtx.putImageData(fullImageData, 0, 0);

  puzzle.fullPhotoboothCanvas = cropCanvas;

  const tileW = Math.floor(cropCanvas.width / GRID);
  const tileH = Math.floor(cropCanvas.height / GRID);
  const pieces = [];

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const sx = col * tileW;
      const sy = row * tileH;
      const w = col === GRID - 1 ? cropCanvas.width - sx : tileW;
      const h = row === GRID - 1 ? cropCanvas.height - sy : tileH;

      const pieceCanvas = document.createElement("canvas");
      pieceCanvas.width = w;
      pieceCanvas.height = h;
      pieceCanvas.getContext("2d").drawImage(cropCanvas, sx, sy, w, h, 0, 0, w, h);

      pieces.push({
        row, col,
        canvas: pieceCanvas,
        w, h,
        x: 0, y: 0,
        placed: false,
        dragging: false,
      });
    }
  }

  const slots = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      slots.push({ x: box.x + col * tileW, y: box.y + row * tileH });
    }
  }
  shuffle(slots);

  pieces.forEach((piece, i) => {
    piece.x = slots[i].x;
    piece.y = slots[i].y;
    if (isNearOwnCell(piece, box, tileW, tileH)) {
      snapPieceToCell(piece, box, tileW, tileH);
    }
  });

  puzzle.boardBox = box;
  puzzle.pieces = pieces;
  puzzle.tileW = tileW;
  puzzle.tileH = tileH;
  puzzle.solved = pieces.every((p) => p.placed);
  appState = "puzzle";
  fistHoldCounter = 0;
  updateProgressBadge();
}

const drag = {
  lostAt: 0,
  activeHand: null,
  piece: null,
  offsetX: 0,
  offsetY: 0,
};

function isNearOwnCell(piece, box, tileW, tileH) {
  const correctX = box.x + piece.col * tileW;
  const correctY = box.y + piece.row * tileH;
  const dx = piece.x - correctX;
  const dy = piece.y - correctY;
  const tolerance = Math.min(tileW, tileH) * SNAP_DISTANCE_RATIO;
  return Math.sqrt(dx * dx + dy * dy) < tolerance;
}

function reconcilePlacedState(box, tileW, tileH) {
  if (!box || !puzzle.pieces.length) return false;
  for (const piece of puzzle.pieces) {
    if (piece.displacing || piece.dragging) continue;
    piece.placed = isNearOwnCell(piece, box, tileW, tileH);
  }
  return puzzle.pieces.every((p) => p.placed);
}

function snapPieceToCell(piece, box, tileW, tileH) {
  displaceCellOccupant(piece, piece.row, piece.col, box, tileW, tileH);
  piece.x = box.x + piece.col * tileW;
  piece.y = box.y + piece.row * tileH;
  piece.placed = true;
}

function displaceCellOccupant(piece, targetRow, targetCol, box, tileW, tileH) {
  const cellX = box.x + targetCol * tileW;
  const cellY = box.y + targetRow * tileH;

  const occupant = puzzle.pieces.find((p) => {
    if (p === piece || p.displacing) return false;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    return (
      cx >= cellX && cx < cellX + tileW &&
      cy >= cellY && cy < cellY + tileH
    );
  });
  if (!occupant) return;

  if (occupant.row === targetRow && occupant.col === targetCol && occupant.placed) {
    return;
  }

  occupant.placed = false;

  const freeCells = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      if (row === targetRow && col === targetCol) continue;
      const cx0 = box.x + col * tileW;
      const cy0 = box.y + row * tileH;
      const taken = puzzle.pieces.some((p) => {
        if (p === occupant || p === piece || p.displacing) return false;
        const cx = p.x + p.w / 2;
        const cy = p.y + p.h / 2;
        return cx >= cx0 && cx < cx0 + tileW && cy >= cy0 && cy < cy0 + tileH;
      });
      if (!taken) freeCells.push({ row, col });
    }
  }

  let targetSlot;
  if (freeCells.length > 0) {
    targetSlot = freeCells[Math.floor(Math.random() * freeCells.length)];
  } else {
    targetSlot = { row: occupant.row, col: occupant.col };
  }

  const jitterX = (Math.random() - 0.5) * tileW * 0.5;
  const jitterY = (Math.random() - 0.5) * tileH * 0.5;
  const targetX = box.x + targetSlot.col * tileW + jitterX;
  const targetY = box.y + targetSlot.row * tileH + jitterY;

  animateDisplacement(occupant, targetX, targetY, box);
}

const DISPLACE_ANIM_MS = 220;

function animateDisplacement(piece, targetX, targetY, box) {
  const startX = piece.x;
  const startY = piece.y;
  const startedAt = performance.now();

  piece.displacing = true;

  function step() {
    const t = Math.min(1, (performance.now() - startedAt) / DISPLACE_ANIM_MS);
    const eased = 1 - Math.pow(1 - t, 3);

    piece.x = startX + (targetX - startX) * eased;
    piece.y = startY + (targetY - startY) * eased;

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      piece.x = targetX;
      piece.y = targetY;
      piece.displacing = false;
      clampPieceToBoard(piece);
    }
  }

  requestAnimationFrame(step);
}

function findNearestPiece(px, py) {
  let best = null;
  let bestDist = Infinity;
  for (const piece of puzzle.pieces) {
    if (piece.displacing) continue;
    const cx = piece.x + piece.w / 2;
    const cy = piece.y + piece.h / 2;
    const d = Math.hypot(px - cx, py - cy);
    if (d < Math.max(piece.w, piece.h) * 0.75 && d < bestDist) {
      best = piece;
      bestDist = d;
    }
  }
  return best;
}

function handleDragForHand(handLabel, pinching, indexPx) {
  if (pinching) {
    if (drag.activeHand === null) {
      const candidate = findNearestPiece(indexPx.x, indexPx.y);
      if (candidate) {
        drag.activeHand = handLabel;
        drag.piece = candidate;
        drag.offsetX = indexPx.x - candidate.x;
        drag.offsetY = indexPx.y - candidate.y;
        candidate.dragging = true;
        candidate.placed = false;
      }
    } else if (drag.activeHand === handLabel && drag.piece) {
      drag.piece.x = indexPx.x - drag.offsetX;
      drag.piece.y = indexPx.y - drag.offsetY;
    }
  } else {
    if (drag.activeHand === handLabel && drag.piece) {
      const piece = drag.piece;
      piece.dragging = false;
      if (isNearOwnCell(piece, puzzle.boardBox, puzzle.tileW, puzzle.tileH)) {
        snapPieceToCell(piece, puzzle.boardBox, puzzle.tileW, puzzle.tileH);
      } else {
        clampPieceToBoard(piece);
        const box = puzzle.boardBox;
        const cx = piece.x + piece.w / 2;
        const cy = piece.y + piece.h / 2;
        const dropCol = Math.min(
          GRID - 1,
          Math.max(0, Math.floor((cx - box.x) / puzzle.tileW))
        );
        const dropRow = Math.min(
          GRID - 1,
          Math.max(0, Math.floor((cy - box.y) / puzzle.tileH))
        );
        displaceCellOccupant(piece, dropRow, dropCol, box, puzzle.tileW, puzzle.tileH);
      }
      drag.activeHand = null;
      drag.piece = null;
      puzzle.solved = reconcilePlacedState(puzzle.boardBox, puzzle.tileW, puzzle.tileH);
      updateProgressBadge();
    }
  }
}

function clampPieceToBoard(piece) {
  const box = puzzle.boardBox;
  piece.x = Math.min(Math.max(piece.x, box.x), box.x + box.width - piece.w);
  piece.y = Math.min(Math.max(piece.y, box.y), box.y + box.height - piece.h);
}

function drawBoardAndPieces() {
  const box = puzzle.boardBox;

  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255,216,74,0.22)";
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID; i++) {
    ctx.beginPath();
    ctx.moveTo(box.x + i * puzzle.tileW, box.y);
    ctx.lineTo(box.x + i * puzzle.tileW, box.y + box.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + i * puzzle.tileH);
    ctx.lineTo(box.x + box.width, box.y + i * puzzle.tileH);
    ctx.stroke();
  }
  ctx.restore();

  const sorted = [...puzzle.pieces].sort((a, b) => (a.dragging ? 1 : 0) - (b.dragging ? 1 : 0));

  for (const piece of sorted) {
    ctx.save();
    if (piece.dragging) {
      ctx.shadowColor = "rgba(255,216,74,0.9)";
      ctx.shadowBlur = 14;
    }
    ctx.drawImage(piece.canvas, piece.x, piece.y, piece.w, piece.h);
    ctx.strokeStyle = piece.placed ? COLOR_OK : "rgba(234,229,214,0.5)";
    ctx.lineWidth = piece.dragging ? 3 : 1.5;
    ctx.strokeRect(piece.x, piece.y, piece.w, piece.h);
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = puzzle.solved ? COLOR_OK : COLOR_FLASH;
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();

  if (puzzle.solved) {
    ctx.save();
    ctx.fillStyle = "rgba(63,179,127,0.18)";
    ctx.fillRect(box.x, box.y, box.width, box.height);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const title = "Lengkap!";
    const hint = "kepalkan tangan atau klik untuk menyimpan";
    let titleSize = Math.max(22, box.width * 0.14);
    ctx.font = `800 ${titleSize}px ${DISPLAY_FONT}`;
    const tw = ctx.measureText(title).width;
    if (tw > box.width * 0.85) {
      titleSize *= (box.width * 0.85) / tw;
      ctx.font = `800 ${titleSize}px ${DISPLAY_FONT}`;
    }
    let hintSize = Math.max(11, titleSize * 0.28);
    ctx.font = `600 ${hintSize}px 'DM Sans', sans-serif`;
    const hw = ctx.measureText(hint).width;
    if (hw > box.width * 0.9) hintSize *= (box.width * 0.9) / hw;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.font = `800 ${titleSize}px ${DISPLAY_FONT}`;
    ctx.lineWidth = Math.max(4, titleSize * 0.12);
    ctx.strokeStyle = "rgba(6,38,26,0.85)";
    ctx.strokeText(title, cx, cy - hintSize * 0.6);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(title, cx, cy - hintSize * 0.6);
    ctx.font = `600 ${hintSize}px 'DM Sans', sans-serif`;
    ctx.lineWidth = Math.max(3, hintSize * 0.3);
    ctx.strokeText(hint, cx, cy + titleSize * 0.55);
    ctx.fillText(hint, cx, cy + titleSize * 0.55);
    ctx.restore();
  }
}

function updateProgressBadge() {
  if (appState !== "puzzle") {
    progressBadge.classList.remove("visible", "solved");
    return;
  }
  const placedCount = puzzle.pieces.filter((p) => p.placed).length;
  progressText.textContent = `${placedCount} dari ${puzzle.pieces.length} keping terpasang`;
  progressBadge.classList.add("visible");
  progressBadge.classList.toggle("solved", puzzle.solved);
}

function drawVideoFrame() {
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function applyBWInsideBox(box) {
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const w = Math.min(canvas.width - x, Math.round(box.width));
  const h = Math.min(canvas.height - y, Math.round(box.height));
  if (w <= 0 || h <= 0) return;

  const region = ctx.getImageData(x, y, w, h);
  applyPhotoboothEffect(region);
  ctx.putImageData(region, x, y);
}

function drawLiveFrameOverlay(box) {
  ctx.save();
  ctx.strokeStyle = COLOR_FLASH;
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  const cornerLen = 18;
  ctx.lineWidth = 4;
  const corners = [
    [box.x, box.y, 1, 1],
    [box.x + box.width, box.y, -1, 1],
    [box.x, box.y + box.height, 1, -1],
    [box.x + box.width, box.y + box.height, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + cornerLen * dy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + cornerLen * dx, cy);
    ctx.stroke();
  }
  ctx.restore();
}

function isPointInBoard(px, py, box) {
  if (!box) return false;
  return (
    px >= box.x &&
    px <= box.x + box.width &&
    py >= box.y &&
    py <= box.y + box.height
  );
}

function drawHandSkeleton(landmarksPx) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(255,255,255,0.85)";
  ctx.shadowBlur = 10;
  ctx.strokeStyle = "white";
  ctx.lineWidth = 3;

  for (const [iA, iB] of HAND_CONNECTIONS) {
    const a = landmarksPx[iA];
    const b = landmarksPx[iB];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.shadowBlur = 6;
  ctx.fillStyle = "white";
  for (const p of landmarksPx) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawHandSkeletonsOverBoard(handsLandmarks, box) {
  if (!box || !handsLandmarks || handsLandmarks.length === 0) return;

  for (const lm of handsLandmarks) {
    const landmarksPx = lm.map((pt) => toPixel(mirrorLandmarkX(pt)));
    const overBoard = landmarksPx.some((p) => isPointInBoard(p.x, p.y, box));
    if (overBoard) {
      drawHandSkeleton(landmarksPx);
    }
  }
}

function startShatter(sourceCanvas, box) {
  const cols = SHATTER_COLS;
  const rows = SHATTER_ROWS;
  const fragW = sourceCanvas.width / cols;
  const fragH = sourceCanvas.height / rows;
  const fragments = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sx = col * fragW;
      const sy = row * fragH;

      const fragCanvas = document.createElement("canvas");
      fragCanvas.width = Math.ceil(fragW);
      fragCanvas.height = Math.ceil(fragH);
      fragCanvas.getContext("2d").drawImage(
        sourceCanvas,
        sx, sy, fragW, fragH,
        0, 0, fragCanvas.width, fragCanvas.height
      );

      const cx = box.x + sx + fragW / 2;
      const cy = box.y + sy + fragH / 2;

      const boardCx = box.x + box.width / 2;
      const boardCy = box.y + box.height / 2;
      const dirX = cx - boardCx;
      const dirY = cy - boardCy;
      const dirLen = Math.max(1, Math.hypot(dirX, dirY));
      const speed = 90 + Math.random() * 160;

      fragments.push({
        canvas: fragCanvas,
        x: cx,
        y: cy,
        w: fragW,
        h: fragH,
        vx: (dirX / dirLen) * speed + (Math.random() - 0.5) * 40,
        vy: (dirY / dirLen) * speed + (Math.random() - 0.5) * 40 - 60,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 6,
        gravity: 220 + Math.random() * 80,
      });
    }
  }

  shatter.fragments = fragments;
  shatter.active = true;
  shatter.startedAt = performance.now();
  appState = "shattering";
}

function updateAndDrawShatter() {
  const elapsedMs = performance.now() - shatter.startedAt;
  const t = Math.min(1, elapsedMs / SHATTER_DURATION_MS);

  if (t >= 1) {
    finishShatter();
    return;
  }

  const dt = 1 / 60;
  const fadeStart = 0.45;

  ctx.save();
  for (const frag of shatter.fragments) {
    frag.x += frag.vx * dt;
    frag.y += frag.vy * dt;
    frag.vy += frag.gravity * dt;
    frag.rotation += frag.rotationSpeed * dt;

    const alpha = t < fadeStart ? 1 : Math.max(0, 1 - (t - fadeStart) / (1 - fadeStart));
    const scale = 1 - t * 0.25;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(frag.x, frag.y);
    ctx.rotate(frag.rotation);
    ctx.scale(scale, scale);
    ctx.drawImage(frag.canvas, -frag.w / 2, -frag.h / 2, frag.w, frag.h);
    ctx.restore();
  }
  ctx.restore();
}

function finishShatter() {
  shatter.active = false;
  shatter.fragments = [];
  if (shatter.pendingCanvas) {
    addToGallery(shatter.pendingCanvas);
    statusText.textContent = "tersimpan di tira!";
    shatter.pendingCanvas = null;
  }
  resetPuzzleOnly();
}

function handleFistReset() {
  if (appState !== "puzzle") {
    statusText.textContent = "puzzle diulang";
    resetPuzzleOnly();
    return;
  }

  const reallySolved = reconcilePlacedState(puzzle.boardBox, puzzle.tileW, puzzle.tileH);
  puzzle.solved = reallySolved;

  if (reallySolved && puzzle.fullPhotoboothCanvas) {
    shatter.pendingCanvas = puzzle.fullPhotoboothCanvas;
    startShatter(puzzle.fullPhotoboothCanvas, puzzle.boardBox);
  } else {
    statusText.textContent = "puzzle diulang";
    resetPuzzleOnly();
  }
}

let handLandmarker = null;
let loopStarted = false;
let booting = false;

function handLabelFor(result, i) {
  const cat = result.handednesses?.[i]?.[0] || result.handedness?.[i]?.[0];
  const name = cat?.categoryName;
  // Jika dua tangan terdeteksi dengan label sama, pakai indeks agar tetap unik
  if (name) {
    const sameCount = (result.handednesses || result.handedness || [])
      .filter((h) => h?.[0]?.categoryName === name).length;
    if (sameCount === 1) return name;
  }
  return i === 0 ? "A" : "B";
}
let fistHoldCounter = 0;

function releaseLostDrag() {
  if (!drag.activeHand || drag.activeHand === "pointer" || !drag.piece) return;
  const now = performance.now();
  if (!drag.lostAt) {
    drag.lostAt = now;
    return;
  }
  if (now - drag.lostAt > DRAG_LOST_GRACE_MS) {
    drag.lostAt = 0;
    handleDragForHand(drag.activeHand, false, { x: drag.piece.x, y: drag.piece.y });
  }
}

function processResults(result) {
  if (appState === "shattering") {
    updateAndDrawShatter();
    statusText.textContent = "menyimpan…";
    return;
  }

  const handsLandmarks = result.landmarks || [];
  const noHands = handsLandmarks.length === 0;

  if (noHands) {
    statusDot.className = puzzle.solved ? "status-dot solved" : "status-dot";
    fistHoldCounter = 0;
    freezeGate.holding = false;

    releaseLostDrag();

    if (appState === "tracking") {
      const sinceLastSeen = performance.now() - lastSeenFrame.at;
      if (lastSeenFrame.box && sinceLastSeen < FRAME_GRACE_MS) {
        applyBWInsideBox(lastSeenFrame.box);
        drawLiveFrameOverlay(lastSeenFrame.box);
      }
      statusText.textContent = isStripFull()
        ? "tira penuh — unduh atau mulai tira baru"
        : "mencari tangan…";
      return;
    }

    if (appState === "countdown") {
      drawCountdownOverlay(puzzle.boardBox);
      return;
    }

    if (appState === "puzzle") {
      puzzle.solved = reconcilePlacedState(puzzle.boardBox, puzzle.tileW, puzzle.tileH);
      updateProgressBadge();
      drawBoardAndPieces();
      statusText.textContent = puzzle.solved
        ? "lengkap! kepalkan tangan untuk menyimpan"
        : "susun puzzle dengan mencubit atau mouse";
      return;
    }

    return;
  }

  statusDot.className = puzzle.solved ? "status-dot solved" : "status-dot live";

  const anyFist = handsLandmarks.some((lm) => isFist(lm));
  const draggingNow = drag.activeHand !== null && drag.piece !== null;
  if (anyFist && !draggingNow && appState === "puzzle") {
    fistHoldCounter++;
    if (fistHoldCounter >= FIST_HOLD_FRAMES) {
      fistHoldCounter = 0;
      handleFistReset();
      return;
    }
  } else {
    fistHoldCounter = 0;
  }

  if (appState === "tracking") {
    if (isStripFull()) {
      statusText.textContent = "tira penuh — unduh atau mulai tira baru";
      return;
    }
    if (handsLandmarks.length === 2) {
      const [handA, handB] = handsLandmarks;
      const frameBox = computeHandFrame(pinchPointNorm(handA), pinchPointNorm(handB));

      if (frameBox.width > 4 && frameBox.height > 4) {
        applyBWInsideBox(frameBox);
        drawLiveFrameOverlay(frameBox);
        lastSeenFrame.box = frameBox;
        lastSeenFrame.at = performance.now();
      }

      const pinchA = isPinching(handA, handLabelFor(result, 0));
      const pinchB = isPinching(handB, handLabelFor(result, 1));
      const bothPinching = pinchA && pinchB;
      if (bothPinching && frameBox.width > 40 && frameBox.height > 40) {
        if (!freezeGate.holding) {
          freezeGate.holding = true;
          freezeGate.since = performance.now();
        }
        statusDot.className = "status-dot armed";
        statusText.textContent = "tahan cubitannya…";

        if (performance.now() - freezeGate.since > FREEZE_HOLD_MS) {
          freezeGate.holding = false;
          startCountdown(frameBox);
        }
      } else {
        freezeGate.holding = false;
        statusText.textContent = pinchA || pinchB
          ? "satu tangan sudah mencubit, cubit juga tangan lainnya"
          : "dua tangan terlihat, sekarang cubit jempol & telunjuk";
      }
    } else {
      freezeGate.holding = false;
      handsLandmarks.forEach((lm, i) => isPinching(lm, handLabelFor(result, i)));
      const sinceLastSeen = performance.now() - lastSeenFrame.at;
      if (lastSeenFrame.box && sinceLastSeen < FRAME_GRACE_MS) {
        applyBWInsideBox(lastSeenFrame.box);
        drawLiveFrameOverlay(lastSeenFrame.box);
      }
      statusText.textContent = "baru 1 tangan terlihat, angkat tangan satunya";
    }
    drawHandCursors(result);
    return;
  }

  if (appState === "countdown") {
    drawCountdownOverlay(puzzle.boardBox);
    if (appState === "countdown") drawHandCursors(result);
    return;
  }

  if (appState === "puzzle") {
    const labelsPresent = new Set();
    handsLandmarks.forEach((lm, i) => {
      const label = handLabelFor(result, i);
      labelsPresent.add(label);
      const pinching = isPinching(lm, label);
      const pointPx = toPixel(pinchPointNorm(lm));
      handleDragForHand(label, pinching, pointPx);
    });

    if (drag.activeHand && labelsPresent.has(drag.activeHand)) {
      drag.lostAt = 0;
    } else {
      releaseLostDrag();
    }

    if (!drag.piece) {
      puzzle.solved = reconcilePlacedState(puzzle.boardBox, puzzle.tileW, puzzle.tileH);
      updateProgressBadge();
    }

    drawBoardAndPieces();
    drawHandCursors(result);

    statusText.textContent = puzzle.solved
      ? (fistHoldCounter > 0
          ? `menyimpan… tahan kepalan (${fistHoldCounter}/${FIST_HOLD_FRAMES})`
          : "lengkap! kepalkan tangan untuk menyimpan")
      : "susun puzzle dengan mencubit atau mouse";
  }
}

let lastVideoTime = -1;
let lastResult = { landmarks: [] };

function renderLoop() {
  if (videoEl.readyState >= 2 && handLandmarker) {
    drawVideoFrame();
    // Hanya deteksi ulang jika ada frame video baru (hemat CPU/GPU)
    if (videoEl.currentTime !== lastVideoTime) {
      lastVideoTime = videoEl.currentTime;
      try {
        lastResult = smoothResult(handLandmarker.detectForVideo(videoEl, performance.now()));
      } catch (err) {
        console.warn("[PuzzleCam] detectForVideo gagal:", err);
      }
    }
    processResults(lastResult);
  }
  requestAnimationFrame(renderLoop);
}

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.style.display = "block";
}

function showLoaderError(message) {
  loaderBox.hidden = false;
  loaderBox.classList.add("is-error");
  loaderText.textContent = message;
  loaderText.classList.add("is-error");
  startBtn.classList.add("hidden");
  loaderRetry.classList.remove("hidden");
  statusText.textContent = "kamera belum aktif";
}

function resetLoaderUI() {
  loadingOverlay.classList.remove("hidden");
  loaderBox.hidden = false;
  loaderBox.classList.remove("is-error");
  loaderText.classList.remove("is-error");
  loaderText.textContent = "Menyalakan kamera dan memuat model pelacak tangan (±10 MB, hanya sekali)…";
  startBtn.classList.add("hidden");
  loaderRetry.classList.add("hidden");
  errorBanner.style.display = "none";
}

async function boot() {
  if (booting) return;
  booting = true;
  resetLoaderUI();
  statusText.textContent = "memuat…";

  let settled = false;
  const watchdogMs = (LOAD_TIMEOUT_MS * 2) + 5000;
  const watchdog = setTimeout(() => {
    if (!settled) {
      showLoaderError("Pemuatan terlalu lama. Periksa koneksi internet lalu tekan Coba lagi.");
    }
  }, watchdogMs);

  try {
    if (!window.isSecureContext) {
      throw new Error("Kamera hanya bisa dipakai lewat HTTPS atau localhost. Buka halaman ini lewat alamat https://.");
    }
    if (!videoEl.srcObject) {
      await initWebcam();
    }

    if (!handLandmarker) {
      handLandmarker = await initHandLandmarker();
    }

    settled = true;
    clearTimeout(watchdog);
    loadingOverlay.classList.add("hidden");
    statusText.textContent = "siap — angkat kedua tanganmu";
    statusDot.className = "status-dot live";
    if (!loopStarted) {
      loopStarted = true;
      requestAnimationFrame(renderLoop);
    }
  } catch (err) {
    settled = true;
    clearTimeout(watchdog);
    console.error("[PuzzleCam]", err);
    if (err && err.name === "NotAllowedError") {
      showLoaderError("Izin kamera ditolak. Izinkan kamera lewat ikon gembok di address bar, lalu tekan Coba lagi.");
    } else if (err && err.name === "NotFoundError") {
      showLoaderError("Tidak ada webcam yang terdeteksi. Sambungkan kamera lalu tekan Coba lagi.");
    } else if (err && err.name === "NotReadableError") {
      showLoaderError("Kamera sedang dipakai aplikasi lain (Zoom, Meet, Discord, dll). Tutup aplikasinya lalu tekan Coba lagi.");
    } else {
      showLoaderError((err && err.message) || "Aplikasi gagal dimulai. Tekan Coba lagi.");
    }
  } finally {
    booting = false;
  }
}

/* ---------- Mouse / sentuhan sebagai alternatif gestur ---------- */

function clientToCanvas(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((evt.clientX - rect.left) / rect.width) * canvas.width,
    y: ((evt.clientY - rect.top) / rect.height) * canvas.height,
  };
}

canvas.addEventListener("pointerdown", (evt) => {
  if (appState !== "puzzle") return;
  const pt = clientToCanvas(evt);
  if (puzzle.solved && isPointInBoard(pt.x, pt.y, puzzle.boardBox)) {
    handleFistReset();
    return;
  }
  if (drag.activeHand !== null) return;
  handleDragForHand("pointer", true, pt);
  if (drag.activeHand === "pointer") canvas.setPointerCapture(evt.pointerId);
});

canvas.addEventListener("pointermove", (evt) => {
  if (drag.activeHand !== "pointer") return;
  handleDragForHand("pointer", true, clientToCanvas(evt));
});

function endPointerDrag(evt) {
  if (drag.activeHand !== "pointer") return;
  handleDragForHand("pointer", false, clientToCanvas(evt));
}
canvas.addEventListener("pointerup", endPointerDrag);
canvas.addEventListener("pointercancel", endPointerDrag);

/* ---------- Tombol ---------- */

startBtn.addEventListener("click", boot);
loaderRetry.addEventListener("click", boot);

if (downloadStripBtn) {
  downloadStripBtn.addEventListener("click", downloadPhotoStrip);
  updateStripDownloadAvailability();
}

function openConfirm() {
  confirmDialog.hidden = false;
  confirmCancel.focus();
}
function closeConfirm() {
  confirmDialog.hidden = true;
  resetAllBtn.focus();
}

resetAllBtn.addEventListener("click", openConfirm);
confirmCancel.addEventListener("click", closeConfirm);
confirmOk.addEventListener("click", () => {
  resetEverything();
  closeConfirm();
});
confirmDialog.addEventListener("click", (e) => {
  if (e.target === confirmDialog) closeConfirm();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !confirmDialog.hidden) closeConfirm();
});

// Jika izin kamera sudah pernah diberikan, langsung mulai tanpa klik
navigator.permissions?.query({ name: "camera" })
  .then((res) => { if (res.state === "granted") boot(); })
  .catch(() => {});
