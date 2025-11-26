import type { Handler } from "@netlify/functions";
import Busboy from "busboy";
import { Octokit } from "@octokit/rest";

const REPO_OWNER = process.env.GH_REPO_OWNER!;
const REPO_NAME = process.env.GH_REPO_NAME!;
const GH_TOKEN = process.env.GH_PAT_TOKEN!;
const RAW_PATH = "data/manual/teranet_hpi.xlsx";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!GH_TOKEN || !REPO_OWNER || !REPO_NAME) {
    return { statusCode: 500, body: "Missing GitHub config env vars" };
  }

  return await new Promise((resolve) => {
    const busboy = Busboy({ headers: event.headers as any });

    let fileBuffer: Buffer | null = null;

    busboy.on("file", (_fieldname, file) => {
      const chunks: Buffer[] = [];
      file.on("data", (d: Buffer) => chunks.push(d));
      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on("finish", async () => {
      if (!fileBuffer) {
        resolve({ statusCode: 400, body: "No file uploaded" });
        return;
      }

      try {
        const octokit = new Octokit({ auth: GH_TOKEN });
        const encoded = fileBuffer!.toString("base64");

        await octokit.repos.createOrUpdateFileContents({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          path: RAW_PATH,
          message: "chore: update Teranet HPI Excel",
          content: encoded,
        });

        resolve({ statusCode: 200, body: JSON.stringify({ ok: true }) });
      } catch (err) {
        console.error("Teranet upload error", err);
        resolve({ statusCode: 500, body: "Error saving Teranet file" });
      }
    });

    const body = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "", "utf8");

    busboy.end(body);
  });
};
