function readBooleanEnv(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "true";
}

export function isSeraVNextReadOnlyEnabled(): boolean {
  return readBooleanEnv("SERA_VNEXT_READONLY_ENABLED");
}

export function isSeraVNextDiagnosticsEnabled(): boolean {
  return readBooleanEnv("NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED");
}

export function isSeraVNextInternalPilotEnabled(): boolean {
  return readBooleanEnv("SERA_VNEXT_INTERNAL_PILOT_ENABLED");
}

export function isSeraVNextCandidateOnlyEnabled(): boolean {
  return readBooleanEnv("SERA_VNEXT_CANDIDATE_ONLY_ENABLED");
}

export function isSeraVNextCandidateUiEnabled(): boolean {
  return readBooleanEnv("NEXT_PUBLIC_SERA_VNEXT_CANDIDATE_UI_ENABLED");
}

// Controls whether /api/analyze routes analyses through the canonical vNext candidate engine
// instead of the legacy SERA pipeline. Default: false (legacy preserved).
// With flag on: vNext v02 engine is used; non-final candidate output only;
// human review required; no final classification produced.
export function isSeraVNextCanonicalAnalyzeEnabled(): boolean {
  return readBooleanEnv("SERA_VNEXT_CANONICAL_ANALYZE_ENABLED");
}

// Public flag to show vNext UI indicators in the common analysis flow.
// Must be paired with SERA_VNEXT_CANONICAL_ANALYZE_ENABLED on the server.
export function isSeraVNextCanonicalAnalyzeUiEnabled(): boolean {
  return readBooleanEnv("NEXT_PUBLIC_SERA_VNEXT_CANONICAL_ANALYZE_UI_ENABLED");
}
