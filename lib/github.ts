import { Octokit } from "octokit";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.warn("GITHUB_TOKEN is not set — GitHub API will fail.");
}

const octokit = new Octokit({ auth: token });

export function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  // "https://github.com/owner/repo" or "owner/repo"
  const match = trimmed.match(/github\.com[/:](\w[-.\w]*)\/(\w[-.\w]*)/) || trimmed.match(/^(\w[-.\w]*)\/(\w[-.\w]*)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

export async function getFileContent(owner: string, repo: string, path: string): Promise<{ content: string; sha: string } | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
    if (Array.isArray(data)) return null;
    if (data.type !== "file" || !("content" in data) || !("sha" in data)) return null;
    const content = Buffer.from(data.content, "base64").toString("utf8");
    return { content, sha: data.sha };
  } catch {
    return null;
  }
}

export async function getFileSha(owner: string, repo: string, path: string): Promise<string | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
    if (Array.isArray(data)) return null;
    if (data.type !== "file" || !("sha" in data)) return null;
    return data.sha;
  } catch {
    return null;
  }
}

export async function putFile(owner: string, repo: string, path: string, content: string, sha: string, message: string): Promise<boolean> {
  try {
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      content: Buffer.from(content, "utf8").toString("base64"),
      sha,
      message,
    });
    return true;
  } catch {
    return false;
  }
}

/** Create or update a binary file (e.g. image). Returns the commit SHA on success. */
export async function putFileBinary(
  owner: string,
  repo: string,
  path: string,
  contentBase64: string,
  message: string,
  sha?: string
): Promise<{ ok: true; commitSha: string } | { ok: false }> {
  try {
    const res = await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      content: contentBase64,
      message,
      ...(sha ? { sha } : {}),
    });
    return { ok: true, commitSha: res.data.commit.sha ?? "" };
  } catch {
    return { ok: false };
  }
}
