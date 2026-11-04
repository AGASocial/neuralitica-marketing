"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type DownloadReadyCardCopy = {
  title: string;
  hint: string;
  download: string;
  openReady: string;
  noIg: string;
};

type DownloadReadyCardProps = {
  videoPreviewUrl: string;
  downloadUrl: string;
  coverPreviewUrl?: string;
  captionBody?: string;
  readyToPublishHref: string;
  copy: DownloadReadyCardCopy;
};

export function DownloadReadyCard({
  videoPreviewUrl,
  downloadUrl,
  coverPreviewUrl,
  captionBody,
  readyToPublishHref,
  copy,
}: DownloadReadyCardProps) {
  return (
    <Card className="border-edge bg-panel text-fog shadow-none">
      <CardHeader className="gap-1 px-4 pb-0 pt-4">
        <CardTitle className="font-display text-lg text-fog">{copy.title}</CardTitle>
        <CardDescription className="text-dim">{copy.hint}</CardDescription>
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
          <p className="line-clamp-3 text-sm text-fog/90">{captionBody}</p>
        ) : null}
        <p className="text-xs text-dim">{copy.noIg}</p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 px-4 pb-4">
        <Button asChild className="bg-butter text-deep hover:bg-butter/90">
          <a href={downloadUrl} download>
            {copy.download}
          </a>
        </Button>
        <Button asChild variant="ghost" className="text-dim">
          <Link href={readyToPublishHref}>{copy.openReady}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
