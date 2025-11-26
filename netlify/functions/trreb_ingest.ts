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
    return { statusCode: 500, body: "Missing GitHub config env vars" };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const csvText = body.csvText;
    if (!csvText || typeof csvText !== "string") {
      return { statusCode: 400, body: "csvText is required" };
    }

    const octokit = new Octokit({ auth: GH_TOKEN });

    // Load existing file (if any)
    let existingContent = "";
    let sha: string | undefined;

    try {
      const { data } = await octokit.repos.getContent({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: FILE_PATH,
      });

      if (!Array.isArray(data) && "content" in data && typeof data.content === "string") {
        existingContent = Buffer.from(data.content, "base64").toString("utf8");
        sha = data.sha;
      }
    } catch (err: any) {
      if (err.status !== 404) {
        console.error("Error fetching existing TRREB file", err);
        return { statusCode: 500, body: "Error fetching existing TRREB file" };
      }
    }

    let newContent = existingContent.trimEnd();
    const trimmedNew = csvText.trim();
    if (trimmedNew.length > 0) {
      if (newContent) newContent += "\n";
      newContent += trimmedNew;
    }

    const encoded = Buffer.from(newContent, "base64").toString("base64");

    await octokit.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: FILE_PATH,
      message: "chore: append TRREB manual rows",
      content: encoded,
      sha,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error("TRREB ingest error", err);
    return { statusCode: 500, body: "Internal error" };
  }
};
