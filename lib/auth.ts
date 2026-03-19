import { createHmac } from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { getProjects } from "./projects";

const COOKIE_NAME = "cms_session";
const SECRET = process.env.CMS_SESSION_SECRET || "dev-secret-change-in-production";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionProject {
  repo: string;
  siteUrl?: string;
  name?: string;
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

function verify(payload: string, signature: string): boolean {
  return sign(payload) === signature;
}

export function getSession(): SessionProject | null {
  const cookieStore = cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  if (!value) return null;
  const [payloadB64, sig] = value.split(".");
  if (!payloadB64 || !sig) return null;
  try {
    const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
    if (!verify(payloadB64, sig)) return null;
    const data = JSON.parse(payload) as { repo: string; siteUrl?: string; name?: string; exp: number };
    if (data.exp < Date.now() / 1000) return null;
    return { repo: data.repo, siteUrl: data.siteUrl, name: data.name };
  } catch {
    return null;
  }
}

export async function setSession(project: SessionProject) {
  const cookieStore = await cookies();
  const payload = JSON.stringify({
    repo: project.repo,
    siteUrl: project.siteUrl,
    name: project.name,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE,
  });
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  const signature = sign(payloadB64);
  cookieStore.set(COOKIE_NAME, `${payloadB64}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export function findProjectByPassword(password: string): SessionProject | null {
  const projects = getProjects();
  for (const p of projects) {
    if (bcrypt.compareSync(password, p.passwordHash)) {
      return { repo: p.repo, siteUrl: p.siteUrl, name: p.name };
    }
  }
  return null;
}
