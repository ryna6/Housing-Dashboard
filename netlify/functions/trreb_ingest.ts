import type { Handler } from "@netlify/functions";
import { Octokit } from "@octokit/rest";

const REPO_OWNER = process.env.GH_REPO_OWNER!;
const REPO_NAME = process.env.GH_REPO_NAME!;
const GH_TOKEN = process.env.GH_PAT_TOKEN!; // store in Netlify env

const FILE_PATH = "data/manual/trreb_manual.csv";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!GH_TOKEN || !REPO_OWNER || !REPO_NAME) {
    return { statusCode: 500, body: "Missing GitHub configuration" };
  }

  if (!event.body) {
    return { statusCode: 400, body: "Missing request body" };
  }

  let csv: string;
  try {
    const parsed = JSON.parse(event.body);
    csv = String(parsed.csv || parsed.text || "");
  } catch {
    csv = event.body;
  }

  if (!csv.trim()) {
    return { statusCode: 400, body: "Empty CSV payload" };
  }

  const octokit = new Octokit({ auth: GH_TOKEN });

  let existingSha: string | undefined;
  let existingContent = "";

  try {
    const res = await octokit.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: FILE_PATH
    });

    if (!Array.isArray(res.data) && "content" in res.data) {
      existingSha = res.data.sha;
      const encoding = (res.data as any).encoding || "base64";
      existingContent = Buffer.from(
        res.data.content,
        encoding as BufferEncoding
      ).toString("utf8");
    }
  } catch (err: any) {
    if (err.status !== 404) {
      console.error("Error reading TRREB manual CSV", err);
      return { statusCode: 500, body: "Failed to read existing file" };
    }
  }

  const needsNewline =
    existingContent.length > 0 && !existingContent.endsWith("\n");
  const combined =
    existingContent +
    (needsNewline ? "\n" : "") +
    csv.trim() +
    (csv.endsWith("\n") ? "" : "\n");

  const encoded = Buffer.from(combined, "utf8").toString("base64");

  await octokit.repos.createOrUpdateFileContents({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    path: FILE_PATH,
    message: "chore: append TRREB manual rows",
    content: encoded,
    sha: existingSha
  });

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
