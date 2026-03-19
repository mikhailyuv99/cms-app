import { cookies } from "next/headers";

const COOKIE_NAME = "cms_session";
const PASSWORD = process.env.CMS_PASSWORD || "demo";

export function getSession(): boolean {
  const cookieStore = cookies();
  const session = cookieStore.get(COOKIE_NAME)?.value;
  return session === "ok";
}

export function checkPassword(password: string): boolean {
  return password === PASSWORD;
}

export async function setSession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "ok", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
