"use client";

import { Button } from "primereact/button";
import { Message } from "primereact/message";

type CheckEmailViewProps = {
  title: string;
  body: string;
  resendLabel: string;
  resendPendingLabel: string;
  resendSuccessMessage: string;
  onResend: () => Promise<void>;
  resendPending: boolean;
  resendError?: string | null;
  resendSuccess?: boolean;
};

export function CheckEmailView({
  title,
  body,
  resendLabel,
  resendPendingLabel,
  resendSuccessMessage,
  onResend,
  resendPending,
  resendError,
  resendSuccess = false,
}: CheckEmailViewProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.5rem" }}>{title}</h1>
        <Message severity="info" text={body} style={{ width: "100%" }} />
      </div>

      {resendSuccess ? (
        <Message
          severity="success"
          text={resendSuccessMessage}
          style={{ width: "100%" }}
        />
      ) : null}

      {resendError ? (
        <Message severity="error" text={resendError} style={{ width: "100%" }} />
      ) : null}

      <Button
        type="button"
        label={resendPending ? resendPendingLabel : resendLabel}
        loading={resendPending}
        disabled={resendPending}
        outlined
        onClick={() => {
          void onResend();
        }}
      />
    </div>
  );
}
