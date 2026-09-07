import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDraftedDiff } from "./check-drafted-diff.js";

const drafted = JSON.stringify({ stages: [{ index: 0, drafted: true }, { index: 1 }] });
const cleared = JSON.stringify({ stages: [{ index: 0 }, { index: 1 }] });

test("clearing a drafted flag with no checklist entry is an error", () => {
  // #given stage 0 was drafted at the base ref and is not at the head
  // #when no checklist mentions it
  const errors = checkDraftedDiff(drafted, cleared, "", "camino-norte");
  // #then the stage is named, along with the file that has to record the review
  assert.equal(errors.length, 1);
  assert.match(errors[0], /camino-norte/);
  assert.match(errors[0], /stage 0/);
  assert.match(errors[0], /docs\/review\/camino-norte\.md/);
});

test("clearing a drafted flag with a ticked entry is allowed", () => {
  const errors = checkDraftedDiff(drafted, cleared, "- [x] stage 0\n", "camino-norte");
  assert.deepEqual(errors, []);
});

test("a section-qualified tick in a shared checklist counts", () => {
  const errors = checkDraftedDiff(drafted, cleared, "- [x] camino-norte stage 0\n", "camino-norte");
  assert.deepEqual(errors, []);
});

test("an unticked entry does not clear the flag", () => {
  const errors = checkDraftedDiff(drafted, cleared, "- [ ] stage 0\n", "camino-norte");
  assert.equal(errors.length, 1);
});

test("a stage that was never drafted is not policed", () => {
  // #given stage 1 carried no flag at either ref
  const errors = checkDraftedDiff(drafted, drafted, "", "camino-norte");
  // #then nothing is reported — this check only watches flags that disappeared
  assert.deepEqual(errors, []);
});

test("a stage still drafted at the head is left to validate", () => {
  const errors = checkDraftedDiff(drafted, drafted, "", "camino-norte");
  assert.deepEqual(errors, []);
});

test("an unparseable base ref is reported, not thrown", () => {
  const errors = checkDraftedDiff("{not json", cleared, "", "camino-norte");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /could not be read/);
});
