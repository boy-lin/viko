<div align="center">

# 🎬 Viko

**Local audio, video & image toolkit — transcode, compress, watermark, files stay on your machine**

_Viko · AudioVideoKits · FFmpeg-powered desktop media toolbox_

[![version](https://img.shields.io/badge/version-0.1.7-blue?style=flat-square)](../releases)
[![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)](../LICENSE)
[![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square)](#)
[![stack](https://img.shields.io/badge/React%20%2B%20Rust%20%2B%20Tauri-informational?style=flat-square)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](../pulls)

**English | [简体中文](../README.md)**

[![GitHub](https://img.shields.io/badge/GitHub-boy--lin%2Fviko-181717?logo=github&style=flat-square)](https://github.com/boy-lin/viko)

</div>

---

A locally running desktop media app focused on **audio, video, and image** conversion, compression, and watermarks — with a streamlined batch workflow.

> ✅ Local processing · ✅ Batch task queue · ✅ Sensible defaults · ✅ Pro-grade controls · ✅ Open source

Try it: [https://www.audiovideo.site](https://www.audiovideo.site)

---

## 📸 Screenshots

<br/>

<table>
  <tr>
    <td align="center"><img src="../public/app/1.png" alt="Home" width="480"/><br/><sub>Home</sub></td>
    <td align="center"><img src="../public/app/4.png" alt="Compressor" width="480"/><br/><sub>Compressor</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="../public/app/2.png" alt="Converter" width="480"/><br/><sub>Converter</sub></td>
    <td align="center"><img src="../public/app/5.png" alt="Task history" width="480"/><br/><sub>Task history</sub></td>
  </tr>
</table>

---

## ✨ Features

### 🔄 Media processing

|     Module     | Capability     | Notes                                                                            |
| :------------: | -------------- | -------------------------------------------------------------------------------- |
| **Converter**  | Transcode      | Batch audio/video/image; GIF and animated output                                 |
| **Compressor** | Size reduction | One-click batch compression; turbo mode & GPU (NVENC / QSV / VideoToolbox, etc.) |
| **Watermark**  | Text / image   | Branding and copyright marks                                                     |
|  **Denoise**   | Denoise        | Local audio/video cleanup for everyday use                                       |
|  **Metadata**  | Tag editing    | Batch edit video/audio/image metadata                                            |

### ⚡ Tasks & workflow

- **Batch queue** — add many files at once; global or per-item settings
- **Task history** — progress, search, sort, reveal output in folder
- **My files** — manage processed outputs
- **High-speed mode** — optional fast presets and hardware encoders (depends on your system)

### 🛡 Local-first

- Files **stay on your machine** — better privacy and control
- Media pipeline built on Rust **`ffmpeg-next`**
- Compatibility fallbacks for common formats and parameters

---

## 🚀 Quick start

### Option 1: Download (recommended)

Get the latest build for your platform from **[Releases](https://www.audiovideo.site)**.

| Platform    | Notes                                      |
| ----------- | ------------------------------------------ |
| **macOS**   | Apple Silicon & Intel (see Release assets) |
| **Windows** | NSIS installer                             |

> Defaults work out of the box; tune bitrate, resolution, and codecs when you need more control.

### Option 2: Run from source

> Requires **Node.js 20+**, **Rust stable**, **pnpm 10.11.1**

```bash
# 1. Clone the repo
git clone https://github.com/boy-lin/viko.git
cd viko

# 2. Install dependencies
corepack enable
pnpm install

# 3. Check FFmpeg dev libraries (macOS / Linux)
pnpm check:deps

# 4. Start desktop dev mode
pnpm tauri:dev
```

**Windows** — FFmpeg dependency check:

```powershell
pnpm check:deps:win
```

See **[BUILD.md](../BUILD.md)** for packaging details.

### Build installers locally

```bash
# Build for current platform
pnpm tauri:build

# Target a specific platform
pnpm build:mac:arm      # macOS Apple Silicon
pnpm build:mac:intel    # macOS Intel
pnpm build:win          # Windows
pnpm build:linux        # Linux
```

> For in-app updater signing, set `TAURI_SIGNING_PRIVATE_KEY` before build (CI is configured; see `.env.example` for local releases).

---

## 🏗 Architecture

```
Viko/
├── src/                   # React + TypeScript frontend
│   ├── pages/             # Converter, compressor, watermark, task history, …
│   ├── components/        # UI and business components
│   ├── lib/               # Tauri bridge, task queue, …
│   └── stores/            # Zustand state
├── src-tauri/             # Rust + Tauri 2 backend
│   ├── src/services/      # Transcode, compress, watermark, GIF, …
│   ├── src/task/          # Task queue
│   └── src/media_common/  # Shared FFmpeg helpers
├── public/                # Static assets, screenshots, i18n
├── scripts/               # Dependency checks, build, release scripts
└── docs/                  # Documentation
```

**Stack:**

| Layer    | Tech                                                                    |
| -------- | ----------------------------------------------------------------------- |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + Zustand + Radix UI        |
| Desktop  | Tauri 2                                                                 |
| Media    | Rust `ffmpeg-next` 8.x (codec / format / filter / scaling / resampling) |
| Tables   | TanStack Table                                                          |

---

## ❓ FAQ

**Who is it for?**  
Creators, editors, operators, and anyone with recurring batch media workflows.

**Can I use it without codec knowledge?**  
Yes — defaults produce good results; adjust bitrate, resolution, CBR/VBR/CRF, etc. when needed.

**Which formats are supported?**  
Common audio, video, and image formats; exact support depends on your system codecs.

**Why didn’t my file shrink much?**  
Size depends on source complexity, bitrate, resolution, and encoder settings. See [help.md](help.md) for CBR/VBR/CRF basics.

**Why local vs online tools?**  
No uploads, better batch control, and flexible parameters without round-trips to the cloud.

---

## 🎯 Who it’s for

| User type          | Use case                             |
| ------------------ | ------------------------------------ |
| 📹 Creators        | Batch transcode, compress, watermark |
| 🔒 Privacy-focused | Keep assets on device                |
| 🛠 Developers      | Extend on Tauri + FFmpeg             |
| 🌱 Beginners       | Defaults first, learn advanced later |

---

## 🤝 Contributing

Contributions of all kinds are welcome!

- 🐛 **Bug reports** → [New Issue](../issues/new)
- 💡 **Feature requests** → [New Issue](../issues/new)
- 🔧 **Code** → Fork → PR
- ⭐ **Star** the repo

See [AGENTS.md](../AGENTS.md) for dev guidelines.

---

## 💬 Community

An indie local media tool — feedback and contributions welcome.

- **Author WeChat**: `helloboyling`
- **User group**: scan to join for support and feature discussion

<table>
  <tr>
    <td align="center">
      <img src="../public/images/wx_group_qrcode.png" alt="Viko WeChat group" width="220"/><br/>
    </td>
  </tr>
</table>

> Group QR codes expire about every 7 days. Add WeChat `helloboyling` if the code is expired.

---

## 📄 License

[MIT](../LICENSE)

---

<div align="center">

**If this project helps you, a ⭐ Star is the best thank-you.**

</div>
