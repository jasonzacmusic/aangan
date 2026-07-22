-- NSM Guarded Record — a REAPER action that refuses to roll until the house says ready.
-- Install: REAPER → Actions → Show action list → New action → Load ReaScript → this file.
-- Bind it to the key you'd normally use for Record. It asks the local record-gate agent
-- (record_gate.py serve, port 8952); if the studio is not ready it shows WHY and stops.
-- If the agent itself is down it warns but lets you choose — the gate must never
-- hold your music hostage.

local function http_get(url)
  -- os.execute/popen curl: present on every macOS
  local handle = io.popen('curl -s -m 2 "' .. url .. '" 2>/dev/null')
  if not handle then return nil end
  local body = handle:read("*a")
  handle:close()
  if body == nil or body == "" then return nil end
  return body
end

local function json_field(body, key)
  -- tiny extractor, enough for {"ready": true, "reason": "..."}
  local v = body:match('"' .. key .. '"%s*:%s*(true)')
  if v then return true end
  v = body:match('"' .. key .. '"%s*:%s*(false)')
  if v then return false end
  return body:match('"' .. key .. '"%s*:%s*"([^"]*)"')
end

local body = http_get("http://127.0.0.1:8952/ready")

if body == nil then
  local ok = reaper.ShowMessageBox(
    "The NSM record gate agent is not running, so the house cannot vouch for the room.\n\nRecord anyway?",
    "Guarded Record", 4) -- yes/no
  if ok ~= 6 then return end
elseif json_field(body, "ready") ~= true then
  local reason = json_field(body, "reason") or "studio not ready"
  reaper.ShowMessageBox(
    "The studio is NOT ready:\n\n" .. tostring(reason) ..
    "\n\nFix it in Studio Command → Pre-flight, then try again.",
    "Guarded Record — blocked", 0)
  return
end

reaper.Main_OnCommand(1013, 0) -- Transport: Record
