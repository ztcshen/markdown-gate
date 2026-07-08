export function normalizePathForMatch(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function globMatches(value: string, pattern: string): boolean {
  return globToRegExp(pattern).test(value);
}

export function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePathForMatch(pattern);
  let source = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }
  source += "$";
  return new RegExp(source);
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
