#!/usr/bin/env bash
# Unit tests for deploy.sh: a fake `docker` on PATH records calls and can be told
# to fail the Nth `up`; a throwaway git repo stands in for the host checkout.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEPLOY="$HERE/deploy.sh"
fails=0
check() { if [ "$1" = "$2" ]; then echo "ok: $3"; else echo "FAIL: $3 (want '$2' got '$1')"; fails=$((fails+1)); fi; }

setup() {
  TMP="$(mktemp -d)"
  mkdir -p "$TMP/bin"
  cat > "$TMP/bin/docker" <<'FAKE'
#!/usr/bin/env bash
echo "$@" >> "$FAKE_DOCKER_LOG"
n=$(( $(cat "$FAKE_DOCKER_COUNT") + 1 )); echo "$n" > "$FAKE_DOCKER_COUNT"
if [ "${FAKE_DOCKER_FAIL_ON:-0}" = "$n" ]; then exit 1; fi
exit 0
FAKE
  chmod +x "$TMP/bin/docker"
  git init -q --bare "$TMP/origin.git"
  git clone -q "$TMP/origin.git" "$TMP/work"
  git -C "$TMP/work" -c user.email=t@t -c user.name=t commit -q --allow-empty -m prev
  PREV_SHA=$(git -C "$TMP/work" rev-parse HEAD)
  git -C "$TMP/work" -c user.email=t@t -c user.name=t commit -q --allow-empty -m target
  TARGET_SHA=$(git -C "$TMP/work" rev-parse HEAD)
  git -C "$TMP/work" push -q origin HEAD:main
  git -C "$TMP/work" checkout -q "$PREV_SHA"   # host starts deployed at PREV
  export FAKE_DOCKER_LOG="$TMP/docker.log"; : > "$FAKE_DOCKER_LOG"
  export FAKE_DOCKER_COUNT="$TMP/docker.count"; echo 0 > "$FAKE_DOCKER_COUNT"
  export PATH="$TMP/bin:$PATH"
  export DEPLOY_PATH="$TMP/work"
}
teardown() { rm -rf "$TMP"; unset FAKE_DOCKER_FAIL_ON; }

setup
bash "$DEPLOY" "not-a-sha" >/dev/null 2>&1; check "$?" "2" "rejects a non-sha arg"
teardown

setup
echo x > "$DEPLOY_PATH/uncommitted"; git -C "$DEPLOY_PATH" add -A
bash "$DEPLOY" "$TARGET_SHA" >/dev/null 2>&1; check "$?" "3" "refuses a dirty checkout"
teardown

setup
bash "$DEPLOY" "$TARGET_SHA" >/dev/null 2>&1; rc=$?
check "$rc" "0" "happy path exits 0"
check "$(git -C "$DEPLOY_PATH" rev-parse HEAD)" "$TARGET_SHA" "checked out the target sha"
check "$(grep -c 'up -d --build --wait' "$FAKE_DOCKER_LOG")" "1" "ran compose up once"
teardown

setup
FAKE_DOCKER_FAIL_ON=1 bash "$DEPLOY" "$TARGET_SHA" >/dev/null 2>&1; rc=$?
check "$rc" "1" "unhealthy build exits non-zero"
check "$(git -C "$DEPLOY_PATH" rev-parse HEAD)" "$PREV_SHA" "rolled back to the previous sha"
check "$(grep -c 'up -d --build --wait' "$FAKE_DOCKER_LOG")" "2" "built, then rebuilt on rollback"
teardown

if [ "$fails" = 0 ]; then echo "ALL PASS"; exit 0; else echo "$fails FAILED"; exit 1; fi
