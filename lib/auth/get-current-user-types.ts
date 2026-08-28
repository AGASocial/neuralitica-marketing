export type UserRole = "client" | "operator";

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string;
  preferredLocale: "en" | "es";
  role: UserRole;
  active: boolean;
};
