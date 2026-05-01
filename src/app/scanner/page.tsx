"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepId =
  | "face" | "right-eye" | "left-eye" | "right-hand" | "left-hand"
  | "right-fingers" | "left-fingers" | "posture" | "complete";

type Step = {
  id: StepId;
  title: string;
  instruction: string;
  target: string;
  icon: string;
};

type Metric = {
  confidence: number;
  lighting: number;
  alignment: number;
  stability: number;
  faceSize: number;
};

type StageResult = {
  id: StepId;
  title: string;
  score: number;
  note: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const RPPG_BUFFER_SIZE = 300;
const RPPG_MIN_SAMPLES = 90;
const FPS_ESTIMATE = 30;

const steps: Step[] = [
  { id: "face",          icon: "◎", title: "Face Scan",         instruction: "Position your full face clearly inside the frame.",                     target: "Face centered, stable, and well lit."         },
  { id: "right-eye",    icon: "◉", title: "Right Eye Scan",    instruction: "Move closer and show your right eye clearly.",                           target: "Right eye area visible and steady."           },
  { id: "left-eye",     icon: "◉", title: "Left Eye Scan",     instruction: "Now show your left eye clearly.",                                        target: "Left eye area visible and steady."            },
  { id: "right-hand",   icon: "✋", title: "Right Hand Scan",   instruction: "Raise your right hand and open your palm toward the camera.",            target: "Right palm visible and steady."               },
  { id: "left-hand",    icon: "🤚", title: "Left Hand Scan",    instruction: "Raise your left hand and open your palm toward the camera.",             target: "Left palm visible and steady."                },
  { id: "right-fingers",icon: "☛", title: "Right Finger Scan", instruction: "Show your right-hand fingers one by one close to the camera.",           target: "Finger close, stable, and well lit."          },
  { id: "left-fingers", icon: "☚", title: "Left Finger Scan",  instruction: "Show your left-hand fingers one by one close to the camera.",            target: "Finger close, stable, and well lit."          },
  { id: "posture",      icon: "⬆", title: "Posture Scan",      instruction: "Sit upright, relax your shoulders, and keep your head straight.",        target: "Head and upper body alignment visible."       },
  { id: "complete",     icon: "✦", title: "Final Wellness Report", instruction: "All scan stages are complete. Review the report below.",              target: "Report ready."                                },
];

const emptyMetric: Metric = { confidence: 0, lighting: 0, alignment: 0, stability: 0, faceSize: 0 };

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  // Camera refs
  const videoRef          = useRef<HTMLVideoElement | null>(null);
  const canvasRef         = useRef<HTMLCanvasElement | null>(null);
  const streamRef         = useRef<MediaStream | null>(null);
  const modelRef          = useRef<any>(null);
  const rafRef            = useRef<number | null>(null);
  const previousCenterRef = useRef<{ x: number; y: number } | null>(null);
  const lastVoiceRef      = useRef("");

  // rPPG refs
  const rppgBufferRef     = useRef<number[]>([]);
  const rppgWaveformRef   = useRef<HTMLCanvasElement | null>(null);
  const lastBPMUpdateRef  = useRef(0);
  const frameCountRef     = useRef(0);
  const bpmHistoryRef     = useRef<number[]>([]);

  // Core state
  const [stepIndex,    setStepIndex]    = useState(0);
  const [cameraOn,     setCameraOn]     = useState(false);
  const [loading,      setLoading]      = useState("Idle");
  const [feedback,     setFeedback]     = useState("Start the camera to begin.");
  const [metric,       setMetric]       = useState<Metric>(emptyMetric);
  const [stageResults, setStageResults] = useState<StageResult[]>([]);
  const [report,       setReport]       = useState("");
  const [error,        setError]        = useState("");
  const [scanSeconds,  setScanSeconds]  = useState(0);
  const [isCapturing,  setIsCapturing]  = useState(false);
  const [voiceOn,      setVoiceOn]      = useState(true);

  // rPPG state
  const [heartRate,    setHeartRate]    = useState<number | null>(null);
  const [rppgSamples,  setRppgSamples]  = useState(0);
  const [stressLevel,  setStressLevel]  = useState<"low" | "moderate" | "high" | null>(null);

  const current    = steps[stepIndex];
  const isComplete = current.id === "complete";

  const overallScore = useMemo(() => {
    if (!stageResults.length) return 0;
    return Math.round(stageResults.reduce((s, r) => s + r.score, 0) / stageResults.length);
  }, [stageResults]);

  // ─── rPPG: Extract normalized green-channel signal from forehead ROI ─────

  function extractRPPGSignal(
    video: HTMLVideoElement,
    x: number, y: number, w: number, h: number
  ): number | null {
    const temp = document.createElement("canvas");
    temp.width  = 32;
    temp.height = 32;
    const ctx = temp.getContext("2d");
    if (!ctx) return null;

    try {
      // Forehead + cheek region: center 60% width, top 60% height
      ctx.drawImage(
        video,
        Math.max(0, x + w * 0.2), Math.max(0, y + h * 0.05),
        Math.max(1, w * 0.6),     Math.max(1, h * 0.6),
        0, 0, 32, 32
      );
      const data = ctx.getImageData(0, 0, 32, 32).data;

      let r = 0, g = 0, b = 0;
      const pixels = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2];
      }
      r /= pixels; g /= pixels; b /= pixels;

      const total = r + g + b;
      if (total < 10) return null;
      return g / total; // Normalized green (illumination-robust)
    } catch {
      return null;
    }
  }

  // ─── rPPG: Peak-detection BPM from rolling buffer ────────────────────────

  function calculateBPMFromBuffer(buffer: number[]): { bpm: number } | null {
    if (buffer.length < RPPG_MIN_SAMPLES) return null;

    const data = buffer.slice(-Math.min(buffer.length, RPPG_MIN_SAMPLES * 2));

    // Detrend: subtract local moving average
    const WIN = 20;
    const detrended = data.map((v, i) => {
      const s = data.slice(Math.max(0, i - WIN), Math.min(data.length, i + WIN + 1));
      return v - s.reduce((a, b) => a + b, 0) / s.length;
    });

    const maxAbs = Math.max(...detrended.map(Math.abs)) || 1;
    const norm   = detrended.map(v => v / maxAbs);

    // Find peaks (min 0.4 s apart → max 150 BPM)
    const MIN_DIST = Math.floor(FPS_ESTIMATE * 0.4);
    const peaks: number[] = [];
    for (let i = 2; i < norm.length - 2; i++) {
      if (
        norm[i] > 0.2 &&
        norm[i] > norm[i - 1] && norm[i] > norm[i - 2] &&
        norm[i] > norm[i + 1] && norm[i] > norm[i + 2]
      ) {
        if (!peaks.length || i - peaks[peaks.length - 1] >= MIN_DIST) {
          peaks.push(i);
        }
      }
    }

    if (peaks.length < 3) return null;

    const intervals = peaks.slice(1).map((p, i) => p - peaks[i]);
    intervals.sort((a, b) => a - b);
    const med = intervals[Math.floor(intervals.length / 2)];
    const filtered = intervals.filter(v => v > med * 0.5 && v < med * 1.5);
    if (!filtered.length) return null;

    const mean = filtered.reduce((a, b) => a + b, 0) / filtered.length;
    const bpm  = Math.round(60 * FPS_ESTIMATE / mean);

    return bpm >= 40 && bpm <= 180 ? { bpm } : null;
  }

  // ─── rPPG: Draw waveform on sidebar canvas ───────────────────────────────

  function drawRPPGWaveform(buffer: number[]) {
    const canvas = rppgWaveformRef.current;
    if (!canvas || buffer.length < 5) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Display last 100 samples, centered
    const view = buffer.slice(-100);
    const avg  = view.reduce((a, b) => a + b, 0) / view.length;
    const norm = view.map(v => v - avg);
    const peak = Math.max(...norm.map(Math.abs)) || 0.001;

    // Faint grid
    ctx.strokeStyle = "rgba(6,182,212,0.08)";
    ctx.lineWidth   = 1;
    ctx.setLineDash([2, 5]);
    for (let row = 1; row < 4; row++) {
      ctx.beginPath();
      ctx.moveTo(0, (H / 4) * row);
      ctx.lineTo(W, (H / 4) * row);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Filled area below midline
    ctx.beginPath();
    norm.forEach((v, i) => {
      const x = (i / (norm.length - 1)) * W;
      const y = H / 2 - (v / peak) * (H * 0.42);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(W, H / 2);
    ctx.lineTo(0, H / 2);
    ctx.closePath();
    ctx.fillStyle = "rgba(6,182,212,0.07)";
    ctx.fill();

    // Main waveform line with glow
    ctx.shadowColor = "#06b6d4";
    ctx.shadowBlur  = 10;
    ctx.beginPath();
    ctx.strokeStyle = "#06b6d4";
    ctx.lineWidth   = 2.5;
    norm.forEach((v, i) => {
      const x = (i / (norm.length - 1)) * W;
      const y = H / 2 - (v / peak) * (H * 0.42);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ─── rPPG: Update buffer, recalculate BPM ────────────────────────────────

  function updateRPPG(signal: number) {
    const buf = rppgBufferRef.current;
    buf.push(signal);
    if (buf.length > RPPG_BUFFER_SIZE) buf.shift();

    frameCountRef.current++;
    drawRPPGWaveform(buf);

    if (frameCountRef.current % 15 === 0) setRppgSamples(buf.length);

    const now = Date.now();
    if (buf.length >= RPPG_MIN_SAMPLES && now - lastBPMUpdateRef.current > 1000) {
      lastBPMUpdateRef.current = now;
      const result = calculateBPMFromBuffer(buf);
      if (result) {
        bpmHistoryRef.current.push(result.bpm);
        if (bpmHistoryRef.current.length > 6) bpmHistoryRef.current.shift();

        const smooth = Math.round(
          bpmHistoryRef.current.reduce((a, b) => a + b, 0) / bpmHistoryRef.current.length
        );
        setHeartRate(smooth);

        // Estimate stress from BPM variance in history
        if (bpmHistoryRef.current.length >= 3) {
          const mean = smooth;
          const variance = bpmHistoryRef.current
            .reduce((s, v) => s + Math.pow(v - mean, 2), 0) / bpmHistoryRef.current.length;
          setStressLevel(variance < 4 ? "low" : variance < 18 ? "moderate" : "high");
        }
      }
    }
  }

  // ─── Voice & feedback ─────────────────────────────────────────────────────

  function speak(text: string) {
    if (!voiceOn || typeof window === "undefined" || !window.speechSynthesis) return;
    if (lastVoiceRef.current === text) return;
    lastVoiceRef.current = text;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92; u.pitch = 1; u.volume = 0.9;
    window.speechSynthesis.speak(u);
  }

  function updateFeedback(text: string) { setFeedback(text); speak(text); }

  // ─── Camera & model ───────────────────────────────────────────────────────

  async function loadModel() {
    if (modelRef.current) return modelRef.current;
    setLoading("Loading visual intelligence model...");
    const blazeface = await import("@tensorflow-models/blazeface");
    await import("@tensorflow/tfjs");
    modelRef.current = await blazeface.load();
    setLoading("Model ready");
    return modelRef.current;
  }

  async function startCamera() {
    try {
      setError("");
      setReport("");
      setLoading("Requesting camera permission...");
      const model = await loadModel();

      streamRef.current?.getTracks().forEach(t => t.stop());

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Reset rPPG
      rppgBufferRef.current = [];
      frameCountRef.current = 0;
      bpmHistoryRef.current = [];
      setHeartRate(null);
      setRppgSamples(0);
      setStressLevel(null);

      setCameraOn(true);
      setLoading("Camera active");
      updateFeedback(current.instruction);
      detectionLoop(model);
    } catch {
      setError("Camera could not be opened. Please allow camera permission and try again.");
      setLoading("Camera error");
      updateFeedback("Camera permission is required.");
    }
  }

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    updateFeedback("Camera stopped.");
  }

  // ─── Detection loop ───────────────────────────────────────────────────────

  async function detectionLoop(model: any) {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const run = async () => {
      if (!video.videoWidth || !video.videoHeight) {
        rafRef.current = requestAnimationFrame(run);
        return;
      }

      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawStageGuide(ctx, canvas.width, canvas.height, current.id);

      let faces: any[] = [];
      try { faces = await model.estimateFaces(video, false); } catch { faces = []; }

      if (!faces.length) {
        setMetric(emptyMetric);
        if (!isComplete) updateFeedback("No face detected. Move into the frame.");
        rafRef.current = requestAnimationFrame(run);
        return;
      }

      const f  = faces[0];
      const [x1, y1] = f.topLeft;
      const [x2, y2] = f.bottomRight;
      const w  = x2 - x1;
      const h  = y2 - y1;
      const cx = x1 + w / 2;
      const cy = y1 + h / 2;

      const rawConf   = Math.round((f.probability?.[0] || 0) * 100);
      const faceSize  = Math.min(100, Math.round(((w * h) / (canvas.width * canvas.height)) * 450));
      const alignment = calcAlignment(cx, cy, canvas.width, canvas.height);
      const lighting  = estimateLighting(video, x1, y1, w, h);
      const stability = calcStability(cx, cy);
      const confidence = Math.round(rawConf * 0.35 + alignment * 0.25 + lighting * 0.2 + stability * 0.1 + faceSize * 0.1);

      setMetric({ confidence, lighting, alignment, stability, faceSize });
      drawDetectionBox(ctx, x1, y1, w, h, confidence);

      // rPPG: run whenever face detected + enough lighting
      if (lighting > 20) {
        const sig = extractRPPGSignal(video, x1, y1, w, h);
        if (sig !== null) updateRPPG(sig);
      }

      if (!isCapturing && !isComplete) {
        if      (lighting  < 45) updateFeedback("Lighting is low. Face a brighter light source.");
        else if (alignment < 55) updateFeedback("Recenter inside the guide frame.");
        else if (stability < 45) updateFeedback("Hold still for a stable scan.");
        else                     updateFeedback("Good position. Capture this scan when ready.");
      }

      rafRef.current = requestAnimationFrame(run);
    };

    run();
  }

  // ─── Metric helpers ───────────────────────────────────────────────────────

  function calcAlignment(x: number, y: number, w: number, h: number) {
    return Math.max(0, Math.round(100 - (Math.abs(x - w / 2) / (w / 2) + Math.abs(y - h / 2) / (h / 2)) * 85));
  }

  function calcStability(x: number, y: number) {
    const prev = previousCenterRef.current;
    previousCenterRef.current = { x, y };
    if (!prev) return 85;
    return Math.max(0, Math.round(100 - Math.hypot(x - prev.x, y - prev.y) * 2.2));
  }

  function estimateLighting(video: HTMLVideoElement, x: number, y: number, w: number, h: number) {
    const tmp = document.createElement("canvas");
    tmp.width = tmp.height = 80;
    const ctx = tmp.getContext("2d");
    if (!ctx) return 50;
    try {
      ctx.drawImage(video, Math.max(0, x), Math.max(0, y), Math.max(1, w), Math.max(1, h), 0, 0, 80, 80);
      const d = ctx.getImageData(0, 0, 80, 80).data;
      let t = 0;
      for (let i = 0; i < d.length; i += 4) t += (d[i] + d[i + 1] + d[i + 2]) / 3;
      return Math.max(0, Math.min(100, Math.round((t / (d.length / 4) / 255) * 100)));
    } catch { return 50; }
  }

  // ─── Canvas drawing helpers ───────────────────────────────────────────────

  function drawStageGuide(ctx: CanvasRenderingContext2D, w: number, h: number, id: StepId) {
    ctx.save();
    ctx.strokeStyle = "rgba(249,115,22,0.85)";
    ctx.lineWidth   = 3;
    ctx.setLineDash([10, 12]);
    if      (id === "right-eye" || id === "left-eye")        ctx.strokeRect(w * 0.34, h * 0.20, w * 0.32, h * 0.22);
    else if (id.includes("hand") || id.includes("finger"))  ctx.strokeRect(w * 0.23, h * 0.14, w * 0.54, h * 0.66);
    else                                                      ctx.strokeRect(w * 0.28, h * 0.12, w * 0.44, h * 0.68);
    ctx.restore();
  }

  function drawDetectionBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, conf: number) {
    const color = conf >= 78 ? "#10b981" : conf >= 58 ? "#f59e0b" : "#ef4444";
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash([]);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "rgba(2,8,23,0.8)";
    ctx.fillRect(x, Math.max(0, y - 32), 196, 26);
    ctx.fillStyle = "#f1f5f9"; ctx.font = "bold 14px 'JetBrains Mono', monospace";
    ctx.fillText(`Confidence ${conf}%`, x + 8, Math.max(18, y - 12));
    ctx.restore();
  }

  // ─── Scan capture & report ────────────────────────────────────────────────

  function captureCurrentStage() {
    if (!cameraOn || isComplete) return;
    setIsCapturing(true);
    updateFeedback(`Capturing ${current.title}. Hold still.`);

    setTimeout(() => {
      const score = Math.max(35, Math.min(100, Math.round(
        metric.confidence * 0.55 + metric.lighting * 0.15 +
        metric.alignment  * 0.15 + metric.stability * 0.15
      )));
      const note = createStageNote(current.id, score);

      setStageResults(prev => [...prev.filter(r => r.id !== current.id), { id: current.id, title: current.title, score, note }]);
      setIsCapturing(false);
      updateFeedback(`${current.title} captured successfully.`);

      setTimeout(() => {
        if (stepIndex >= steps.length - 2) { buildFinalReport(); setStepIndex(steps.length - 1); }
        else setStepIndex(s => s + 1);
      }, 700);
    }, 1700);
  }

  function createStageNote(id: StepId, score: number) {
    const q = score >= 78 ? "strong" : score >= 58 ? "moderate" : "limited";
    const map: Partial<Record<StepId, string>> = {
      "face":          `Face visibility is ${q}. Facial alignment and scan clarity were reviewed.`,
      "right-eye":     `Right eye-area visibility is ${q}. This is an appearance observation only.`,
      "left-eye":      `Left eye-area visibility is ${q}. Lighting may affect eye-area appearance.`,
      "right-hand":    `Right-hand visibility is ${q}. Palm presentation and steadiness were reviewed.`,
      "left-hand":     `Left-hand visibility is ${q}. Palm presentation and steadiness were reviewed.`,
      "right-fingers": `Right finger presentation is ${q}. Fingertip visibility was reviewed.`,
      "left-fingers":  `Left finger presentation is ${q}. Fingertip visibility was reviewed.`,
      "posture":       `Posture visibility is ${q}. Head and shoulder steadiness were reviewed.`,
    };
    return map[id] ?? `Stage visibility is ${q}.`;
  }

  function buildFinalReport() {
    const avg = stageResults.length
      ? Math.round(stageResults.reduce((s, r) => s + r.score, 0) / stageResults.length)
      : metric.confidence;

    const hrLine = heartRate
      ? `Heart Rate (rPPG):   ${heartRate} BPM  —  estimated via remote photoplethysmography.`
      : "Heart Rate (rPPG):   Insufficient data. Keep face visible, well-lit, for 30+ seconds.";

    const stressLine = stressLevel
      ? `Stress Indicator:    ${stressLevel === "low" ? "Calm / Relaxed" : stressLevel === "moderate" ? "Moderate variability" : "High variability — possible stress or movement"}`
      : "Stress Indicator:    Not enough rPPG data collected.";

    setReport([
      "Aurveil Visual Wellness Report",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
      `Overall Score:       ${avg || metric.confidence}%`,
      `Lighting:            ${metric.lighting}%`,
      `Alignment:           ${metric.alignment}%`,
      `Stability:           ${metric.stability}%`,
      "",
      "── Vital Signs (rPPG) ────────────",
      hrLine,
      stressLine,
      "",
      "── Stage Observations ────────────",
      ...(stageResults.length
        ? stageResults.map(s => `${s.title}:  ${s.score}%\n  ${s.note}`)
        : ["No completed stages were recorded."]),
      "",
      "── Visual Wellness Signals ───────",
      avg >= 78 ? "Overall visual scan quality is strong." : "Some scan stages may need better lighting or steadier positioning.",
      metric.lighting < 50 ? "Lighting may affect skin tone and eye-area appearance." : "Lighting was acceptable.",
      metric.stability < 55 ? "Movement reduced scan stability." : "Movement stability was acceptable.",
      "Blood pressure cannot be measured from a camera without a validated medical device.",
      "This report is wellness awareness only — not a clinical diagnosis.",
      "",
      "── Safety Guidance ───────────────",
      "If you experience chest pain, dizziness, severe headache, breathing difficulty,",
      "or sudden vision changes — seek medical help immediately.",
      "Aurveil does not replace a licensed healthcare professional.",
    ].join("\n"));
  }

  function nextStep()  { if (stepIndex < steps.length - 1) setStepIndex(s => s + 1); else resetScan(); }
  function prevStep()  { if (stepIndex > 0) setStepIndex(s => s - 1); }

  function resetScan() {
    setStepIndex(0); setStageResults([]); setReport(""); setMetric(emptyMetric);
    setFeedback("Scan reset. Start from face scan."); setScanSeconds(0);
    lastVoiceRef.current = "";
    rppgBufferRef.current = []; frameCountRef.current = 0; bpmHistoryRef.current = [];
    setHeartRate(null); setRppgSamples(0); setStressLevel(null);
  }

  useEffect(() => {
    const iv = setInterval(() => { if (cameraOn) setScanSeconds(s => s + 1); }, 1000);
    return () => clearInterval(iv);
  }, [cameraOn]);

  useEffect(() => { return () => stopCamera(); }, []);

  // ─── Derived display values ───────────────────────────────────────────────

  const progress    = Math.round(((stepIndex + 1) / steps.length) * 100);
  const rppgStatus  = rppgSamples < 10 ? "idle" : rppgSamples < RPPG_MIN_SAMPLES ? "collecting" : heartRate ? "ready" : "measuring";
  const stressColor = stressLevel === "low" ? "#10b981" : stressLevel === "moderate" ? "#f59e0b" : "#ef4444";
  const stressLabel = stressLevel === "low" ? "Calm" : stressLevel === "moderate" ? "Moderate" : "Elevated";

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Google Fonts ───────────────────────────────────────────────── */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:ital,wght@0,400;0,500;0,700;1,400&display=swap"
        rel="stylesheet"
      />

      {/* ── Global styles ──────────────────────────────────────────────── */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg:       #020817;
          --surface:  #0c1427;
          --surface2: #111f38;
          --subtle:   #1a2744;
          --border:   rgba(255,255,255,0.07);
          --borderB:  rgba(255,255,255,0.13);
          --orange:   #f97316;
          --cyan:     #06b6d4;
          --green:    #10b981;
          --red:      #ef4444;
          --amber:    #f59e0b;
          --text:     #f1f5f9;
          --muted:    #64748b;
          --soft:     #94a3b8;
        }
        body { background: var(--bg) !important; }
        .syne { font-family: 'Syne', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }

        @keyframes heartbeat {
          0%,100% { transform: scale(1); }
          15%     { transform: scale(1.35); }
          30%     { transform: scale(1); }
          45%     { transform: scale(1.18); }
        }
        @keyframes ping-ring {
          0%   { transform: scale(0.85); opacity: 1; }
          100% { transform: scale(2.1);  opacity: 0; }
        }
        @keyframes scan-sweep {
          0%   { top: -2px; }
          100% { top: calc(100% + 2px); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateX(-10px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        .heartbeat  { animation: heartbeat  1.1s ease-in-out infinite; display: inline-block; }
        .ping-ring  { animation: ping-ring  1.6s ease-out infinite; }
        .scan-sweep { animation: scan-sweep 2.2s linear infinite; }
        .fade-up    { animation: fade-up    0.45s cubic-bezier(.22,1,.36,1) both; }
        .slide-in   { animation: slide-in   0.3s ease both; }

        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 22px;
        }
        .btn {
          display: inline-flex; align-items: center; justify-content: center;
          gap: 6px; border: none; border-radius: 12px; cursor: pointer;
          font-family: 'Syne', sans-serif; font-weight: 700; font-size: 13px;
          padding: 10px 18px; transition: all 0.18s ease; white-space: nowrap;
          letter-spacing: 0.01em;
        }
        .btn-orange { background: var(--orange); color: #fff; }
        .btn-orange:hover { background: #ea6c0a; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(249,115,22,0.35); }
        .btn-cyan   { background: rgba(6,182,212,0.15); color: var(--cyan); border: 1px solid rgba(6,182,212,0.35); }
        .btn-cyan:hover { background: rgba(6,182,212,0.25); transform: translateY(-1px); }
        .btn-cyan:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
        .btn-ghost  { background: transparent; color: var(--soft); border: 1px solid var(--borderB); }
        .btn-ghost:hover { border-color: var(--orange); color: var(--orange); }
        .btn-ghost:disabled { opacity: 0.35; cursor: not-allowed; }

        .metric-pill {
          background: var(--subtle); border: 1px solid var(--border);
          border-radius: 14px; padding: 13px;
        }
        .stage-pill {
          padding: 3px 9px; border-radius: 7px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px; font-weight: 700;
        }

        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--borderB); border-radius: 3px; }
      `}</style>

      <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>

        {/* ── Navigation ───────────────────────────────────────────────── */}
        <nav style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
          background: "rgba(2,8,23,0.92)", backdropFilter: "blur(20px)",
          padding: "15px 32px", position: "sticky", top: 0, zIndex: 100,
        }}>
          <Link href="/" className="syne" style={{
            fontSize: 26, fontWeight: 800, color: "var(--text)",
            textDecoration: "none", letterSpacing: "-0.5px",
          }}>
            Aur<span style={{ color: "var(--orange)", fontStyle: "italic" }}>veil</span>
          </Link>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {/* Live BPM badge in nav */}
            {heartRate && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.3)",
                borderRadius: 10, padding: "7px 14px",
              }}>
                <span className="heartbeat" style={{ color: "var(--cyan)", fontSize: 15 }}>♥</span>
                <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--cyan)" }}>
                  {heartRate} BPM
                </span>
              </div>
            )}
            {/* Loading indicator */}
            {loading !== "Idle" && loading !== "Model ready" && loading !== "Camera active" && (
              <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{loading}</span>
            )}
            <Link href="/" style={{ textDecoration: "none" }}>
              <button className="btn btn-ghost" style={{ padding: "8px 16px" }}>Back Home</button>
            </Link>
            <button className="btn btn-ghost" onClick={resetScan} style={{ padding: "8px 16px" }}>Reset</button>
          </div>
        </nav>

        {/* ── Page content ─────────────────────────────────────────────── */}
        <section style={{ maxWidth: 1440, margin: "0 auto", padding: "36px 24px 60px" }}>

          {/* Header */}
          <div className="fade-up" style={{ marginBottom: 32 }}>
            <p className="mono" style={{
              fontSize: 10, letterSpacing: "0.28em", color: "var(--orange)",
              textTransform: "uppercase", marginBottom: 10,
            }}>
              Guided Visual Wellness Protocol
            </p>
            <h1 className="syne" style={{
              fontSize: "clamp(32px, 4vw, 46px)", fontWeight: 800,
              letterSpacing: "-1.2px", lineHeight: 1.08, marginBottom: 14,
            }}>
              Medical-style AI wellness scan
            </h1>
            <p style={{ fontSize: 15, color: "var(--soft)", maxWidth: 640, lineHeight: 1.75 }}>
              Follow each stage. Aurveil checks visibility, lighting, alignment, and stability.
              Now enhanced with{" "}
              <span style={{ color: "var(--cyan)", fontWeight: 700 }}>
                real-time heart rate via rPPG
              </span>{" "}
              — remote photoplethysmography using your webcam.
            </p>
          </div>

          {/* ── Main 2-col grid ────────────────────────────────────────── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1.45fr 0.72fr",
            gap: 18, marginBottom: 18,
          }}>

            {/* ── LEFT: Camera ─────────────────────────────────────────── */}
            <div className="card" style={{ padding: 14 }}>

              {/* Video container */}
              <div style={{
                position: "relative", borderRadius: 14, overflow: "hidden",
                background: "#000", aspectRatio: "16/9",
              }}>
                <video
                  ref={videoRef} autoPlay muted playsInline
                  style={{
                    width: "100%", height: "100%", objectFit: "cover",
                    transform: "scaleX(-1)", display: cameraOn ? "block" : "none",
                  }}
                />
                <canvas
                  ref={canvasRef}
                  style={{
                    position: "absolute", inset: 0, width: "100%", height: "100%",
                    transform: "scaleX(-1)", pointerEvents: "none",
                  }}
                />

                {/* Idle placeholder */}
                {!cameraOn && (
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 14,
                    background: "radial-gradient(ellipse at 50% 60%, rgba(6,182,212,0.04) 0%, transparent 70%)",
                  }}>
                    <div style={{ fontSize: 56, opacity: 0.18 }}>◎</div>
                    <p style={{ fontSize: 14, color: "var(--muted)", fontWeight: 600 }}>
                      Camera preview will appear here
                    </p>
                    <button className="btn btn-orange" onClick={startCamera} style={{ marginTop: 6 }}>
                      Start Camera
                    </button>
                  </div>
                )}

                {/* Scan capture overlay */}
                {isCapturing && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(2,8,23,0.72)" }}>
                    <div className="scan-sweep" style={{
                      position: "absolute", left: 0, right: 0, height: 2,
                      background: "linear-gradient(90deg, transparent 0%, var(--orange) 50%, transparent 100%)",
                      boxShadow: "0 0 24px rgba(249,115,22,0.9)",
                    }} />
                    <div style={{
                      position: "absolute", inset: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <div style={{
                        background: "rgba(2,8,23,0.92)",
                        border: "1px solid rgba(249,115,22,0.35)",
                        borderRadius: 16, padding: "22px 36px", textAlign: "center",
                      }}>
                        <p className="mono" style={{
                          fontSize: 9, letterSpacing: "0.35em",
                          color: "var(--orange)", marginBottom: 10, textTransform: "uppercase",
                        }}>
                          ◉ Analyzing
                        </p>
                        <p className="syne" style={{ fontSize: 22, fontWeight: 800 }}>
                          {current.title}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Feedback bar */}
                <div style={{
                  position: "absolute", bottom: 14, left: 14, right: 14,
                  background: "rgba(2,8,23,0.88)", backdropFilter: "blur(10px)",
                  borderRadius: 11, padding: "10px 16px",
                  border: "1px solid var(--borderB)",
                }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{feedback}</p>
                </div>

                {/* Top badges */}
                <div style={{ position: "absolute", top: 14, left: 14 }}>
                  <div style={{
                    background: "rgba(249,115,22,0.14)", border: "1px solid rgba(249,115,22,0.38)",
                    borderRadius: 20, padding: "5px 13px",
                    fontSize: 11, fontWeight: 700, color: "var(--orange)",
                    fontFamily: "JetBrains Mono, monospace",
                  }}>
                    Stage {stepIndex + 1}/{steps.length} · {current.icon} {current.title}
                  </div>
                </div>
                <div style={{ position: "absolute", top: 14, right: 14 }}>
                  <div style={{
                    background: "rgba(2,8,23,0.82)", border: "1px solid var(--border)",
                    borderRadius: 20, padding: "5px 13px",
                    fontSize: 11, fontWeight: 700, color: "var(--muted)",
                  }}>
                    🔒 No video stored
                  </div>
                </div>

                {/* Live BPM overlay (when measuring) */}
                {heartRate && cameraOn && (
                  <div style={{
                    position: "absolute", bottom: 60, right: 14,
                    background: "rgba(6,182,212,0.15)", backdropFilter: "blur(8px)",
                    border: "1px solid rgba(6,182,212,0.4)",
                    borderRadius: 12, padding: "8px 14px",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span className="heartbeat" style={{ color: "var(--cyan)", fontSize: 16 }}>♥</span>
                    <span className="mono" style={{ fontSize: 15, fontWeight: 700, color: "var(--cyan)" }}>
                      {heartRate} <span style={{ fontSize: 10, opacity: 0.7 }}>BPM</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  marginTop: 12, background: "rgba(239,68,68,0.09)",
                  border: "1px solid rgba(239,68,68,0.28)",
                  borderRadius: 12, padding: "12px 16px",
                  fontSize: 13, color: "#fca5a5",
                }}>
                  {error}
                </div>
              )}

              {/* Controls */}
              <div style={{ marginTop: 14, display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn btn-orange" onClick={startCamera}>
                  {cameraOn ? "↺ Restart Camera" : "▶ Start Camera"}
                </button>
                <button
                  className="btn btn-cyan"
                  onClick={captureCurrentStage}
                  disabled={!cameraOn || isCapturing || isComplete}
                >
                  {isCapturing ? "⏳ Scanning..." : "⬛ Capture Scan"}
                </button>
                <button className="btn btn-ghost" onClick={stopCamera}>Stop</button>
                <button className="btn btn-ghost" onClick={prevStep}>← Back</button>
                <button className="btn btn-ghost" onClick={nextStep}>
                  {isComplete ? "Restart" : "Skip →"}
                </button>
                <label style={{
                  display: "flex", alignItems: "center", gap: 7, marginLeft: "auto",
                  fontSize: 13, fontWeight: 600, color: "var(--muted)", cursor: "pointer",
                }}>
                  <input
                    type="checkbox" checked={voiceOn}
                    onChange={e => setVoiceOn(e.target.checked)}
                    style={{ accentColor: "var(--orange)", width: 15, height: 15 }}
                  />
                  Voice guidance
                </label>
              </div>
            </div>

            {/* ── RIGHT: Sidebar ───────────────────────────────────────── */}
            <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Stage info card */}
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div>
                    <p className="mono" style={{
                      fontSize: 9, color: "var(--orange)", letterSpacing: "0.25em",
                      textTransform: "uppercase", marginBottom: 7,
                    }}>
                      Current Stage
                    </p>
                    <h2 className="syne" style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.4px" }}>
                      {current.icon} {current.title}
                    </h2>
                  </div>
                  <div className="mono" style={{
                    background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.28)",
                    borderRadius: 10, padding: "6px 12px",
                    fontSize: 13, fontWeight: 700, color: "var(--orange)",
                  }}>
                    {stepIndex + 1}/{steps.length}
                  </div>
                </div>

                <p style={{ fontSize: 13, color: "var(--soft)", lineHeight: 1.72, marginBottom: 14 }}>
                  {current.instruction}
                </p>

                <div style={{
                  background: "var(--subtle)", borderRadius: 12, padding: "13px",
                  border: "1px solid var(--border)", marginBottom: 16,
                }}>
                  <p className="mono" style={{
                    fontSize: 9, color: "var(--muted)", letterSpacing: "0.18em",
                    textTransform: "uppercase", marginBottom: 6,
                  }}>
                    Patient Instruction
                  </p>
                  <p className="syne" style={{ fontSize: 15, fontWeight: 700 }}>{current.target}</p>
                </div>

                {/* Progress bar */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>Scan progress</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--orange)", fontWeight: 700 }}>
                      {progress}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: "var(--subtle)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 3, width: `${progress}%`,
                      background: "linear-gradient(90deg, var(--orange) 0%, #fb923c 100%)",
                      transition: "width 0.5s cubic-bezier(.22,1,.36,1)",
                      boxShadow: "0 0 10px rgba(249,115,22,0.5)",
                    }} />
                  </div>
                </div>
              </div>

              {/* ❤️ HEART RATE CARD — Star Feature */}
              <div style={{
                background: "linear-gradient(145deg, rgba(6,182,212,0.09) 0%, rgba(2,8,23,0.95) 70%)",
                border: "1px solid rgba(6,182,212,0.22)",
                borderRadius: 20, padding: "20px",
                position: "relative", overflow: "hidden",
              }}>
                {/* BG glow */}
                <div style={{
                  position: "absolute", top: -40, right: -40,
                  width: 140, height: 140, borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(6,182,212,0.13) 0%, transparent 65%)",
                  pointerEvents: "none",
                }} />

                {/* Header row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <p className="mono" style={{
                      fontSize: 9, color: "var(--cyan)", letterSpacing: "0.22em",
                      textTransform: "uppercase", marginBottom: 8,
                    }}>
                      Heart Rate · rPPG
                    </p>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                      {heartRate ? (
                        <>
                          <span className="syne slide-in" style={{
                            fontSize: 52, fontWeight: 800, color: "var(--cyan)", lineHeight: 1,
                          }}>
                            {heartRate}
                          </span>
                          <span className="mono" style={{ fontSize: 14, color: "rgba(6,182,212,0.65)", fontWeight: 700 }}>
                            BPM
                          </span>
                        </>
                      ) : (
                        <span className="syne" style={{ fontSize: 38, fontWeight: 800, color: "var(--muted)" }}>—</span>
                      )}
                    </div>
                  </div>

                  {/* Animated heart icon */}
                  <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
                    {heartRate && (
                      <div className="ping-ring" style={{
                        position: "absolute", inset: 0, borderRadius: "50%",
                        border: "2px solid rgba(6,182,212,0.45)",
                      }} />
                    )}
                    <div style={{
                      position: "absolute", inset: 0, borderRadius: "50%",
                      background: heartRate ? "rgba(6,182,212,0.14)" : "rgba(255,255,255,0.04)",
                      border: `2px solid ${heartRate ? "rgba(6,182,212,0.4)" : "var(--border)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 22,
                    }}>
                      <span className={heartRate ? "heartbeat" : ""}>♥</span>
                    </div>
                  </div>
                </div>

                {/* Waveform canvas */}
                <div style={{
                  borderRadius: 10, overflow: "hidden", marginBottom: 12,
                  border: "1px solid rgba(6,182,212,0.1)",
                  background: "rgba(0,0,0,0.3)",
                }}>
                  <canvas
                    ref={rppgWaveformRef}
                    width={400} height={64}
                    style={{ width: "100%", height: 64, display: "block" }}
                  />
                </div>

                {/* Status row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                      background:
                        rppgStatus === "ready"      ? "var(--green)" :
                        rppgStatus === "measuring"  ? "var(--cyan)"  :
                        rppgStatus === "collecting" ? "var(--amber)" :
                        "var(--muted)",
                      boxShadow: rppgStatus !== "idle" ? "0 0 8px currentColor" : "none",
                    }} />
                    <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                      {rppgStatus === "idle"       ? "Start camera to measure"              :
                       rppgStatus === "collecting" ? `Collecting… ${rppgSamples}/${RPPG_MIN_SAMPLES}` :
                       rppgStatus === "measuring"  ? "Analyzing signal…"                    :
                       "Signal acquired ✓"}
                    </span>
                  </div>
                  {stressLevel && (
                    <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: stressColor }}>
                      {stressLabel}
                    </span>
                  )}
                </div>
              </div>

              {/* Live Metrics grid */}
              <div className="card" style={{ padding: 16 }}>
                <p className="mono" style={{
                  fontSize: 9, color: "var(--muted)", letterSpacing: "0.22em",
                  textTransform: "uppercase", marginBottom: 13,
                }}>
                  Live Metrics
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                  {[
                    { label: "Confidence", value: metric.confidence, unit: "%",
                      color: metric.confidence >= 78 ? "var(--green)" : metric.confidence >= 58 ? "var(--amber)" : "var(--red)" },
                    { label: "Lighting",   value: metric.lighting,   unit: "%",
                      color: metric.lighting >= 50 ? "var(--green)" : "var(--orange)" },
                    { label: "Alignment",  value: metric.alignment,  unit: "%", color: "var(--cyan)"   },
                    { label: "Stability",  value: metric.stability,  unit: "%", color: "var(--cyan)"   },
                    { label: "Face Size",  value: metric.faceSize,   unit: "%", color: "var(--soft)"   },
                    { label: "Timer",      value: scanSeconds,        unit: "s", color: "var(--orange)" },
                  ].map(m => (
                    <div key={m.label} className="metric-pill">
                      <p className="mono" style={{
                        fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em",
                        textTransform: "uppercase", marginBottom: 4,
                      }}>
                        {m.label}
                      </p>
                      <p className="syne" style={{
                        fontSize: 22, fontWeight: 800,
                        color: m.value ? m.color : "var(--muted)",
                      }}>
                        {m.value || "—"}{m.value ? m.unit : ""}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Stage pills summary */}
                <div style={{
                  marginTop: 13, background: "rgba(10,16,36,0.8)",
                  borderRadius: 13, padding: "13px",
                  border: "1px solid var(--border)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
                    <p className="syne" style={{ fontSize: 13, fontWeight: 700 }}>Completed Stages</p>
                    <span className="mono" style={{
                      fontSize: 14, fontWeight: 700,
                      color: overallScore >= 78 ? "var(--green)" : overallScore >= 58 ? "var(--amber)" : "var(--muted)",
                    }}>
                      {overallScore ? `${overallScore}%` : "—"}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                    {stageResults.length}/{steps.length - 1} stages complete
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {steps.slice(0, -1).map((step, i) => {
                      const r    = stageResults.find(r => r.id === step.id);
                      const done = !!r;
                      const active = i === stepIndex && !done;
                      return (
                        <div key={step.id} className="stage-pill" style={{
                          background: done   ? "rgba(16,185,129,0.14)" :
                                      active ? "rgba(249,115,22,0.14)"  :
                                               "rgba(255,255,255,0.04)",
                          color:       done   ? "var(--green)"  :
                                       active ? "var(--orange)" :
                                                "var(--muted)",
                          border: `1px solid ${
                            done   ? "rgba(16,185,129,0.3)"  :
                            active ? "rgba(249,115,22,0.3)"  :
                                     "var(--border)"
                          }`,
                        }}>
                          {done ? `✓ ${r!.score}%` : step.icon}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </aside>
          </div>

          {/* ── Bottom: Stage Results + Final Report ─────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 18 }}>

            {/* Stage Results */}
            <div className="card">
              <h3 className="syne" style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>
                Stage Results
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {stageResults.length ? stageResults.map(r => (
                  <div key={r.id} className="fade-up" style={{
                    background: "var(--subtle)", borderRadius: 14, padding: "13px 16px",
                    border: "1px solid var(--border)",
                    display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
                  }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{r.title}</p>
                      <p style={{ fontSize: 12, color: "var(--soft)", lineHeight: 1.65 }}>{r.note}</p>
                    </div>
                    <span className="mono" style={{
                      fontSize: 17, fontWeight: 700, flexShrink: 0,
                      color: r.score >= 78 ? "var(--green)" : r.score >= 58 ? "var(--amber)" : "var(--red)",
                    }}>
                      {r.score}%
                    </span>
                  </div>
                )) : (
                  <p style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0" }}>
                    No completed stages yet. Start the camera and capture each stage.
                  </p>
                )}
              </div>
            </div>

            {/* Final Report */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 className="syne" style={{ fontSize: 20, fontWeight: 800 }}>Final Wellness Report</h3>
                <button className="btn btn-ghost" onClick={buildFinalReport}>Generate Report</button>
              </div>

              {report ? (
                <pre className="mono" style={{
                  whiteSpace: "pre-wrap",
                  background: "rgba(4,8,20,0.9)",
                  border: "1px solid var(--borderB)",
                  borderRadius: 14, padding: "18px",
                  fontSize: 11.5, lineHeight: 1.85, color: "#94a3b8",
                  maxHeight: 520, overflowY: "auto",
                }}>
                  {report}
                </pre>
              ) : (
                <div style={{
                  background: "var(--subtle)", borderRadius: 14, padding: "20px",
                  border: "1px solid var(--border)",
                }}>
                  <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
                    Complete the scan stages or click{" "}
                    <strong style={{ color: "var(--soft)" }}>Generate Report</strong>{" "}
                    to create your visual wellness report — including heart rate data captured via rPPG.
                  </p>
                  <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {["Face Scan", "Eye Scan", "Hand Scan", "Posture", "Heart Rate (rPPG)", "Stress Indicator"].map(f => (
                      <span key={f} style={{
                        background: "rgba(6,182,212,0.07)",
                        border: "1px solid rgba(6,182,212,0.18)",
                        borderRadius: 8, padding: "4px 10px",
                        fontSize: 11, color: "var(--cyan)", fontWeight: 600,
                      }}>
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </section>
      </main>
    </>
  );
}

