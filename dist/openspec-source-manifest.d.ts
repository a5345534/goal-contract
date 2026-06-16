/**
 * OpenSpec source-manifest contract.
 *
 * `goal-spec` produces `source-manifest.json` and `goal-dag` consumes it
 * to locate authoritative OpenSpec change sources.  This module defines
 * the canonical shape and a pure parser so all pipeline stages validate
 * against the same contract.
 */
export declare const OPENSPEC_SOURCE_MANIFEST_SCHEMA_VERSION: "1.0";
export declare const OPENSPEC_AUTHORITATIVE_SOURCE_KINDS: readonly ["proposal", "design", "tasks", "spec-delta"];
export type OpenSpecAuthoritativeSourceKind = (typeof OPENSPEC_AUTHORITATIVE_SOURCE_KINDS)[number];
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
/**
 * Parse a JSON string as a source-manifest document.  Throws on malformed
 * JSON, missing required fields, unknown keys, or invalid field values.
 */
export declare function parseOpenSpecSourceManifestJson(content: string): OpenSpecSourceManifest;
export declare function parseOpenSpecSourceManifest(input: unknown): OpenSpecSourceManifest;
