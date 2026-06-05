#!/usr/bin/env python3
"""Validate a binary 3DGS PLY: parses header, reads first/last vertex,
asserts the standard schema, prints field stats. Catches off-by-one and
endianness bugs before shipping to a viewer."""
import struct
import sys

REQUIRED = [
    "x","y","z","nx","ny","nz",
    "f_dc_0","f_dc_1","f_dc_2",
    "opacity",
    "scale_0","scale_1","scale_2",
    "rot_0","rot_1","rot_2","rot_3",
]

def validate(path: str):
    with open(path, "rb") as f:
        # parse header (ascii until "end_header\n")
        header_bytes = b""
        while not header_bytes.endswith(b"end_header\n"):
            ch = f.read(1)
            if not ch:
                raise ValueError("EOF in header")
            header_bytes += ch
        header_offset = f.tell()
        header = header_bytes.decode("ascii")

        # parse header
        lines = header.strip().split("\n")
        assert lines[0] == "ply", f"not a PLY: {lines[0]!r}"
        fmt = lines[1]
        assert "binary_little_endian" in fmt, f"unexpected format: {fmt!r}"

        n_vertex = None
        props = []
        for line in lines:
            if line.startswith("element vertex"):
                n_vertex = int(line.split()[-1])
            elif line.startswith("property float"):
                props.append(line.split()[-1])
            elif line.startswith("property "):
                # only float supported for 3DGS minimal
                pass

        assert n_vertex is not None, "no vertex element"
        # ensure required props are present
        missing = [p for p in REQUIRED if p not in props]
        assert not missing, f"missing required props: {missing}"

        n_props = len(props)
        vertex_size = 4 * n_props  # all float32
        body = f.read()
        expected_body_size = n_vertex * vertex_size
        assert len(body) == expected_body_size, \
            f"body size mismatch: got {len(body)}, expected {expected_body_size}"

        # parse first + last vertex
        first = struct.unpack("<" + "f" * n_props, body[:vertex_size])
        last = struct.unpack("<" + "f" * n_props,
                             body[(n_vertex - 1) * vertex_size:n_vertex * vertex_size])

        # compute simple stats over all vertices to catch all-zero, NaN, inf
        import math
        idx_x, idx_y, idx_z = props.index("x"), props.index("y"), props.index("z")
        idx_op = props.index("opacity")
        idx_sc0 = props.index("scale_0")
        xs, ys, zs, ops, scs = [], [], [], [], []
        for i in range(0, n_vertex, max(1, n_vertex // 200)):  # sample
            v = struct.unpack("<" + "f" * n_props, body[i * vertex_size:(i + 1) * vertex_size])
            for val in v:
                if math.isnan(val) or math.isinf(val):
                    raise AssertionError(f"NaN/inf at vertex {i}")
            xs.append(v[idx_x]); ys.append(v[idx_y]); zs.append(v[idx_z])
            ops.append(v[idx_op]); scs.append(v[idx_sc0])

        def s(arr): return f"min={min(arr):.3f} max={max(arr):.3f}"

        print(f"OK: {path}")
        print(f"  header bytes:   {header_offset}")
        print(f"  n_vertex:       {n_vertex}")
        print(f"  n_props/vertex: {n_props}  ({vertex_size} bytes/vertex)")
        print(f"  body size:      {len(body)}  (matches)")
        print(f"  first vertex (x,y,z,dc0,opacity,scale0):"
              f" {first[0]:.3f}, {first[1]:.3f}, {first[2]:.3f},"
              f" {first[6]:.3f}, {first[idx_op]:.3f}, {first[idx_sc0]:.3f}")
        print(f"  x: {s(xs)}")
        print(f"  y: {s(ys)}")
        print(f"  z: {s(zs)}")
        print(f"  opacity (logit): {s(ops)}")
        print(f"  scale_0 (log):   {s(scs)}")
        if max(abs(min(xs)), abs(max(xs))) < 1e-6:
            raise AssertionError("CANARY: all-zero geometry — viewer will render nothing")
        return True

if __name__ == "__main__":
    p = sys.argv[1] if len(sys.argv) > 1 else "scene.compressed.ply"
    validate(p)
