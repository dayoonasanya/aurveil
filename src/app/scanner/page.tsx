"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type ScanQuality = {
  face: number;
  confidence: number;
  lighting: number;
  alignment: number;
  stability: number;
};

type Observation = {
  label: string;
  value: string;
  tone: "good" | "warn" | "info";
};

export default function ScannerPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const previousCenterRef = useRef<{ x: number; y: number } | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [loading, setLoading] = useState("Idle");
  const [feedback, setFeedback] = useState("Start camera to begin.");
  const [faceDetected, setFaceDetected] = useState(false);
  const [quality, setQuality] = useState<ScanQuality>({
    face: 0,
    confidence: 0,
    lighting: 0,
    alignment: 0,
    stability: 0,
  });
  const [observations, setObservations] = useState<Observation[]>([]);
  const [canScan, setCanScan] = useState(false);
  const [report, setReport] = useState("");
  const [error, setError] = useState("");

  async function loadModel() {
    if (modelRef.current) return modelRef.current;

    setLoading("Loading face intelligence model...");
    const blazeface = await import("@tensorflow-models/blazeface");
    await import("@tensorflow/tfjs");

    modelRef.current = await blazeface.load();
    setLoading("Model ready");
    return modelRef.current;
  }

  async function enableCamera() {
    try {
      setError("");
      setReport("");
      setLoading("Requesting camera access...");

      const model = await loadModel();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraOn(true);
      setLoading("Camera active");
      setFeedback("Align your face inside the frame and hold still.");

      detectLoop(model);
    } catch {
      setError("Camera could not be opened. Please allow camera permission and try again.");
      setLoading("Camera error");
      setFeedback("Camera permission is required to scan.");
    }
  }

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setCameraOn(false);
    setFaceDetected(false);
    setCanScan(false);
    setFeedback("Camera stopped.");
  }

  async function detectLoop(model: any) {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const run = async () => {
      if (!video.videoWidth || !video.videoHeight) {
        rafRef.current = requestAnimationFrame(run);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let predictions: any[] = [];

      try {
        predictions = await model.estimateFaces(video, false);
      } catch {
        predictions = [];
      }

      if (!predictions.length) {
        setFaceDetected(false);
        setCanScan(false);
        setFeedback("No face detected. Move into the frame.");
        setQuality({ face: 0, confidence: 0, lighting: 0, alignment: 0, stability: 0 });
        setObservations([
          { label: "Face visibility", value: "No face detected", tone: "warn" },
          { label: "Scan readiness", value: "Waiting for clear face alignment", tone: "info" },
        ]);
        rafRef.current = requestAnimationFrame(run);
        return;
      }

      const face = predictions[0];
      const [x1, y1] = face.topLeft;
      const [x2, y2] = face.bottomRight;
      const w = x2 - x1;
      const h = y2 - y1;
      const confidence = Math.round(((face.probability?.[0] || 0) * 100));

      const centerX = x1 + w / 2;
      const centerY = y1 + h / 2;
      const frameCenterX = canvas.width / 2;
      const frameCenterY = canvas.height / 2;

      const offsetX = Math.abs(centerX - frameCenterX) / frameCenterX;
      const offsetY = Math.abs(centerY - frameCenterY) / frameCenterY;
      const alignment = Math.max(0, Math.round(100 - (offsetX + offsetY) * 90));

      const faceArea = (w * h) / (canvas.width * canvas.height);
      const faceScore = Math.max(0, Math.min(100, Math.round(faceArea * 420)));

      const lighting = estimateLighting(video, x1, y1, w, h);

      const previousCenter = previousCenterRef.current;
      let stability = 85;

      if (previousCenter) {
        const movement = Math.hypot(centerX - previousCenter.x, centerY - previousCenter.y);
        stability = Math.max(0, Math.round(100 - movement * 2.5));
      }

      previousCenterRef.current = { x: centerX, y: centerY };

      const finalConfidence = Math.round(
        confidence * 0.35 + alignment * 0.25 + lighting * 0.2 + stability * 0.1 + faceScore * 0.1
      );

      const nextQuality = {
        face: faceScore,
        confidence: finalConfidence,
        lighting,
        alignment,
        stability,
      };

      setQuality(nextQuality);
      setFaceDetected(true);

      ctx.strokeStyle = finalConfidence >= 75 ? "#10b981" : finalConfidence >= 55 ? "#f59e0b" : "#ef4444";
      ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, w, h);

      ctx.fillStyle =
        finalConfidence >= 75
          ? "rgba(16,185,129,0.16)"
          : finalConfidence >= 55
          ? "rgba(245,158,11,0.16)"
          : "rgba(239,68,68,0.16)";
      ctx.fillRect(x1, y1, w, h);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px Arial";
      ctx.fillText(`Face ${finalConfidence}%`, x1 + 10, Math.max(28, y1 - 10));

      const nextObservations = buildObservations(nextQuality);
      setObservations(nextObservations);

      if (finalConfidence >= 72) {
        setCanScan(true);
        setFeedback("Good scan quality. Hold still and run wellness scan.");
      } else if (lighting < 55) {
        setCanScan(false);
        setFeedback("Lighting is weak. Face a brighter light source.");
      } else if (alignment < 65) {
        setCanScan(false);
        setFeedback("Recenter your face inside the frame.");
      } else if (stability < 55) {
        setCanScan(false);
        setFeedback("Movement detected. Hold still for a clearer scan.");
      } else {
        setCanScan(false);
        setFeedback("Move closer and improve lighting.");
      }

      rafRef.current = requestAnimationFrame(run);
    };

    run();
  }

  function estimateLighting(video: HTMLVideoElement, x: number, y: number, w: number, h: number) {
    const temp = document.createElement("canvas");
    const sampleW = 80;
    const sampleH = 80;

    temp.width = sampleW;
    temp.height = sampleH;

    const tctx = temp.getContext("2d");
    if (!tctx) return 50;

    const sx = Math.max(0, x);
    const sy = Math.max(0, y);
    const sw = Math.max(1, w);
    const sh = Math.max(1, h);

    try {
      tctx.drawImage(video, sx, sy, sw, sh, 0, 0, sampleW, sampleH);
      const data = tctx.getImageData(0, 0, sampleW, sampleH).data;

      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        total += brightness;
      }

      const average = total / (data.length / 4);
      return Math.max(0, Math.min(100, Math.round((average / 255) * 100)));
    } catch {
      return 50;
    }
  }

  function buildObservations(q: ScanQuality): Observation[] {
    const obs: Observation[] = [];

    obs.push({
      label: "Face visibility",
      value: q.face >= 45 ? "Face is clearly visible" : "Move closer to the camera",
      tone: q.face >= 45 ? "good" : "warn",
    });

    obs.push({
      label: "Lighting",
      value:
        q.lighting >= 65
          ? "Lighting looks stable"
          : q.lighting >= 45
          ? "Lighting is moderate"
          : "Lighting is too low",
      tone: q.lighting >= 65 ? "good" : "warn",
    });

    obs.push({
      label: "Alignment",
      value:
        q.alignment >= 75
          ? "Face is centered"
          : q.alignment >= 55
          ? "Face is slightly off-center"
          : "Recenter your face",
      tone: q.alignment >= 75 ? "good" : q.alignment >= 55 ? "info" : "warn",
    });

    obs.push({
      label: "Stability",
      value:
        q.stability >= 70
          ? "Movement is stable"
          : q.stability >= 45
          ? "Small movement detected"
          : "Hold still for better scan",
      tone: q.stability >= 70 ? "good" : "warn",
    });

    return obs;
  }

  function runWellnessScan() {
    const possibleSignals = [];

    if (quality.lighting < 55) {
      possibleSignals.push("Lighting may affect how skin tone and eye area appear.");
    }

    if (quality.alignment < 75) {
      possibleSignals.push("Face alignment is not perfect, so symmetry observations may be limited.");
    }

    if (quality.stability < 65) {
      possibleSignals.push("Movement may reduce scan clarity. A still scan improves consistency.");
    }

    if (quality.confidence >= 80) {
      possibleSignals.push("Scan quality is strong enough for a useful visual wellness check.");
    }

    const generated = `
Aurveil Visual Wellness Report

Scan confidence: ${quality.confidence}%
Lighting score: ${quality.lighting}%
Alignment score: ${quality.alignment}%
Stability score: ${quality.stability}%

Visual observations:
${possibleSignals.length ? possibleSignals.map((s) => `- ${s}`).join("\n") : "- Face is visible and scan conditions look generally stable."}

Wellness guidance:
- Use consistent lighting when comparing scans over time.
- If you notice real symptoms, pain, dizziness, chest discomfort, weakness, or sudden facial changes, contact a licensed healthcare professional.
- This scan is for visual wellness awareness only. It is not a diagnosis and cannot measure blood pressure directly.

Experimental feature direction:
Aurveil can later combine visual signals with wearable data to estimate wellness trends more responsibly.
    `.trim();

    setReport(generated);
  }

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const scoreTone =
    quality.confidence >= 75
      ? "text-emerald-600"
      : quality.confidence >= 55
      ? "text-amber-600"
      : "text-red-600";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <nav className="flex items-center justify-between border-b bg-white px-8 py-4">
        <Link href="/" className="font-serif text-3xl">
          Aur<span className="italic text-orange-500">veil</span>
        </Link>

        <Button asChild variant="outline">
          <Link href="/">Back Home</Link>
        </Button>
      </nav>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-3xl font-black">Live Visual Wellness Scan</h1>
        <p className="mt-2 text-slate-600">
          Experimental camera-based wellness awareness. It does not diagnose illness or measure blood pressure.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`h-full w-full scale-x-[-1] object-cover ${cameraOn ? "block" : "hidden"}`}
              />

              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full scale-x-[-1]"
              />

              {!cameraOn && (
                <div className="flex h-full items-center justify-center text-slate-400">
                  Camera preview will appear here
                </div>
              )}

              <div className="absolute inset-[12%_22%] rounded-2xl border-2 border-dashed border-orange-400/80" />

              <div className="absolute bottom-4 left-4 max-w-[80%] rounded-lg bg-black/60 px-3 py-2 text-sm text-white">
                {feedback}
              </div>

              <div className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-slate-900">
                No video stored
              </div>
            </div>

            {error && (
              <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </p>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Button
                onClick={enableCamera}
                className="rounded-xl bg-orange-500 font-bold text-white hover:bg-orange-600"
              >
                {cameraOn ? "Restart Camera" : "Enable Camera"}
              </Button>

              <Button onClick={stopCamera} variant="outline" className="rounded-xl">
                Stop Camera
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Scan Intelligence</h2>

            <div className="mt-5 space-y-4 text-sm">
              <StatusRow label="Human Detected" value={faceDetected ? "Yes" : "—"} />
              <StatusRow label="Scan Confidence" value={`${quality.confidence || "—"}${quality.confidence ? "%" : ""}`} valueClass={scoreTone} />
              <StatusRow label="Lighting" value={`${quality.lighting || "—"}${quality.lighting ? "%" : ""}`} />
              <StatusRow label="Alignment" value={`${quality.alignment || "—"}${quality.alignment ? "%" : ""}`} />
              <StatusRow label="Stability" value={`${quality.stability || "—"}${quality.stability ? "%" : ""}`} />
            </div>

            <div className="mt-6 rounded-2xl bg-slate-50 p-4">
              <h3 className="font-black">Live Observations</h3>
              <div className="mt-3 space-y-3">
                {observations.length ? (
                  observations.map((item) => (
                    <div key={item.label} className="flex justify-between gap-4 border-b pb-2 text-sm last:border-b-0">
                      <span className="text-slate-500">{item.label}</span>
                      <strong
                        className={
                          item.tone === "good"
                            ? "text-emerald-600"
                            : item.tone === "warn"
                            ? "text-amber-600"
                            : "text-slate-700"
                        }
                      >
                        {item.value}
                      </strong>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">Start camera to generate observations.</p>
                )}
              </div>
            </div>

            <Button
              disabled={!canScan}
              onClick={runWellnessScan}
              className="mt-6 w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800 disabled:bg-slate-300"
            >
              Run Wellness Scan →
            </Button>

            <p className="mt-3 text-xs leading-5 text-slate-500">
              AI BP and sickness prediction should only be used as future research language unless connected to validated medical devices or licensed clinical review.
            </p>
          </div>
        </div>

        {report && (
          <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black">Visual Wellness Report</h2>
            <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-950 p-5 text-sm leading-7 text-slate-100">
              {report}
            </pre>
          </section>
        )}
      </section>
    </main>
  );
}

function StatusRow({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between border-b pb-3">
      <span className="text-slate-500">{label}</span>
      <strong className={valueClass}>{value}</strong>
    </div>
  );
}
