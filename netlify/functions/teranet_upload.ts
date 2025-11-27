import type { Handler } from "@netlify/functions";
import { Octokit } from "@octokit/rest";

const REPO_OWNER = process.env.GH_REPO_OWNER!;
const REPO_NAME = process.env.GH_REPO_NAME!;
const GH_TOKEN = process.env.GH_PAT_TOKEN!;
const RAW_PATH = "data/manual/teranet_hpi.xlsx";

/**
 * Simple handler that expects the request body to be the raw Excel file
 * (Netlify will usually send base64 for binary).
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!GH_TOKEN || !REPO_OWNER || !REPO_NAME) {
    return { statusCode: 500, body: "Missing GitHub configuration" };
  }

  if (!event.body) {
    return { statusCode: 400, body: "Missing file body" };
  }

  const buffer = event.isBase64Encoded
    ? Buffer.from(event.body, "base64")
    : Buffer.from(event.body, "utf8");

  const octokit = new Octokit({ auth: GH_TOKEN });

  let existingSha: string | undefined;
  try {
    const res = await octokit.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: RAW_PATH
    });
    if (!Array.isArray(res.data) && "sha" in res.data) {
      existingSha = res.data.sha;
    }
  } catch (err: any) {
    if (err.status !== 404) {
      console.error("Error reading existing Teranet file", err);
      return { statusCode: 500, body: "Failed to read current file" };
    }
  }

  const encoded = buffer.toString("base64");

  await octokit.repos.createOrUpdateFileContents({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    path: RAW_PATH,
    message: "chore: update Teranet HPI upload",
    content: encoded,
    sha: existingSha
  });

  return { statusCode: 200, body: "Teranet HPI uploaded" };
};
