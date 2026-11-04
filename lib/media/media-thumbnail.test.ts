import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  isAppMediaAssetPreviewPath,
  resolveMediaThumbnailMode,
  videoThumbnailSrc,
} from "./media-thumbnail";

const ASSET = "98cb6c49-0000-4000-8000-000000000001";
const PREVIEW = `/api/media/assets/${ASSET}`;

describe("media-thumbnail helpers", () => {
  it("accepts authenticated app media asset paths only", () => {
    assert.equal(isAppMediaAssetPreviewPath(PREVIEW), true);
    assert.equal(isAppMediaAssetPreviewPath(`${PREVIEW}?disposition=inline`), true);
    assert.equal(isAppMediaAssetPreviewPath(`${PREVIEW}#t=0.1`), true);
    assert.equal(
      isAppMediaAssetPreviewPath(
        "https://xxx.supabase.co/storage/v1/object/public/neuramark-media/x.mp4",
      ),
      false,
    );
  });

  it("appends #t=0.1 for video frame seek without duplicating", () => {
    assert.equal(videoThumbnailSrc(PREVIEW), `${PREVIEW}#t=0.1`);
    assert.equal(videoThumbnailSrc(`${PREVIEW}#t=0.1`), `${PREVIEW}#t=0.1`);
    assert.equal(videoThumbnailSrc(`${PREVIEW}#t=1`), `${PREVIEW}#t=1`);
  });

  it("resolves poster → video → placeholder modes", () => {
    assert.equal(
      resolveMediaThumbnailMode({
        src: PREVIEW,
        posterSrc: `/api/media/assets/${ASSET}`,
        kind: "video",
      }),
      "poster",
    );
    assert.equal(
      resolveMediaThumbnailMode({
        src: PREVIEW,
        posterSrc: `/api/media/assets/${ASSET}`,
        kind: "video",
        posterFailed: true,
      }),
      "video",
    );
    assert.equal(
      resolveMediaThumbnailMode({ src: PREVIEW, kind: "video" }),
      "video",
    );
    assert.equal(
      resolveMediaThumbnailMode({ src: PREVIEW, kind: "image" }),
      "image",
    );
    assert.equal(
      resolveMediaThumbnailMode({
        src: PREVIEW,
        kind: "video",
        mediaFailed: true,
      }),
      "placeholder",
    );
    assert.equal(resolveMediaThumbnailMode({}), "placeholder");
  });
});

describe("MediaThumbnail wiring", () => {
  it("calendar and ReelCard use MediaThumbnail instead of img for video thumbs", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const calendar = readFileSync(
      join(here, "../../components/calendar/OperatorCalendarView.tsx"),
      "utf8",
    );
    const reelCard = readFileSync(
      join(here, "../../components/campana/ReelCard.tsx"),
      "utf8",
    );
    const mediaThumb = readFileSync(
      join(here, "../../components/media/MediaThumbnail.tsx"),
      "utf8",
    );

    assert.match(calendar, /MediaThumbnail/);
    assert.doesNotMatch(
      calendar,
      /thumbnailPreviewUrl[\s\S]{0,120}<img/,
    );
    assert.match(reelCard, /MediaThumbnail/);
    assert.match(mediaThumb, /preload="metadata"/);
    assert.match(mediaThumb, /#t=0\.1|videoThumbnailSrc/);
    assert.match(mediaThumb, /onError/);
    assert.match(mediaThumb, /muted/);
    assert.match(mediaThumb, /playsInline/);
  });

  it("chat and Mis videos preview use authenticated /api/media paths via video", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const previewCards = readFileSync(
      join(here, "../../components/orchestrator-chat/PreviewCards.tsx"),
      "utf8",
    );
    const hub = readFileSync(
      join(here, "../../components/ready-to-publish/MyVideosHubView.tsx"),
      "utf8",
    );
    const agentCard = readFileSync(
      join(here, "../../components/agent-cards/AgentCard.tsx"),
      "utf8",
    );
    assert.match(previewCards, /<video/);
    assert.match(previewCards, /videoPreviewUrl/);
    assert.match(hub, /AgentCard/);
    assert.match(hub, /videoPreviewUrl|mapMyVideosPendingToCard/);
    assert.match(agentCard, /<video/);
    assert.match(agentCard, /MediaThumbnail/);
  });
});
