import type { CalendarPublishStatus } from "@/lib/contracts/calendar";
import {
  calendarInstagramPostUrlSchema,
  calendarPublishedAtDtoSchema,
} from "@/lib/contracts/calendar";
import { publishedAtUtcNoonIsoFromDateInput } from "@/lib/calendar/operator-local-calendar-date";

export type PublishMetadataDto = {
  publishedAt: string | null;
  instagramPostUrl: string | null;
};

export function mapPublishMetadataToDto(params: {
  publishStatus: CalendarPublishStatus;
  publishedAtRaw: string | null;
  instagramPostUrlRaw: string | null;
}): PublishMetadataDto {
  if (params.publishStatus !== "published" || params.publishedAtRaw === null) {
    return { publishedAt: null, instagramPostUrl: null };
  }

  const dateOnly = params.publishedAtRaw.slice(0, 10);
  const publishedAtCandidate = publishedAtUtcNoonIsoFromDateInput(dateOnly);
  const publishedAtParsed =
    calendarPublishedAtDtoSchema.safeParse(publishedAtCandidate);
  const publishedAt = publishedAtParsed.success ? publishedAtParsed.data : null;

  let instagramPostUrl: string | null = null;
  if (typeof params.instagramPostUrlRaw === "string") {
    const urlParsed = calendarInstagramPostUrlSchema.safeParse(
      params.instagramPostUrlRaw,
    );
    if (urlParsed.success) {
      instagramPostUrl = urlParsed.data;
    }
  }

  return { publishedAt, instagramPostUrl };
}
