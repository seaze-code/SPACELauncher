<div align="center">
  <img src="public/favicon.svg" width="76" height="76" alt="SpaceLauncher" />
  <h1>SpaceLauncher</h1>
  <p>A clean, fast Minecraft launcher with isolated instances, 3D Skin Studio, and Modrinth support.<br />Made by <b>Sea</b>.</p>

  <p>
    <a href="https://github.com/seaze-code/SPACELauncher/releases/latest"><img src="https://img.shields.io/github/v/release/seaze-code/SPACELauncher?style=flat-square&color=09090b&label=release" alt="Release" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--2.0-18181b?style=flat-square" alt="License" /></a>
    <img src="https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-18181b?style=flat-square" alt="Platforms" />
  </p>

  <p>
    <a href="https://github.com/seaze-code/SPACELauncher/releases/latest/download/SpaceLauncher-WebSetup.exe"><b>Download for Windows (Web Setup · 122 KB)</b></a>
    &nbsp;&middot;&nbsp;
    <a href="https://github.com/seaze-code/SPACELauncher/releases/latest">All Downloads</a>
  </p>
</div>

---

## Downloads

Grab the latest build from [Releases](https://github.com/seaze-code/SPACELauncher/releases/latest):

| Platform | Recommended | Portable / Other |
| :--- | :--- | :--- |
| **Windows (x64)** | [`SpaceLauncher-WebSetup.exe`](https://github.com/seaze-code/SPACELauncher/releases/latest/download/SpaceLauncher-WebSetup.exe) *(122 KB web installer)* | [`SpaceLauncher.exe`](https://github.com/seaze-code/SPACELauncher/releases/latest/download/SpaceLauncher.exe) · [`SpaceLauncher-Portable-Windows.exe`](https://github.com/seaze-code/SPACELauncher/releases/latest/download/SpaceLauncher-Portable-Windows.exe) |
| **macOS (ARM64)** | [`SpaceLauncher-mac-arm64.dmg`](https://github.com/seaze-code/SPACELauncher/releases/latest/download/SpaceLauncher-mac-arm64.dmg) | [`SpaceLauncher-mac-arm64.zip`](https://github.com/seaze-code/SPACELauncher/releases/latest/download/SpaceLauncher-mac-arm64.zip) |
| **Linux (x64)** | [`SpaceLauncher.AppImage`](https://github.com/seaze-code/SPACELauncher/releases/latest/download/SpaceLauncher.AppImage) | [`SpaceLauncher.deb`](https://github.com/seaze-code/SPACELauncher/releases/latest/download/SpaceLauncher.deb) · [`SpaceLauncher.tar.gz`](https://github.com/seaze-code/SPACELauncher/releases/latest/download/SpaceLauncher.tar.gz) |

> Using Windows? `SpaceLauncher-WebSetup.exe` is only ~122 KB and fetches the latest release archive into `%LOCALAPPDATA%\SpaceLauncher`. If you want an offline installer, grab `SpaceLauncher.exe` instead.

---

## What it does

- Launch directly from the Home screen with quick instance switching and Minecraft news.
- Keep each modpack or version in its own isolated folder (Vanilla, Fabric, Forge, NeoForge, Quilt, and Snapshots).
- Preview, paint, and upload skins in the built-in 3D Skin Studio with Classic/Slim toggles and cape switching.
- Install `.mrpack` modpacks, local `.jar` mods, shaders, resource packs, and datapacks, or browse Modrinth.
- View per-instance logs in a dedicated console tab when launching or debugging mods.
- Match Windows light/dark mode automatically (`System`), or switch between Pure White, Pure Black, and color themes.
- Open anything fast with `Ctrl+K`, and switch UI languages (`English`, `ไทย`, `Español`, `Français`).

---

## Building from source

Requires **Node.js 22+**, **npm**, and **Java 17+** (for running Minecraft).

```bash
git clone https://github.com/seaze-code/SPACELauncher.git
cd SPACELauncher
npm install
npm run build
```

Package an unpacked Windows build:

```bash
npm run build:win:dir
```

NSIS scripts live in `script/compile-web-installer.nsi` and `script/compile-electron.nsi`.

---

## Credits

- Created by **Sea**
- Based on OpenLauncher under the [GPL-2.0 License](LICENSE)
- Not affiliated with Mojang AB or Microsoft
