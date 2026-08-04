import type { AuditFlag, ParsedWorkflow, PrivacyProfile } from "@/types";

// ─── privacy.rule.ts — DEPRECATED SHELL ──────────────────────────────────────
//
// All privacy rules have been merged into security.rule.ts (SECURITY pillar)
// to eliminate the double-jeopardy between SECURITY and PRIVACY:
//
//   PRIVACY_PII_IN_OUTBOUND     → security.rule.ts (SEC_PII_IN_OUTBOUND)
//   PRIVACY_CREDENTIAL_SPOF    → security.rule.ts (SEC_CREDENTIAL_SPOF)
//   PRIVACY_RAW_IP_EGRESS       → security.rule.ts (SEC_RAW_IP_EGRESS)
//   PRIVACY_HTTP_EGRESS         → security.rule.ts (SEC_HTTP_EGRESS)
//   PRIVACY_UNKNOWN_DOMAIN      → security.rule.ts (SEC_UNKNOWN_DOMAIN)
//
// This file is kept as a re-export shim for backward compatibility.

export function runPrivacyRules(
  _parsed: ParsedWorkflow
): { flags: AuditFlag[]; profile: PrivacyProfile } {
  return {
    flags: [],
    profile: {
      piiFieldsDetected: [],
      credentialBlastRadius: {},
      flaggedEgressUrls: [],
      piiInOutboundNodes: [],
    },
  };
}

export function computePrivacyScore(_flags: AuditFlag[]): number {
  // Privacy is now merged into securityScore — see engine.ts.
  return 100;
}
