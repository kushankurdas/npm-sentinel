import test from "node:test";
import assert from "node:assert/strict";
import { resolveSshMountPath } from "../lib/sandbox/docker-runner.js";

test("resolveSshMountPath empty when disabled", () => {
  const r = resolveSshMountPath({ mountSsh: false, sshMountPath: null });
  assert.equal(r.error, undefined);
  assert.equal(r.path, "");
});

test("resolveSshMountPath uses homedir when mountSsh", () => {
  const r = resolveSshMountPath({ mountSsh: true, sshMountPath: null });
  if (r.error) {
    assert.match(r.error, /does not exist/);
  } else {
    assert.match(r.path, /\.ssh$/);
  }
});

test("resolveSshMountPath errors for missing explicit path", () => {
  const r = resolveSshMountPath({
    mountSsh: false,
    sshMountPath: "/nonexistent-npm-sentinel-ssh-test",
  });
  assert.ok(r.error);
});
