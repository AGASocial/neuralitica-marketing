# media-thumbnails Specification

## Purpose
Render card/list media thumbnails from authenticated app media preview paths without broken image tags for video assets.

## Requirements

### Requirement: Authenticated preview paths for thumbnails
Thumbnail surfaces SHALL load media only through app-authenticated preview paths under `/api/media/assets/{id}` (session cookie) or an equivalent signed app route; they MUST NOT point `<img>` or `<video>` at raw private-bucket public URLs.

#### Scenario: Calendar card uses app media route
- **WHEN** an Operator calendar slot has an assembled output media asset
- **THEN** the thumbnail source is an `/api/media/assets/{assetId}` path (not a direct Supabase/storage public URL)

### Requirement: Video thumbnails without poster use muted video frame
When the thumbnail asset is a video and no poster/cover preview exists, the UI SHALL render a muted `<video playsInline preload="metadata">` whose `src` includes a media fragment `#t=0.1` so a frame can paint; it MUST NOT use `<img>` for that video URL.

#### Scenario: Assembled mp4 without cover
- **WHEN** a calendar or campaña reel card thumbnail points at an mp4 asset with no poster
- **THEN** the card shows a muted inline video preview (not a broken image icon)

### Requirement: Broken image fallback
Image or poster thumbnail elements SHALL attach an error handler that replaces a failed load with a neutral placeholder so a broken-image glyph never remains visible.

#### Scenario: Poster fails to load
- **WHEN** a poster/cover preview URL returns an error
- **THEN** the UI falls back to the video frame when a video src exists, otherwise a neutral placeholder
