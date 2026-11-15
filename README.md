<p align="center">
  <img width="96px" src="public/favicon.svg" alt="SpaceLauncher" />
  <h1 align="center">SpaceLauncher</h1>
  <p align="center">
    A fast, clean Minecraft launcher built with <b>React</b> and <b>Electron</b> for <b>Windows</b>, <b>macOS</b>, and <b>Linux</b> — developed by <b>Sea</b>.
  </p>
</p>

<p align="center">
  <a href="https://github.com/seaze-code/SPACELauncher/releases"><img alt="Latest Release" src="https://img.shields.io/github/v/release/seaze-code/SPACELauncher?style=flat&color=3b82f6" /></a>
  <img alt="License" src="https://img.shields.io/badge/License-GPL--2.0-blue.svg?style=flat" />
  <img alt="Electron" src="https://img.shields.io/badge/Electron-43+-47848F?style=flat&logo=electron&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-19+-61DAFB?style=flat&logo=react&logoColor=black" />
  <img alt="Platforms" src="https://img.shields.io/badge/Platforms-Windows%20%7C%20macOS%20%7C%20Linux-22c55e?style=flat" />
</p>

---

## Downloads

Pre-built binaries are published automatically in **[Releases](https://github.com/seaze-code/SPACELauncher/releases)**:

| Operating System | Recommended (Small Web Setup) | Full Offline / Portable | Architecture |
| :--- | :--- | :--- | :--- |
| **Windows** | `SpaceLauncher-WebSetup.exe` (~200 KB) | `SpaceLauncher.exe` / `SpaceLauncher-Portable-Windows.exe` / `SpaceLauncher-Windows-x64.zip` | x64 |
| **macOS** | `SpaceLauncher-mac-arm64.dmg` | `SpaceLauncher-mac-arm64.zip` | ARM64 (Apple Silicon) |
| **Linux** | `SpaceLauncher.deb` | `SpaceLauncher-Portable-Linux.tar.gz` | x64 |

> [!TIP]
> **`SpaceLauncher-WebSetup.exe`** is a lightweight ~200 KB installer that automatically downloads and extracts `SpaceLauncher-Windows-x64.zip` from the latest GitHub Release into `%LOCALAPPDATA%\SpaceLauncher`.

---

## Features

- **Home Stage & Official News**: Play directly from your Home stage with instance switching, Minecraft news cards, and full patch-note reader.
- **Isolated Instances & Modpack Support**: Create and clone instances with separate game folders, Vanilla/Fabric/Forge/NeoForge/Quilt installation, Snapshot support, `.mrpack` modpack installer, and per-instance live Console.
- **3D Skin Studio**: Preview 3D skins in real time, paint/customize skins, manage a personal skin library, toggle Classic/Slim arms, switch capes, and upload directly to your Microsoft profile.
- **Modrinth Hub & Local Content**: Browse and install mods, shaders, resource packs, and datapacks directly or import local files, with Fabric conflict diagnostics.
- **Themes & System Sync**: Supports OS-synced **System (Auto)**, **Pure White**, **Pure Black**, **Orbital Obsidian**, **Cosmic Nebula**, **Aurora Station**, and **Solar Flare**.
- **Command Palette (`Ctrl+K`) & Zero-Overhead Launch**: Quick keyboard navigation, `Keep Open`, `Hide`, or `Close (0 MB Mode)` while Minecraft runs, plus smart ZGC/G1GC JVM presets.
- **Multi-Language UI**: English, ไทย, Español, Français.

---

## Build from Source

**Requirements:** Node.js 20+, npm, Java JDK 17+ (to run Minecraft).

```bash
git clone https://github.com/seaze-code/SPACELauncher.git
cd SPACELauncher
npm install
npm run build
```

For Windows distributions:
```bash
npm run build:win:dir
```
And compile `script/compile-web-installer.nsi` or `script/compile-electron.nsi` with [NSIS](https://nsis.sourceforge.io/Download).

---

## Credits & License

- **Developed by:** **Sea** ([seaze-code](https://github.com/seaze-code))
- **Upstream Base:** Built upon OpenLauncher and licensed under the **[GPL-2.0 License](LICENSE)**.
- Not affiliated with Mojang AB or Microsoft.
