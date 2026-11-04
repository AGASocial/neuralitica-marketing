"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";

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
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="mb-2 font-display text-3xl text-fog">{title}</h1>
        <StatusAlert severity="info" text={body} className="w-full" />
      </div>

      {resendSuccess ? (
        <StatusAlert
          severity="success"
          text={resendSuccessMessage}
          className="w-full"
        />
      ) : null}

      {resendError ? (
        <StatusAlert severity="error" text={resendError} className="w-full" />
      ) : null}

      <Button
        type="button"
        variant="outline"
        disabled={resendPending}
        onClick={() => {
          void onResend();
        }}
      >
        {resendPending ? <Spinner className="size-4 text-current" /> : null}
        {resendPending ? resendPendingLabel : resendLabel}
      </Button>
    </div>
  );
}
