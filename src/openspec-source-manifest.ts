/**
 * OpenSpec source-manifest contract.
 *
 * `goal-spec` produces `source-manifest.json` and `goal-dag` consumes it
 * to locate authoritative OpenSpec change sources.  This module defines
 * the canonical shape and a pure parser so all pipeline stages validate
 * against the same contract.
 */

export const OPENSPEC_SOURCE_MANIFEST_SCHEMA_VERSION = "1.0" as const;

export const OPENSPEC_AUTHORITATIVE_SOURCE_KINDS = [
  "proposal",
  "design",
  "tasks",
  "spec-delta",
] as const;

export type OpenSpecAuthoritativeSourceKind =
  (typeof OPENSPEC_AUTHORITATIVE_SOURCE_KINDS)[number];

export interface OpenSpecSourceManifest {
  schemaVersion: typeof OPENSPEC_SOURCE_MANIFEST_SCHEMA_VERSION;
  changeName: string;
  generatedAt: string;
  sources: OpenSpecSourceManifestEntry[];
}

export interface OpenSpecSourceManifestEntry {
  path: string;
  kind: OpenSpecAuthoritativeSourceKind;
  sha256: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHA256_RE = /^[a-f0-9]{64}$/;

/**
 * Parse a JSON string as a source-manifest document.  Throws on malformed
 * JSON, missing required fields, unknown keys, or invalid field values.
 */
export function parseOpenSpecSourceManifestJson(content: string): OpenSpecSourceManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Invalid source-manifest JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseOpenSpecSourceManifest(parsed);
}

export function parseOpenSpecSourceManifest(input: unknown): OpenSpecSourceManifest {
  if (!isRecord(input)) {
    throw new Error("Invalid source-manifest: root must be an object");
  }

  assertKnownKeys(input, ["schemaVersion", "changeName", "generatedAt", "sources"], "source-manifest");

  if (input.schemaVersion !== OPENSPEC_SOURCE_MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `Invalid source-manifest: schemaVersion must be ${OPENSPEC_SOURCE_MANIFEST_SCHEMA_VERSION}`,
    );
  }

  const changeName = requireNonEmptyString(input.changeName, "source-manifest.changeName");
  const generatedAt = requireNonEmptyString(input.generatedAt, "source-manifest.generatedAt");

  if (!Array.isArray(input.sources) || input.sources.length === 0) {
    throw new Error("Invalid source-manifest: sources must be a non-empty array");
  }

  const sources = input.sources.map((item, index) =>
    parseOpenSpecSourceManifestEntry(item, `source-manifest.sources[${index}]`),
  );

  return { schemaVersion: OPENSPEC_SOURCE_MANIFEST_SCHEMA_VERSION, changeName, generatedAt, sources };
}

function parseOpenSpecSourceManifestEntry(
  input: unknown,
  path: string,
): OpenSpecSourceManifestEntry {
  if (!isRecord(input)) {
    throw new Error(`Invalid source-manifest: ${path} must be an object`);
  }

  assertKnownKeys(input, ["path", "kind", "sha256"], path);

  const entryPath = requireRelativePath(input.path, `${path}.path`);
  const kind = requireSourceKind(input.kind, `${path}.kind`);
  const sha256 = requireSha256(input.sha256, `${path}.sha256`);

  return { path: entryPath, kind, sha256 };
}

// ---------------------------------------------------------------------------
// Value validators
// ---------------------------------------------------------------------------

function requireSourceKind(input: unknown, path: string): OpenSpecAuthoritativeSourceKind {
  if (typeof input !== "string" || !OPENSPEC_AUTHORITATIVE_SOURCE_KINDS.includes(input as OpenSpecAuthoritativeSourceKind)) {
    throw new Error(
      `Invalid source-manifest: ${path} must be one of ${OPENSPEC_AUTHORITATIVE_SOURCE_KINDS.join(", ")}`,
    );
  }
  return input as OpenSpecAuthoritativeSourceKind;
}

function requireSha256(input: unknown, path: string): string {
  if (typeof input !== "string" || !SHA256_RE.test(input)) {
    throw new Error(`Invalid source-manifest: ${path} must be a lowercase sha256 hex digest`);
  }
  return input;
}

function requireRelativePath(input: unknown, path: string): string {
  const value = requireNonEmptyString(input, path);
  if (value.startsWith("/") || value.includes("..")) {
    throw new Error(`Invalid source-manifest: ${path} must stay inside the change directory`);
  }
  return value;
}

function requireNonEmptyString(input: unknown, path: string): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error(`Invalid source-manifest: ${path} must be a non-empty string`);
  }
  return input.trim();
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}

function assertKnownKeys(input: Record<string, unknown>, allowed: string[], path: string): void {
  const extra = Object.keys(input).filter((key) => !allowed.includes(key));
  if (extra.length > 0) {
    throw new Error(
      `Invalid ${path}: unexpected keys: ${extra.map((k) => JSON.stringify(k)).join(", ")}`,
    );
  }
}
