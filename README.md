# Aurveil
### *See Through the Surface*

> AI-powered visual health observation — real-time human detection and clinical aura analysis via your camera.

![Status](https://img.shields.io/badge/status-active-26a06a?style=flat-square)
![Version](https://img.shields.io/badge/version-1.0.0-C49B42?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-4a5c5c?style=flat-square)

---

## What is Aurveil?

Aurveil is a browser-based AI health observation tool that uses your webcam and Claude's Vision API to analyze visible physical indicators — skin tone, eye clarity, lip color, facial symmetry, posture, and more — and return structured, color-coded health observations in real time.

It is **not a medical device**. It is a health-awareness tool built to demonstrate the intersection of real-time computer vision and large language model visual reasoning.

---

## Features

- Real-time human detection via TensorFlow.js BlazeFace
- Face bounding boxes, landmark dots, alignment scoring, live confidence %
- Golden scan line animation sweeping the viewport
- 3-screen flow: branded intro → live scanner → streamed analysis report
- Claude Vision API integration with streaming responses
- Color-coded findings: Normal · Monitor · Consult a doctor
- Body area breakdown: COMPLEXION, EYES, LIPS, FACIAL SYMMETRY, NECK, POSTURE
- 100% local camera processing — no video stored or transmitted
- Single file, zero dependencies — opens in any browser

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Browser (Chrome recommended) |
| Human detection | TensorFlow.js + BlazeFace (CDN) |
| Health analysis | Anthropic Claude Vision API (streaming) |
| Typography | Cormorant Garamond + JetBrains Mono |
| Deployment | Vercel, Netlify, or GitHub Pages |

---

## Project Structure

aurveil/
├── index.html        # Full application
├── README.md         # This file
├── .gitignore        # Git ignore rules
└── LICENSE           # MIT License

---

## Getting Started

```bash
# Clone the repo
git clone https://github.com/dayoscuba/aurveil.git

# Navigate into it
cd aurveil

# Open directly in Chrome
open index.html

# OR serve locally
npx serve .
```

---

## Clinical Observation Areas

| Area | What It Looks For |
|---|---|
| COMPLEXION | Skin tone, pallor, jaundice, flushing, rashes |
| EYES | Sclera clarity, redness, yellowing, puffiness |
| LIPS | Color, moisture, pallor, cyanosis |
| FACIAL SYMMETRY | Asymmetry indicators |
| NECK | Visible swelling, posture angle |
| POSTURE | Energy level, fatigue indicators |
| OVERALL | General visible wellness impression |

---

## Disclaimer

Aurveil is **not a medical device** and does not provide medical diagnosis. All observations are for **health awareness purposes only**. Always consult a qualified healthcare professional for any medical concerns.

---

## License

MIT License — see `LICENSE` for details.

---

## Built by

**Dayo Scuba** · Adedayo Adetolu Onasanya
