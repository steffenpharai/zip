#!/usr/bin/env python3
"""Take livedemo positions but use pure-white, 10cm, opaque gaussians.
Isolates whether the issue is positions or per-splat appearance fields."""
import struct, math, sys, os
from pathlib import Path

src = Path.home() / "splat-lab" / "scenes" / "livedemo" / "scene.compressed.ply"
out = Path("scene.compressed.ply")
if not src.exists():
    sys.exit(f"missing {src}")

with src.open("rb") as f:
    data = f.read()

# parse header
hdr_end = data.find(b"end_header\n") + len(b"end_header\n")
header = data[:hdr_end].decode()
props = []
nv = 0
for ln in header.split("\n"):
    if ln.startswith("element vertex"): nv = int(ln.split()[-1])
    if ln.startswith("property float"): props.append(ln.split()[-1])
stride = 4 * len(props)
body = data[hdr_end:]

SH_C0 = 0.28209479177387814
DC_WHITE = (1.0 - 0.5) / SH_C0   # 1.7725
LOG_SCALE = math.log(0.10)        # 10 cm
OPACITY = 4.6

ix = props.index("x"); iy = props.index("y"); iz = props.index("z")
i_dc = [props.index("f_dc_0"), props.index("f_dc_1"), props.index("f_dc_2")]
i_op = props.index("opacity")
i_sc = [props.index("scale_0"), props.index("scale_1"), props.index("scale_2")]
i_rot = [props.index("rot_0"), props.index("rot_1"), props.index("rot_2"), props.index("rot_3")]

# Down-sample to 5000 gaussians for clarity
import random
rng = random.Random(0)
keep = sorted(rng.sample(range(nv), min(5000, nv)))

new_body = bytearray()
fmt = "<" + "f" * len(props)
for i in keep:
    off = i * stride
    vals = list(struct.unpack(fmt, body[off:off + stride]))
    # preserve positions only
    vals[i_dc[0]] = DC_WHITE
    vals[i_dc[1]] = DC_WHITE
    vals[i_dc[2]] = DC_WHITE
    vals[i_op] = OPACITY
    vals[i_sc[0]] = vals[i_sc[1]] = vals[i_sc[2]] = LOG_SCALE
    vals[i_rot[0]] = 1.0; vals[i_rot[1]] = vals[i_rot[2]] = vals[i_rot[3]] = 0.0
    new_body.extend(struct.pack(fmt, *vals))

new_nv = len(keep)
new_header = []
for ln in header.split("\n"):
    if ln.startswith("element vertex"):
        new_header.append(f"element vertex {new_nv}")
    else:
        new_header.append(ln)
new_header_bytes = "\n".join(new_header).encode() + b"\n"
# the original header already ends with "\n" before end_header — keep that
with out.open("wb") as f:
    f.write(new_header_bytes if new_header_bytes.endswith(b"end_header\n") else new_header_bytes)
    f.write(bytes(new_body))
print(f"wrote {out}: {new_nv} gaussians, {os.path.getsize(out)} bytes")
