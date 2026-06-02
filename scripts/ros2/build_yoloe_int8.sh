#!/bin/bash
# Build YOLOE INT8 model - Host script to run export inside Docker container
# This script runs the export inside the vision-service-dev container
# Usage: ./scripts/ros2/build_yoloe_int8.sh [model_name] [input_size]

set -e

MODEL_NAME=${1:-yoloe-11s-seg-pf}
INPUT_SIZE=${2:-640}
CONTAINER_NAME="vision-service-dev"

echo "=========================================="
echo "Building YOLOE INT8 TensorRT Engine"
echo "=========================================="
echo "Model: ${MODEL_NAME}"
echo "Input Size: ${INPUT_SIZE}x${INPUT_SIZE}"
echo "Container: ${CONTAINER_NAME}"
echo ""

# Check if container is running
if ! docker ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: Container '${CONTAINER_NAME}' is not running"
    echo "Start it with: docker-compose -f docker-compose.dev.yml up -d vision-service"
    exit 1
fi

echo "✓ Container is running"

# Check if export script exists in container
EXPORT_SCRIPT="/workspace/ros2_packages/zip_vision/scripts/export_yoloe_int8_docker.sh"
if ! docker exec "${CONTAINER_NAME}" test -f "${EXPORT_SCRIPT}"; then
    echo "Error: Export script not found in container: ${EXPORT_SCRIPT}"
    echo "Make sure the script is in: ros2_packages/zip_vision/scripts/export_yoloe_int8_docker.sh"
    exit 1
fi

echo "✓ Export script found"

# Make script executable
docker exec "${CONTAINER_NAME}" chmod +x "${EXPORT_SCRIPT}"

# Run the export script inside the container
echo ""
echo "Starting export inside container..."
echo "This may take 10-30 minutes..."
echo ""

# Pass workspace size as 4th parameter (optional, script will auto-detect if not provided)
WORKSPACE_SIZE=${3:-""}
if [ -n "${WORKSPACE_SIZE}" ]; then
    docker exec -it "${CONTAINER_NAME}" bash "${EXPORT_SCRIPT}" "${MODEL_NAME}" "${INPUT_SIZE}" "int8" "${WORKSPACE_SIZE}"
else
    docker exec -it "${CONTAINER_NAME}" bash "${EXPORT_SCRIPT}" "${MODEL_NAME}" "${INPUT_SIZE}" "int8"
fi

EXPORT_STATUS=$?

if [ $EXPORT_STATUS -eq 0 ]; then
    ENGINE_FILE="ros2_packages/zip_vision/models/yoloe/${MODEL_NAME}_${INPUT_SIZE}_int8.engine"
    if [ -f "${ENGINE_FILE}" ]; then
        ENGINE_SIZE=$(du -h "${ENGINE_FILE}" | cut -f1)
        echo ""
        echo "=========================================="
        echo "✓ Export successful!"
        echo "=========================================="
        echo "Engine file: ${ENGINE_FILE}"
        echo "Engine size: ${ENGINE_SIZE}"
        echo ""
        echo "Next steps:"
        echo "1. Update docker-compose.dev.yml to use:"
        echo "   YOLOE_MODEL_PATH=/workspace/ros2_packages/zip_vision/models/yoloe/${MODEL_NAME}_${INPUT_SIZE}_int8.engine"
        echo ""
        echo "2. Restart the vision service:"
        echo "   docker-compose -f docker-compose.dev.yml restart vision-service"
    else
        echo "Warning: Export completed but engine file not found at: ${ENGINE_FILE}"
        echo "Check container logs for details"
    fi
else
    echo "Error: Export failed with exit code: ${EXPORT_STATUS}"
    echo "Check container logs for details"
    exit 1
fi
