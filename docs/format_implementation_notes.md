# Format Implementation Status

Based on `ffmpeg-next 7.1.0` capabilities and modern usage, here is the implementation status for formats listed in `docs/bak.md`.

## Implemented (Supported)

### Audio
- **MP3**: High/Med/Low presets.
- **AAC**: Ubiquitous support.
- **M4A**: AAC container.
- **WAV**: PCM Lossless.
- **FLAC**: Free Lossless Audio Codec.
- **OGG**: Vorbis/Opus.
- **AIFF**: Apple Lossless (PCM/LPCM).
- **ALAC**: Apple Lossless.
- **AC3**: Dolby Digital.
- **MP2**: Legacy constrained.
- **AMR**: Speech.
- **M4R**: Ringtone (AAC).
- **M4B**: Audiobook (AAC).
- **APE**: Monkey's Audio (Demuxing supported, Mudo encoding check).
- **CAF**: Core Audio Format.

### Video
- **MP4**: H.264/HEVC.
- **MOV**: Apple QuickTime.
- **MKV**: Matroska.
- **AVI**: Legacy container.
- **WMV**: Windows Media Video.
- **WebM**: VP8/VP9/AV1.
- **3GP/3G2**: Mobile legacy.
- **MPEG-1/2**: VCD/DVD standards.
- **VOB**: DVD container.
- **TS/M2TS**: Transport Streams.
- **FLV**: Flash Video (Legacy but supported).
- **ASF**: Advanced Systems Format (WMV container).
- **DV**: Digital Video.
- **OGV**: Theora.

## Skipped / Not Implemented

### Audio
- **ALAC CAF**: Combined into generic CAF or ALAC. Redundant as separate top-level.

### Video
- **SWF**: Shockwave Flash. Obsolete. Encoding support is practically nonexistent in modern builds.
- **F4V**: Flash Video. Obsolete, replaced by MP4.
- **DivX**: Proprietary codec often mapped to MPEG-4 Part 2. Better handled via AVI/MP4 with specific codecs using generic presets.
- **MXF**: Professional container, usually requires specific profile. Skipped for consumer simplicity unless requested.
- **TRP**: Variation of TS. Merged into TS logic.
- **AMV**: Obsolete MP4 derivative for low-end players.
- **XVID**: See DivX.

### Editors/Other
- **IDVD**: Software, not a format.
- **Final Cut Pro 7**: XML/Legacy targets. Replaced by generic "ProRes" and "HD" presets.
