import "server-only";

type AuthAdminUser = {
  id?: string;
  email?: string | null;
};

type AuthAdminUsersResponse = {
  users?: AuthAdminUser[];
};

function getServiceRoleKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  );
}

/**
 * Server-only lookup of an existing auth user id by email via GoTrue admin
 * `filter` query. Never log the email. Returns null on miss or failure.
 */
export async function findAuthUserIdByEmail(
  email: string,
): Promise<string | null> {
  const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = getServiceRoleKey();

  if (!baseUrl || !serviceRoleKey) {
    return null;
  }

  const normalized = email.toLowerCase().trim();
  const endpoint = new URL("/auth/v1/admin/users", `${baseUrl}/`);
  endpoint.searchParams.set("filter", normalized);
  endpoint.searchParams.set("per_page", "50");

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    });

    if (!response.ok) {
      console.error("[auth] admin user lookup by email failed", {
        status: response.status,
      });
      return null;
    }

    const body = (await response.json()) as AuthAdminUsersResponse;
    const users = Array.isArray(body.users) ? body.users : [];
    const match = users.find(
      (user) =>
        typeof user.id === "string" &&
        user.email?.toLowerCase() === normalized,
    );

    return match?.id ?? null;
  } catch {
    console.error("[auth] admin user lookup by email threw");
    return null;
  }
}
