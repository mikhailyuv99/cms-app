import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseRepoUrl } from "@/lib/github";

/** Proxy image from repo for preview (e.g. after upload, before publish). */
export async function GET(request: NextRequest) {
  const session = getSession();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const path = request.nextUrl.searchParams.get("path");
  if (!path || !path.startsWith("images/")) {
    return new NextResponse("Bad request", { status: 400 });
  }
  const parsed = parseRepoUrl(session.repo);
  if (!parsed) return new NextResponse("Bad request", { status: 400 });

  try {
    const { Octokit } = await import("octokit");
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const { data } = await octokit.rest.repos.getContent({
      owner: parsed.owner,
      repo: parsed.repo,
      path,
    });
    if (Array.isArray(data) || !("content" in data)) return new NextResponse("Not found", { status: 404 });
    const buffer = Buffer.from(data.content, "base64");
    const contentType =
      path.endsWith(".png") ? "image/png"
      : path.endsWith(".gif") ? "image/gif"
      : path.endsWith(".webp") ? "image/webp"
      : path.endsWith(".avif") ? "image/avif"
      : path.endsWith(".mp4") ? "video/mp4"
      : path.endsWith(".webm") ? "video/webm"
      : "image/jpeg";
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=60",
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
