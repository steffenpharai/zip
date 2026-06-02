# Duplicate Package Issue - FIXED ✅

## Problem
Colcon was finding packages in both:
- `/workspace/ros2_packages` (mounted volume)
- `/workspace/src` (copied packages)

This caused the error: `ERROR:colcon:colcon build: Duplicate package names not supported`

## Solution Applied

1. **Updated setup script** (`scripts/ros2/setup_workspace_in_container.sh`):
   - Cleans `src` directory before copying packages
   - Removes any existing package directories to ensure clean state
   - Copies packages from `ros2_packages` to `src` only
   - Temporarily renames `ros2_packages` during build to prevent colcon from scanning it
   - Falls back to `.colcon_ignore` if rename fails (read-only mount)

2. **Created `.colcon_ignore`** in `ros2_packages/` directory on host

3. **Build command**: Uses `colcon build` from workspace root, with `ros2_packages` hidden/ignored

## Verification

✅ **Duplicate issue FIXED**: Colcon now finds only 6 packages (in `src`), not 12
✅ **No more duplicate errors**: Build proceeds without "Duplicate package names not supported" error
✅ **Packages properly isolated**: Only packages in `src` are built

## Current Status

- ✅ Duplicate package issue: **RESOLVED**
- ⚠️ Build error: `zip_core` missing `include/` directory (separate issue, not related to duplicates)

## Test Command

```bash
# Verify no duplicates
docker exec vision-service-dev bash -c "cd /workspace && source /opt/ros/humble/install/setup.bash && colcon list 2>&1 | grep zip_ | wc -l"
# Should output: 6 (not 12)
```

## Next Steps

1. Fix `zip_core` package structure (missing `include/` directory)
2. Complete workspace build
3. Verify all packages are available
