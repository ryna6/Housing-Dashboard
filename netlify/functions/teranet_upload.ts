import type { Handler } from "@netlify/functions";
import busboy from "busboy";
import { Octokit } from "@octokit/rest";

const REPO_OWNER = process.env.GH_REPO_OWNER!;
const REPO_NAME = process.env.GH_REPO_NAME!;
const GH_TOKEN = process.env.GH_PAT_TOKEN!;
const RAW_PATH = "data/manual/teranet_hpi.xlsx";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  if (!GH_TOKEN) return { statusCode: 500, body: "Missing GitHub token" };

  const bb = busboy({ headers: event.headers });

  let fileBuffer: Buffer | null = null;

  return await new Promise((resolve) => {
    bb.on("file", (_name, file) => {
      const chunks: Buffer[] = [];
      file.on("data", (d: Buffer) => chunks.push(d));
      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    bb.on("finish", async () => {
      if (!fileBuffer) {
        resolve({ statusCode: 400, body: "Missing file" });
        return;
      }

      try {
        const octokit = new Octokit({ auth: GH_TOKEN });
        const encoded = fileBuffer.toString("base64");

        // Simply save the raw Excel; ETL will parse & normalize it on next run
        await octokit.repos.createOrUpdateFileContents({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          path: RAW_PATH,
          message: "chore: update Teranet HPI Excel",
          content: encoded,
        });

        resolve({ statusCode: 200, body: JSON.stringify({ ok: true }) });
      } catch (err) {
        console.error(err);
        resolve({ statusCode: 500, body: "Error saving Teranet file" });
      }
    });

    // Netlify passes body as base64 when it's binary
    const body = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "", "utf8");

    bb.end(body);
  });
};

