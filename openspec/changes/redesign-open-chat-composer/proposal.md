# Proposal: "Abrir chat" uses the composer

## Why
Desktop "Abrir chat" in Hoy still opened the old side-sheet launcher flow; the redesign entry point is the persistent bottom composer. InterviewProgressCard, DownloadReadyCard and PreviewCards were audited and already use the AgentCard visual tokens (border-edge bg-panel, font-display title, px-4 paddings), so no change.

## What changes
- OpenChatButton focuses and scrolls to the composer; falls back to the sheet only if no composer is mounted.
- Remove dead OrchestratorChatToggle (old launcher).
