import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";

const output = vi.spyOn(console, "log").mockImplementation(() => {});
const errors = vi.spyOn(console, "error").mockImplementation(() => {});
beforeEach(() => {
  output.mockClear();
  errors.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CLI contract", () => {
  it.each([[], ["--help"], ["-h"], ["check", "--help"], ["--version"]].map((args) => ({ args })))(
    "supports $args",
    async ({ args }) => {
      expect(await main(args, "")).toBe(0);
      expect(output).toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    },
  );

  it.each(
    [
      ["--unknown", "value"],
      ["--config"],
      ["--config", ""],
      ["--format", "yaml"],
      ["--type", "typo", "--stdin"],
      ["--stdin-path", "example.md"],
      ["--stdin", "example.md"],
      ["--fail-on", "off", "--fail-on", "error"],
    ].map((args) => ({ args })),
  )("returns a controlled usage error for $args", async ({ args }) => {
    expect(await main(["check", ...args], "# API")).toBe(2);
    expect(errors).toHaveBeenCalledOnce();
    expect(output).not.toHaveBeenCalled();
  });

  it.each([["--unknown", "value"], ["--config"], ["missing-file.md"]].map((args) => ({ args })))(
    "returns machine-readable errors with --format=json for $args",
    async ({ args }) => {
      expect(await main(["check", "--format=json", ...args], "")).toBe(2);
      expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({
        status: "error",
        error: { message: expect.any(String) },
      });
      expect(errors).not.toHaveBeenCalled();
    },
  );

  it("accepts equals options and keeps pass/fail reports compatible", async () => {
    expect(
      await main(
        ["check", "--stdin", "--type=public-api-doc", "--format=json"],
        "# API\n\nThe previous design.",
      ),
    ).toBe(1);
    expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ status: "fail", fail_on: "error" });
  });

  it("rejects extra subcommands and install options in the wrong scope", async () => {
    for (const args of [
      ["hook", "stop", "extra"],
      ["rules", "check", "extra"],
      ["install-codex-hooks", "--codex-home", "/example"],
    ]) {
      expect(await main(args, "")).toBe(2);
    }
  });
});
