const { spawnSync } = require("node:child_process");
const path = require("node:path");

class MarkdownGateProvider {
  id() {
    return "markdown-gate";
  }

  async callApi(prompt, context) {
    const repoRoot = path.resolve(__dirname, "../..");
    const cli = path.join(repoRoot, "dist", "cli.js");
    const docType = context?.vars?.doc_type || "unknown";
    const result = spawnSync(
      process.execPath,
      [
        cli,
        "check",
        "--stdin",
        "--stdin-path",
        "<promptfoo>.md",
        "--type",
        String(docType),
        "--format",
        "json",
      ],
      {
        cwd: repoRoot,
        input: prompt,
        text: true,
        encoding: "utf8",
      },
    );

    if (result.error) {
      return { error: result.error.message };
    }
    if (result.status === null) {
      return { error: "markdown-gate process did not exit" };
    }
    if (![0, 1].includes(result.status)) {
      return { error: result.stderr || result.stdout || `markdown-gate exited ${result.status}` };
    }
    return { output: result.stdout };
  }
}

module.exports = MarkdownGateProvider;
