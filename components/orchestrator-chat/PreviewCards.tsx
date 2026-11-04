"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type PreviewCardCopy = {
  videoTitle: string;
  scriptTitle: string;
  captionLabel: string;
  hookLabel: string;
  bodyLabel: string;
  ctaLabel: string;
  playHint: string;
  changeSomething: string;
  pendingScript: string;
};

type VideoPreviewCardProps = {
  videoPreviewUrl: string;
  coverPreviewUrl?: string;
  captionBody?: string;
  copy: PreviewCardCopy;
  onChangeSomething?: () => void;
  footer?: React.ReactNode;
};

export function VideoPreviewCard({
  videoPreviewUrl,
  coverPreviewUrl,
  captionBody,
  copy,
  onChangeSomething,
  footer,
}: VideoPreviewCardProps) {
  return (
    <Card className="border-edge bg-panel text-fog shadow-none">
      <CardHeader className="gap-1 px-4 pb-0 pt-4">
        <CardTitle className="font-display text-lg text-fog">
          {copy.videoTitle}
        </CardTitle>
        <CardDescription className="text-dim">{copy.playHint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4 py-3">
        <video
          key={videoPreviewUrl}
          controls
          playsInline
          preload="metadata"
          poster={coverPreviewUrl}
          src={videoPreviewUrl}
          className="w-full max-h-64 rounded-md bg-deep"
        />
        {captionBody ? (
          <div className="space-y-1 text-sm">
            <p className="text-dim">{copy.captionLabel}</p>
            <p className="line-clamp-4 whitespace-pre-wrap text-fog/90">
              {captionBody}
            </p>
          </div>
        ) : null}
      </CardContent>
      {footer ? (
        <CardFooter className="flex flex-wrap gap-2 px-4 pb-4">{footer}</CardFooter>
      ) : onChangeSomething ? (
        <CardFooter className="flex flex-wrap gap-2 px-4 pb-4">
          <Button
            type="button"
            variant="ghost"
            className="text-dim"
            onClick={onChangeSomething}
          >
            {copy.changeSomething}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

type ScriptPreviewCardProps = {
  tema: string;
  status: "pending" | "generated";
  hook?: string;
  body?: string;
  cta?: string;
  copy: PreviewCardCopy;
  onChangeSomething?: () => void;
  footer?: React.ReactNode;
};

export function ScriptPreviewCard({
  tema,
  status,
  hook,
  body,
  cta,
  copy,
  onChangeSomething,
  footer,
}: ScriptPreviewCardProps) {
  return (
    <Card className="border-edge bg-panel text-fog shadow-none">
      <CardHeader className="gap-1 px-4 pb-0 pt-4">
        <CardTitle className="font-display text-lg text-fog">
          {copy.scriptTitle}
        </CardTitle>
        <CardDescription className="text-dim">{tema}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4 py-3 text-sm">
        {status === "pending" ? (
          <p className="text-dim">{copy.pendingScript}</p>
        ) : (
          <>
            {hook ? (
              <div className="space-y-1">
                <p className="text-dim">{copy.hookLabel}</p>
                <p className="whitespace-pre-wrap text-fog/90">{hook}</p>
              </div>
            ) : null}
            {body ? (
              <div className="space-y-1">
                <p className="text-dim">{copy.bodyLabel}</p>
                <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-fog/90">
                  {body}
                </p>
              </div>
            ) : null}
            {cta ? (
              <div className="space-y-1">
                <p className="text-dim">{copy.ctaLabel}</p>
                <p className="whitespace-pre-wrap text-fog/90">{cta}</p>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
      {footer ? (
        <CardFooter className="flex flex-wrap gap-2 px-4 pb-4">{footer}</CardFooter>
      ) : onChangeSomething ? (
        <CardFooter className="flex flex-wrap gap-2 px-4 pb-4">
          <Button
            type="button"
            variant="ghost"
            className="text-dim"
            onClick={onChangeSomething}
          >
            {copy.changeSomething}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
