import test from "node:test";
import assert from "node:assert/strict";
import {
  parseOpenSpecSourceManifest,
  parseOpenSpecSourceManifestJson,
  OPENSPEC_SOURCE_MANIFEST_SCHEMA_VERSION,
  OPENSPEC_AUTHORITATIVE_SOURCE_KINDS,
} from "../openspec-source-manifest.js";

const validManifest = {
  schemaVersion: OPENSPEC_SOURCE_MANIFEST_SCHEMA_VERSION,
  changeName: "fix-bug",
  generatedAt: "2025-01-01T00:00:00Z",
  sources: [
    { path: "proposal.md", kind: "proposal", sha256: "0000000000000000000000000000000000000000000000000000000000000000" },
    { path: "specs/feature/spec.md", kind: "spec-delta", sha256: "1111111111111111111111111111111111111111111111111111111111111111" },
  ],
};

test("accepts valid manifest", () => {
  const doc = parseOpenSpecSourceManifest(validManifest);
  assert.equal(doc.schemaVersion, "1.0");
  assert.equal(doc.changeName, "fix-bug");
  assert.equal(doc.sources.length, 2);
  assert.equal(doc.sources[0].kind, "proposal");
});

test("accepts valid manifest JSON string", () => {
  const doc = parseOpenSpecSourceManifestJson(JSON.stringify(validManifest));
  assert.equal(doc.changeName, "fix-bug");
});

test("rejects schemaVersion !== \"1.0\"", () => {
  assert.throws(
    () => parseOpenSpecSourceManifest({ ...validManifest, schemaVersion: "2.0" }),
    /schemaVersion/,
  );
});

test("rejects missing root keys", () => {
  assert.throws(
    () => parseOpenSpecSourceManifest({ schemaVersion: "1.0", sources: [] }),
    /changeName/,
  );
  assert.throws(
    () => parseOpenSpecSourceManifest({ schemaVersion: "1.0", changeName: "x", sources: [] }),
    /generatedAt/,
  );
});

test("rejects extra root keys", () => {
  assert.throws(
    () => parseOpenSpecSourceManifest({ ...validManifest, extra: true }),
    /unexpected keys/,
  );
});

test("rejects invalid source kind", () => {
  const manifest = {
    ...validManifest,
    sources: [{ path: "x.md", kind: "not-a-kind", sha256: "0000000000000000000000000000000000000000000000000000000000000000" }],
  };
  assert.throws(() => parseOpenSpecSourceManifest(manifest), /sources\[0\]/);
});

test("rejects uppercase sha256", () => {
  const manifest = {
    ...validManifest,
    sources: [{ ...validManifest.sources[0], sha256: "ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef0123456789" }],
  };
  assert.throws(() => parseOpenSpecSourceManifest(manifest), /sha256/);
});

test("rejects malformed sha256", () => {
  const manifest = {
    ...validManifest,
    sources: [{ ...validManifest.sources[0], sha256: "short" }],
  };
  assert.throws(() => parseOpenSpecSourceManifest(manifest), /sha256/);
});

test("rejects absolute path", () => {
  const manifest = {
    ...validManifest,
    sources: [{ path: "/abs/path.md", kind: "proposal", sha256: "0000000000000000000000000000000000000000000000000000000000000000" }],
  };
  assert.throws(() => parseOpenSpecSourceManifest(manifest), /path/);
});

test("rejects path containing ..", () => {
  const manifest = {
    ...validManifest,
    sources: [{ path: "../escape.md", kind: "proposal", sha256: "0000000000000000000000000000000000000000000000000000000000000000" }],
  };
  assert.throws(() => parseOpenSpecSourceManifest(manifest), /path/);
});

test("rejects empty sources", () => {
  assert.throws(
    () => parseOpenSpecSourceManifest({ ...validManifest, sources: [] }),
    /sources/,
  );
});

test("rejects missing source required fields", () => {
  assert.throws(
    () => parseOpenSpecSourceManifest({
      ...validManifest,
      sources: [{ path: "x.md" }],
    }),
    /kind/,
  );
});

test("rejects source extra keys", () => {
  assert.throws(
    () => parseOpenSpecSourceManifest({
      ...validManifest,
      sources: [{ ...validManifest.sources[0], extra: 1 }],
    }),
    /unexpected keys/,
  );
});

test("all authoritative source kinds are valid", () => {
  for (const kind of OPENSPEC_AUTHORITATIVE_SOURCE_KINDS) {
    const manifest = {
      ...validManifest,
      sources: [{ path: "x.md", kind, sha256: "0000000000000000000000000000000000000000000000000000000000000000" }],
    };
    const doc = parseOpenSpecSourceManifest(manifest);
    assert.equal(doc.sources[0].kind, kind);
  }
});

test("rejects non-object root", () => {
  assert.throws(() => parseOpenSpecSourceManifest(null), /object/);
  assert.throws(() => parseOpenSpecSourceManifest("bad"), /object/);
  assert.throws(() => parseOpenSpecSourceManifest([]), /object/);
});

test("rejects malformed JSON string", () => {
  assert.throws(() => parseOpenSpecSourceManifestJson("{invalid"), /JSON/);
});
