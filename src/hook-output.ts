export function empty(): string {
  return "{}";
}

export function preToolDeny(reason: string, feedback?: string): string {
  return JSON.stringify({
    decision: "block",
    reason,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: joinFeedback(reason, feedback),
    },
  });
}

export function postToolBlock(reason: string, feedback?: string): string {
  return JSON.stringify({
    decision: "block",
    reason,
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: joinFeedback(reason, feedback),
    },
  });
}

export function stopBlock(reason: string, feedback?: string): string {
  return JSON.stringify({
    decision: "block",
    reason: joinFeedback(reason, feedback),
  });
}

function joinFeedback(reason: string, feedback?: string): string {
  const trimmed = feedback?.trim();
  if (!trimmed) {
    return reason;
  }
  return `${reason}\n\n${trimmed.slice(-4000)}`;
}
