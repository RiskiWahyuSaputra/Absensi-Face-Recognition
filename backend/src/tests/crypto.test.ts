import test from "node:test";
import assert from "node:assert/strict";
import { decryptFaceVector, encryptFaceVector } from "../utils/crypto";
import { cosineSimilarity, findBestMatch } from "../utils/similarity";

test("AES-256-GCM encrypts and decrypts 128-dim face vectors accurately", () => {
  const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const vector = Array.from({ length: 128 }, (_, i) => Number(((i - 64) / 100).toFixed(4)));

  const encrypted = encryptFaceVector(vector, key);
  assert.equal(encrypted.split(":").length, 3);
  assert.ok(!encrypted.includes(String(vector[0])));

  const decrypted = decryptFaceVector(encrypted, key);
  assert.deepEqual(decrypted, vector);
});

test("Cosine similarity and findBestMatch return highest matching employee", () => {
  const probe = [1, 0, 0, 0];
  const best = findBestMatch(probe, [
    { employeeId: "emp-a", embedding: [0, 1, 0, 0] },
    { employeeId: "emp-b", embedding: [0.95, 0.31, 0, 0] },
  ]);

  assert.ok(best);
  assert.equal(best.employeeId, "emp-b");
  assert.ok(best.score > 0.9);
  assert.equal(Math.round(cosineSimilarity(probe, probe) * 1000) / 1000, 1);
});
