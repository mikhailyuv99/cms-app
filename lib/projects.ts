import { readFileSync } from "fs";
import { join } from "path";

export interface Project {
  repo: string;
  passwordHash: string;
  siteUrl?: string;
  name?: string;
}

let cached: Project[] | null = null;

export function getProjects(): Project[] {
  if (cached) return cached;
  try {
    const path = join(process.cwd(), "data", "projects.json");
    const raw = readFileSync(path, "utf8");
    cached = JSON.parse(raw) as Project[];
    return cached;
  } catch {
    return [];
  }
}
