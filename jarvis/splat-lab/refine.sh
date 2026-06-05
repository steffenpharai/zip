#!/bin/bash
# splat-lab Stage B — gsplat 1.5.3 photometric refine of a baked DA3 scene.
#
# Usage:  ./refine.sh <scan_id> [iters] [max_gaussians]
#
# Consumes output/<scan_id>/{depth.npy,conf.npy,poses.json} + frames, runs a
# short photometric optimization (Apache-2.0 gsplat in splat-lab:latest), and
# overwrites scenes/<scan_id>/scene.compressed.ply with the refined splat.
# The mkkellogg viewer (index.html) picks it up automatically.
#
# NOTE: refine quality scales with CAPTURE PARALLAX. A static capture only
# sharpens appearance; a slow-walk capture gains real 3D structure.
set -euo pipefail

SCAN_ID="${1:?usage: refine.sh <scan_id> [iters] [max_gaussians]}"
ITERS="${2:-400}"
MAXG="${3:-120000}"
SPLAT_LAB="${HOME}/splat-lab"

if systemctl is-active --quiet zip-brain.service 2>/dev/null; then
  echo "ABORT: zip-brain.service active — stop it first"; exit 1
fi
# free the camera daemon's ~2.8 GB so the trainer fits in 8 GB
pkill -9 -f live_stream.py 2>/dev/null || true
sleep 2

echo "=== gsplat refine  scan=${SCAN_ID}  iters=${ITERS}  max_gaussians=${MAXG} ==="
# Persist gsplat's JIT-compiled CUDA extension across runs (first build ~6 min,
# cached thereafter). Without this every --rm run recompiles for sm_87.
mkdir -p "${SPLAT_LAB}/.gsplat-cache"
t0=$(date +%s)
sudo docker run --rm --runtime nvidia --network host \
    -v "${SPLAT_LAB}:/workspace" \
    -v "${SPLAT_LAB}/.gsplat-cache:/root/.cache/torch_extensions" \
    --env SPLAT_LAB=/workspace \
    splat-lab:latest python3 /workspace/scripts/train_gsplat.py \
    --scan-id "${SCAN_ID}" --iters "${ITERS}" --max-gaussians "${MAXG}"

# dashboard poster — headless gsplat render of the refined scene
sudo docker run --rm --runtime nvidia --network host \
    -v "${SPLAT_LAB}:/workspace" \
    -v "${SPLAT_LAB}/.gsplat-cache:/root/.cache/torch_extensions" \
    --env SPLAT_LAB=/workspace \
    splat-lab:latest python3 /workspace/scripts/render_ply.py \
    --scan-id "${SCAN_ID}" --views 3 --res 720 || true
sudo chown -R "$(id -un):$(id -gn)" "${SPLAT_LAB}/scenes/${SCAN_ID}"
chmod o+rx "${SPLAT_LAB}/scenes/${SCAN_ID}" 2>/dev/null || true
chmod o+r "${SPLAT_LAB}/scenes/${SCAN_ID}"/* 2>/dev/null || true
t1=$(date +%s)
echo "=== refine done in $((t1 - t0))s ==="
echo "view:  http://localhost:8090/${SCAN_ID}/   (via the jetson-splat SSH tunnel)"
echo "NOTE: restart the live dashboard when done:"
echo "  nohup ~/perception-lab/.venv/bin/python ${SPLAT_LAB}/scripts/live_stream.py --port 8092 </dev/null >${SPLAT_LAB}/logs/live_stream.log 2>&1 & disown"
