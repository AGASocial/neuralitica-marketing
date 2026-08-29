"use client";

import Link from "next/link";
import { Button } from "primereact/button";
import { Message } from "primereact/message";

type ProfileStubCopy = {
  title: string;
  body: string;
  emptyBody: string;
  ctaInterview: string;
  ctaDashboard: string;
};

type ProfileStubViewProps = {
  copy: ProfileStubCopy;
  /** When false, show empty-state CTA to complete the Entrevista inicial */
  profileReady: boolean;
};

/**
 * Minimal Living profile / Ficha viva stub until US-2.1 ships the full field grid.
 */
export function ProfileStubView({ copy, profileReady }: ProfileStubViewProps) {
  return (
    <div
      style={{
        maxWidth: 760,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
      }}
    >
      <div>
        <h1 style={{ margin: "0 0 0.5rem", fontSize: "2rem" }}>{copy.title}</h1>
      </div>

      <Message
        severity={profileReady ? "success" : "info"}
        text={profileReady ? copy.body : copy.emptyBody}
        style={{ width: "100%" }}
      />

      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        {profileReady ? (
          <Link href="/dashboard" style={{ textDecoration: "none" }}>
            <Button type="button" label={copy.ctaDashboard} />
          </Link>
        ) : (
          <Link href="/interview" style={{ textDecoration: "none" }}>
            <Button type="button" label={copy.ctaInterview} />
          </Link>
        )}
        {profileReady ? (
          <Link href="/interview" style={{ textDecoration: "none" }}>
            <Button
              type="button"
              label={copy.ctaInterview}
              severity="secondary"
              outlined
            />
          </Link>
        ) : (
          <Link href="/dashboard" style={{ textDecoration: "none" }}>
            <Button
              type="button"
              label={copy.ctaDashboard}
              severity="secondary"
              outlined
            />
          </Link>
        )}
      </div>
    </div>
  );
}
