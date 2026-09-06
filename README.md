# Image Chooser

> **Sort a photo folder at the speed of a swipe.**

Image Chooser is a local-first desktop app for quickly triaging photos and videos. Open a folder, decide what to keep, delete, revisit, or send to one of your own destination folders—then keep moving.

![Desktop](https://img.shields.io/badge/desktop-Electron-47848f?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/UI-React-149eca?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/language-TypeScript-3178c6?logo=typescript&logoColor=white)
![Local first](https://img.shields.io/badge/privacy-local--first-10b981)

## Why Image Chooser?

Large media folders are painful to clean one file at a time. Image Chooser puts the next item front and centre so your only job is to make a quick decision.

- Preview images **and videos** in the desktop app.
- Sort with keyboard shortcuts, buttons, or drag gestures.
- Keep your files on your machine—there is no account, upload, or cloud service.
- Send media to **Keep**, **Later**, **Delete**, or custom shortcut folders.
- Undo the most recent decisions before they are applied.
- Resume an unfinished desktop session after reopening the app.

## What happens to my files?

Image Chooser organizes files by **moving** them; it does not edit image contents.

| Decision | Destination |
| --- | --- |
| Keep | `<selected folder>/_keep` |
| Later | `<selected folder>/_later` |
| Delete | `<selected folder>/_delete` |
| Custom shortcut | The destination folder assigned in Settings |

The **Delete** action is a staging area, not an immediate permanent deletion. In the desktop app, decisions are queued while you review, then applied when you finish, choose another folder, or close the app. Use the final **Permanently delete** button only after checking `_delete`.

> Before sorting irreplaceable files, make a backup. In particular, do not configure a custom destination folder that already contains media with the same filenames until collision handling is improved.

## Quick start — desktop app (recommended)

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- Windows for the packaged Windows build; macOS packaging is also configured

### Run in development

```bash
cd electrone
npm install
npm run dev
```

Choose a folder in the app and start sorting.

### Build the desktop app

```bash
cd electrone
npm install
npm run build
```

For a Windows installer, run:

```bash
npm run dist
```

## Keyboard controls

| Key | Action |
| --- | --- |
| `←` | Move to Delete |
| `→` | Move to Keep |
| `↓` | Move to Later |
| `↑` | Undo last action |
| `Space` | Skip |
| `Shift` | Toggle video sound |
| `Esc` | Choose another folder |
| Custom letter/number | Move to its configured shortcut folder |

You can also drag right to keep, left to delete, or down for later.

## Folder shortcuts and display settings

From the setup screen, select **Settings** to assign a single letter or number to a destination folder. During review, press that key to queue the current item for that destination. The same settings screen lets you choose whether the shortcut legend appears at the bottom, left, or right, and how folder names are truncated.

## Browser version

The original browser-based version is retained in this repository. It is useful for a lightweight local workflow, but the Electron app is the actively featured version and adds video support, native folder selection, custom folders, settings, and session persistence.

Build and run the supported React browser interface on port 3456:

```bash
npm install
npm install --prefix client
npm run build
npm run start
```

Then open [http://localhost:3456](http://localhost:3456).

There is also a React/Vite client under `client/`. During development, the root command starts both the API on port 3456 and Vite on port 5173:

```bash
npm install --prefix client
npm run dev
```

Open the Vite address printed in the terminal (normally [http://localhost:5173](http://localhost:5173)). When no browser build exists, the Express server keeps the old static interface in `public/` as a fallback.

## Project layout

```text
electrone/       Electron desktop application
  src/main/      File operations, session persistence, and IPC handlers
  src/preload/   Narrow renderer-to-main bridge
  src/renderer/  React user interface
client/          Original browser React client
server.js        Original local Express server
public/          Original static browser interface
```

## Contributing

Contributions are welcome. For changes that touch file operations, please include manual checks for:

1. Empty folders, non-media files, and unreadable files.
2. Undo, restart/resume, and finishing a session.
3. Existing destination files with the same name.
4. Large folders and videos that remain open in the preview.
5. Windows and macOS packaging when the change affects Electron.

Before opening a pull request, make sure the relevant build succeeds:

```bash
npm run build --prefix electrone
npm run build --prefix client
```

## Roadmap

- Safer, visible handling for filename collisions.
- A review screen before queued moves are committed.
- Automated tests for file operations and session recovery.
- Platform security hardening for the Electron window.
- Consolidate the two browser interfaces into one supported web client.

## License

No license file has been selected yet. Add an explicit open-source license (for example, MIT or Apache-2.0) before accepting external contributions or distributing builds broadly.
