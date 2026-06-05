#!/bin/bash
# splat-lab launcher — end-to-end pipeline for ONE scan_id.
#
# Usage:  ./launcher.sh <scan_id> [duration_s] [max_views]
#
# Steps:
#   1. capture.py     — C615 → keyframes + YOLO11n detections.jsonl
#   2. bake.py        — DA3-SMALL in container → poses + depth + live.ply
#   3. annotate.py    — project YOLO detections → settings.json hotspots
#   4. perms fix      — chown scenes/ for nginx
#   5. summary        — print final URLs
#
# Outputs live at  http://<jetson-ip>:8090/<scan_id>/
set -euo pipefail

SCAN_ID="${1:?usage: launcher.sh <scan_id> [duration_s] [max_views]}"
DURATION="${2:-90}"
MAX_VIEWS="${3:-4}"      # 4 is the steady-safe cap on Orin Nano 8GB

SPLAT_LAB="${HOME}/splat-lab"
JETSON_IP=$(hostname -I | awk '{print $1}')
LOG_DIR="${SPLAT_LAB}/logs"
mkdir -p "${LOG_DIR}"
RUN_LOG="${LOG_DIR}/${SCAN_ID}_$(date +%s).log"

echo "================================================================" | tee -a "${RUN_LOG}"
echo "splat-lab launcher  scan_id=${SCAN_ID}  duration=${DURATION}s  views=${MAX_VIEWS}" | tee -a "${RUN_LOG}"
echo "  jetson IP: ${JETSON_IP}"  | tee -a "${RUN_LOG}"
echo "  log:       ${RUN_LOG}"    | tee -a "${RUN_LOG}"
echo "================================================================" | tee -a "${RUN_LOG}"

# --- safety: brain service must be off (it owns /dev/video0 + ~2GB RAM) -----
if systemctl is-active --quiet zip-brain.service 2>/dev/null; then
  echo "ABORT: zip-brain.service is active — stop it first:  sudo systemctl stop zip-brain.service" | tee -a "${RUN_LOG}"
  exit 1
fi

# --- 1) capture --------------------------------------------------------------
echo "[step 1/3] capture ${DURATION}s on /dev/video0 ..." | tee -a "${RUN_LOG}"
t0=$(date +%s)
"${HOME}/perception-lab/.venv/bin/python" \
    "${SPLAT_LAB}/scripts/capture.py" \
    --scan-id "${SCAN_ID}" --duration "${DURATION}" --target-fps 2 \
    2>&1 | tee -a "${RUN_LOG}"
t1=$(date +%s)
echo "  capture took $((t1 - t0))s" | tee -a "${RUN_LOG}"

# --- 2) bake ---------------------------------------------------------------
echo "[step 2/3] DA3-SMALL bake (${MAX_VIEWS} views) ..." | tee -a "${RUN_LOG}"
t0=$(date +%s)
sudo docker run --rm --runtime nvidia --network host \
    -v "${SPLAT_LAB}:/workspace" \
    --env HF_HOME=/workspace/models/hf-cache \
    --env TORCH_HOME=/workspace/models/torch-cache \
    --env SPLAT_LAB=/workspace \
    splat-lab:latest python3 /workspace/scripts/bake.py \
    --scan-id "${SCAN_ID}" \
    --max-views "${MAX_VIEWS}" \
    --process-res 504 \
    --pixel-stride 2 \
    --conf-pct 25 \
    --max-gaussians 300000 \
    2>&1 | tee -a "${RUN_LOG}"
sudo chown -R zip:zip "${SPLAT_LAB}/scenes/${SCAN_ID}"  "${SPLAT_LAB}/output/${SCAN_ID}"
t1=$(date +%s)
echo "  bake took $((t1 - t0))s" | tee -a "${RUN_LOG}"

# --- 3) annotate ------------------------------------------------------------
echo "[step 3/3] auto-annotations from YOLO ..." | tee -a "${RUN_LOG}"
t0=$(date +%s)
SPLAT_LAB="${SPLAT_LAB}" "${SPLAT_LAB}/.venv/bin/python" \
    "${SPLAT_LAB}/scripts/annotate.py" \
    --scan-id "${SCAN_ID}" --min-conf 0.30 --cluster-eps 0.3 \
    2>&1 | tee -a "${RUN_LOG}"
t1=$(date +%s)
echo "  annotate took $((t1 - t0))s" | tee -a "${RUN_LOG}"

# --- final perms + summary ---------------------------------------------------
chmod o+x "${SPLAT_LAB}" "${SPLAT_LAB}/scenes" "${SPLAT_LAB}/scenes/${SCAN_ID}" 2>/dev/null || true
chmod o+r "${SPLAT_LAB}/scenes/${SCAN_ID}"/* 2>/dev/null || true

echo "" | tee -a "${RUN_LOG}"
echo "============================ READY ============================" | tee -a "${RUN_LOG}"
echo "Walkthrough URL:" | tee -a "${RUN_LOG}"
echo "  http://${JETSON_IP}:8090/${SCAN_ID}/" | tee -a "${RUN_LOG}"
echo "  http://192.168.55.1:8090/${SCAN_ID}/   (USB-C side)" | tee -a "${RUN_LOG}"
echo "" | tee -a "${RUN_LOG}"
echo "Files:" | tee -a "${RUN_LOG}"
ls -lh "${SPLAT_LAB}/scenes/${SCAN_ID}/" | tee -a "${RUN_LOG}"
echo "================================================================" | tee -a "${RUN_LOG}"
