"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type StepId =
  | "face"
  | "right-eye"
  | "left-eye"
  | "right-hand"
  | "left-hand"
  | "right-fingers"
  | "left-fingers"
  | "posture"
  | "complete";

type Step = {
  id: StepId;
  title: string;
  instruction: string;
  target: string;
  guide: string;
};

const steps: Step[] = [
  {
    id: "face",
    title: "Face Scan",
    instruction: "Position your full face clearly inside the frame.",
    target: "Face centered, good light, steady posture.",
    guide: "👤",
  },
  {
    id: "right-eye",
    title: "Right Eye Scan",
    instruction: "Move closer and show your right eye clearly.",
    target: "Right eye visible and stable.",
    guide: "◉",
  },
  {
    id: "left-eye",
    title: "Left Eye Scan",
    instruction: "Now show your left eye clearly.",
    target: "Left eye visible and stable.",
    guide: "◉",
  },
  {
    id: "right-hand",
    title: "Right Hand Scan",
    instruction: "Raise your right hand and open your palm toward the camera.",
    target: "Open palm visible near the face or camera.",
    guide: "🖐",
  },
  {
    id: "left-hand",
    title: "Left Hand Scan",
    instruction: "Raise your left hand and open your palm toward the camera.",
    target: "Open palm visible near the face or camera.",
    guide: "🖐",
  },
  {
    id: "right-fingers",
    title: "Right Finger Scan",
    instruction: "Show each right-hand finger one by one. Keep the fingertip close to the camera.",
    target: "Finger close, stable, and well lit.",
    guide: "☝",
  },
  {
    id: "left-fingers",
    title: "Left Finger Scan",
    instruction: "Now show each left-hand finger one by one. Keep the fingertip close to the camera.",
    target: "Finger close, stable, and well lit.",
    guide: "☝",
  },
  {
    id: "posture",
    title: "Posture Scan",
    instruction: "Sit upright, relax your shoulders, and keep your head straight.",
    target: "Head and shoulder alignment visible.",
    guide: "🧍",
  },
  {
    id: "complete",
    title: "Final Wellness Report",
    instruction: "All scan stages are complete. Review your wellness report below.",
    target: "Report ready.",
    guide: "✓",
  },
];

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
  status: "complete" | "partial" | "pending";
  note: string;
};

const safeDefaultMetric: Metric = {
  confidence: 0,
  lighting: 0,
  alignment: 0,
  stability: 0,
  faceSize: 0,
};

export default function ScannerPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const previousCenterRef = useRef<{ x: number; y: number } | null>(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [cameraOn, setCameraOn] = useState(false);
  const [loading, setLoading] = useState("Idle");
  const [feedback, setFeedback] = useState("Start the camera to begin.");
  const [metric, setMetric] = useState<Metric>(safeDefaultMetric);
  const [stageResults, setStageResults] = useState<StageResult[]>([]);
  const [report, setReport] = useState("");
  const [error, setError] = useState("");
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [scanSeconds, setScanSeconds] = useState(0);
  const [fingerCount, setFingerCount] = useState(0);

  const current = steps[stepIndex];
  const isComplete = current.id === "complete";

  const overallScore = useMemo(() => {
    if (!stageResults.length) return 0;
    const completed = stageResults.filter((s) => s.status === "complete");
    if (!completed.length) return 0;
    return Math.round(completed.reduce((sum, r) => sum + r.score, 0) / completed.length);
  }, [stageResults]);

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

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

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
      setFeedback("Camera is active. Follow the current scan instruction.");
      detectionLoop(model);
    } catch {
      setError("Camera could not be opened. Please allow camera permission and try again.");
      setLoading("Camera error");
      setFeedback("Camera permission is required.");
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
    setFeedback("Camera stopped.");
  }

  async function detectionLoop(model: any) {
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

      drawGuideOverlay(ctx, canvas.width, canvas.height, current.id);

      let faces: any[] = [];
      try {
        faces = await model.estimateFaces(video, false);
      } catch {
        faces = [];
      }

      if (!faces.length) {
        setMetric(safeDefaultMetric);
        setFeedback("No face detected. Move into the frame.");
        rafRef.current = requestAnimationFrame(run);
        return;
      }

      const f = faces[0];
      const [x1, y1] = f.topLeft;
      const [x2, y2] = f.bottomRight;

      const width = x2 - x1;
      const height = y2 - y1;
      const centerX = x1 + width / 2;
      const centerY = y1 + height / 2;

      const confidenceRaw = Math.round(((f.probability?.[0] || 0) * 100));
      const faceSize = Math.min(100, Math.round(((width * height) / (canvas.width * canvas.height)) * 450));
      const alignment = calculateAlignment(centerX, centerY, canvas.width, canvas.height);
      const lighting = estimateLighting(video, x1, y1, width, height);
      const stability = calculateStability(centerX, centerY);

      const confidence = Math.round(
        confidenceRaw * 0.35 + alignment * 0.25 + lighting * 0.2 + stability * 0.1 + faceSize * 0.1
      );

      const nextMetric = { confidence, lighting, alignment, stability, faceSize };
      setMetric(nextMetric);

      drawFaceBox(ctx, x1, y1, width, height, confidence);
      validateCurrentStage(nextMetric);

      rafRef.current = requestAnimationFrame(run);
    };

    run();
  }

  function calculateAlignment(x: number, y: number, w: number, h: number) {
    const offsetX = Math.abs(x - w / 2) / (w / 2);
    const offsetY = Math.abs(y - h / 2) / (h / 2);
    return Math.max(0, Math.round(100 - (offsetX + offsetY) * 85));
  }

  function calculateStability(x: number, y: number) {
    const previous = previousCenterRef.current;
    previousCenterRef.current = { x, y };

    if (!previous) return 85;

    const movement = Math.hypot(x - previous.x, y - previous.y);
    return Math.max(0, Math.round(100 - movement * 2.2));
  }

  function estimateLighting(video: HTMLVideoElement, x: number, y: number, w: number, h: number) {
    const temp = document.createElement("canvas");
    temp.width = 80;
    temp.height = 80;

    const ctx = temp.getContext("2d");
    if (!ctx) return 50;

    try {
      ctx.drawImage(video, Math.max(0, x), Math.max(0, y), Math.max(1, w), Math.max(1, h), 0, 0, 80, 80);
      const data = ctx.getImageData(0, 0, 80, 80).data;

      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        total += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }

      return Math.max(0, Math.min(100, Math.round((total / (data.length / 4) / 255) * 100)));
    } catch {
      return 50;
    }
  }

  function drawGuideOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, id: StepId) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 107, 53, 0.9)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 12]);

    if (id === "right-eye" || id === "left-eye") {
      ctx.strokeRect(w * 0.35, h * 0.22, w * 0.3, h * 0.2);
    } else if (id.includes("hand") || id.includes("finger")) {
      ctx.strokeRect(w * 0.25, h * 0.18, w * 0.5, h * 0.62);
    } else {
      ctx.strokeRect(w * 0.28, h * 0.12, w * 0.44, h * 0.68);
    }

    ctx.restore();
  }

  function drawFaceBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, confidence: number) {
    const color = confidence >= 78 ? "#10b981" : confidence >= 58 ? "#f59e0b" : "#ef4444";

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
    ctx.fillRect(x, Math.max(0, y - 34), 170, 28);

    ctx.fillStyle = "white";
    ctx.font = "bold 16px Arial";
    ctx.fillText(`Scan confidence ${confidence}%`, x + 8, Math.max(20, y - 14));
    ctx.restore();
  }

  function validateCurrentStage(q: Metric) {
    if (isComplete) return;

    let pass = false;
    let note = "";

    if (current.id === "face") {
      pass = q.confidence >= 72 && q.faceSize >= 25 && q.alignment >= 65;
      note = pass ? "Face scan captured clearly." : "Center your face and improve lighting.";
    }

    if (current.id === "right-eye" || current.id === "left-eye") {
      pass = q.confidence >= 68 && q.faceSize >= 42;
      note = pass ? `${current.title} captured for visual awareness.` : "Move closer so the eye area is clearer.";
    }

    if (current.id === "right-hand" || current.id === "left-hand") {
      pass = q.lighting >= 45 && q.stability >= 45;
      note = pass ? `${current.title} stage completed.` : "Raise your open palm steadily in front of the camera.";
    }

    if (current.id === "right-fingers" || current.id === "left-fingers") {
      pass = q.lighting >= 45 && q.stability >= 45;
      note = pass ? `${current.title} stage completed.` : "Place fingertip closer and hold still.";
      if (pass) setFingerCount((value) => Math.min(5, value + 1));
    }

    if (current.id === "posture") {
      pass = q.alignment >= 60 && q.stability >= 55;
      note = pass ? "Posture scan completed." : "Sit upright and keep your head straight.";
    }

    setFeedback(note);

    if (pass) {
      saveStageResult(current, q.confidence, note);

      if (autoAdvance) {
        setTimeout(() => {
          setStepIndex((index) => {
            if (index >= steps.length - 2) {
              buildFinalReport();
              return steps.length - 1;
            }
            return index + 1;
          });
        }, 900);
      }
    }
  }

  function saveStageResult(step: Step, score: number, note: string) {
    setStageResults((previous) => {
      const existing = previous.filter((r) => r.id !== step.id);
      return [
        ...existing,
        {
          id: step.id,
          title: step.title,
          score,
          status: "complete",
          note,
        },
      ];
    });
  }

  function buildFinalReport() {
    const completed = stageResults;
    const average = completed.length
      ? Math.round(completed.reduce((sum, r) => sum + r.score, 0) / completed.length)
      : metric.confidence;

    const notes = [
      `Overall scan quality: ${average || metric.confidence}%`,
      `Lighting score: ${metric.lighting}%`,
      `Alignment score: ${metric.alignment}%`,
      `Stability score: ${metric.stability}%`,
      "",
      "Visual wellness observations:",
      "- The scan reviewed face positioning, eye-area visibility, hand/finger presentation, and posture stability.",
      "- Results are based on camera visibility, lighting, movement, and alignment.",
      "- This system does not diagnose illness and cannot measure blood pressure directly without a validated medical device.",
      "",
      "Wellness guidance:",
      "- Repeat scans under similar lighting for better comparison over time.",
      "- Use wearable or clinical device data if you want blood pressure, heart rate, or oxygen readings.",
      "- If there are real symptoms such as chest pain, weakness, severe headache, dizziness, facial drooping, or vision changes, contact a licensed healthcare professional immediately.",
    ];

    setReport(notes.join("\n"));
  }

  function nextStep() {
    if (stepIndex < steps.length - 1) {
      setStepIndex((s) => s + 1);
      return;
    }

    resetScan();
  }

  function prevStep() {
    if (stepIndex > 0) {
      setStepIndex((s) => s - 1);
    }
  }

  function resetScan() {
    setStepIndex(0);
    setStageResults([]);
    setReport("");
    setMetric(safeDefaultMetric);
    setFeedback("Scan reset. Start from face scan.");
    setFingerCount(0);
  }

  useEffect(() => {
    const interval = setInterval(() => {
      if (cameraOn) setScanSeconds((s) => s + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [cameraOn]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <nav className="flex items-center justify-between border-b bg-white px-8 py-4">
        <Link href="/" className="font-serif text-3xl">
          Aur<span className="italic text-orange-500">veil</span>
        </Link>

        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/">Back Home</Link>
          </Button>
          <Button onClick={resetScan} variant="outline">
            Reset
          </Button>
        </div>
      </nav>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-orange-500">
            Guided visual wellness protocol
          </p>
          <h1 className="mt-2 text-4xl font-black">Medical-style AI wellness scan</h1>
          <p className="mt-3 max-w-3xl text-slate-600">
            Follow each stage. Aurveil checks visibility, lighting, alignment, and stability.
            This is wellness awareness only, not diagnosis or blood-pressure measurement.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
          <div className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`h-full w-full scale-x-[-1] object-cover ${cameraOn ? "block" : "hidden"}`}
              />

              <canvas ref={canvasRef} className="absolute inset-0 h-full w-full scale-x-[-1]" />

              {!cameraOn && (
                <div className="flex h-full items-center justify-center text-slate-400">
                  Camera preview will appear here
                </div>
              )}

              <div className="absolute bottom-4 left-4 max-w-[82%] rounded-xl bg-black/70 px-4 py-3 text-sm font-semibold text-white">
                {feedback}
              </div>

              <div className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-slate-900">
                No video stored
              </div>
            </div>

            {error && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <Button onClick={startCamera} className="rounded-xl bg-orange-500 font-bold text-white hover:bg-orange-600">
                {cameraOn ? "Restart Camera" : "Start Camera"}
              </Button>
              <Button onClick={stopCamera} variant="outline" className="rounded-xl">
                Stop Camera
              </Button>
              <Button onClick={prevStep} variant="outline" className="rounded-xl">
                Back
              </Button>
              <Button onClick={nextStep} className="rounded-xl bg-slate-950 text-white hover:bg-slate-800">
                {isComplete ? "Restart Scan" : "Next Step"}
              </Button>
            </div>
          </div>

          <aside className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.15em] text-orange-500">
                  Current stage
                </p>
                <h2 className="mt-1 text-2xl font-black">{current.title}</h2>
              </div>
              <div className="rounded-2xl bg-orange-50 px-4 py-2 text-sm font-black text-orange-600">
                {stepIndex + 1}/{steps.length}
              </div>
            </div>

            <p className="text-sm leading-6 text-slate-600">{current.instruction}</p>

            <div className="mt-5 rounded-3xl border bg-slate-50 p-5 text-center">
              <div className="text-7xl">{current.guide}</div>
              <p className="mt-3 text-sm font-bold text-slate-700">{current.target}</p>
            </div>

            <div className="mt-5">
              <div className="flex justify-between text-xs font-bold text-slate-500">
                <span>Scan progress</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-orange-500" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <label className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => setAutoAdvance(e.target.checked)}
              />
              Auto-advance when stage passes
            </label>

            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <Metric label="Confidence" value={`${metric.confidence || "—"}%`} />
              <Metric label="Lighting" value={`${metric.lighting || "—"}%`} />
              <Metric label="Alignment" value={`${metric.alignment || "—"}%`} />
              <Metric label="Stability" value={`${metric.stability || "—"}%`} />
              <Metric label="Face size" value={`${metric.faceSize || "—"}%`} />
              <Metric label="Timer" value={`${scanSeconds}s`} />
            </div>

            <div className="mt-5 rounded-2xl bg-slate-950 p-4 text-sm text-white">
              <p className="font-black">Completed stages</p>
              <p className="mt-1 text-slate-300">
                {stageResults.length}/{steps.length - 1} completed
              </p>
              <p className="mt-1 text-slate-300">Finger captures: {fingerCount}/5 visual checks</p>
              <p className="mt-1 text-slate-300">Overall score: {overallScore || "—"}%</p>
            </div>
          </aside>
        </div>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <h3 className="text-xl font-black">Stage Results</h3>
            <div className="mt-4 space-y-3">
              {stageResults.length ? (
                stageResults.map((r) => (
                  <div key={r.id} className="rounded-2xl border bg-slate-50 p-4">
                    <div className="flex justify-between gap-4">
                      <strong>{r.title}</strong>
                      <span className="font-black text-emerald-600">{r.score}%</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{r.note}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No completed stages yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xl font-black">Final Wellness Report</h3>
              <Button onClick={buildFinalReport} variant="outline">
                Generate Report
              </Button>
            </div>

            {report ? (
              <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-950 p-5 text-sm leading-7 text-slate-100">
                {report}
              </pre>
            ) : (
              <p className="mt-4 rounded-2xl bg-slate-50 p-5 text-sm leading-7 text-slate-600">
                Complete the scan stages or click Generate Report to create a visual wellness report.
              </p>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}
