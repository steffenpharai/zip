# FindTensorRT.cmake
# Finds TensorRT library on Jetson (installed via JetPack packages)

find_path(TensorRT_INCLUDE_DIR
    NAMES NvInfer.h
    PATHS
        /usr/include/aarch64-linux-gnu
        /usr/local/include
        /usr/include
    PATH_SUFFIXES
        tensorrt
)

find_library(TensorRT_LIBRARY
    NAMES nvinfer
    PATHS
        /usr/lib/aarch64-linux-gnu
        /usr/local/lib
        /usr/lib
)

find_library(TensorRT_PLUGIN_LIBRARY
    NAMES nvinfer_plugin
    PATHS
        /usr/lib/aarch64-linux-gnu
        /usr/local/lib
        /usr/lib
)

# Set variables
if(TensorRT_INCLUDE_DIR AND TensorRT_LIBRARY)
    set(TensorRT_FOUND TRUE)
    set(TensorRT_INCLUDE_DIRS ${TensorRT_INCLUDE_DIR})
    set(TensorRT_LIBRARIES ${TensorRT_LIBRARY} ${TensorRT_PLUGIN_LIBRARY})
    
    # Get version if possible
    if(EXISTS "${TensorRT_INCLUDE_DIR}/NvInferVersion.h")
        file(READ "${TensorRT_INCLUDE_DIR}/NvInferVersion.h" TENSORRT_VERSION_FILE)
        string(REGEX MATCH "#define NV_TENSORRT_MAJOR ([0-9]+)" _ ${TENSORRT_VERSION_FILE})
        set(TensorRT_VERSION_MAJOR ${CMAKE_MATCH_1})
        string(REGEX MATCH "#define NV_TENSORRT_MINOR ([0-9]+)" _ ${TENSORRT_VERSION_FILE})
        set(TensorRT_VERSION_MINOR ${CMAKE_MATCH_1})
        string(REGEX MATCH "#define NV_TENSORRT_PATCH ([0-9]+)" _ ${TENSORRT_VERSION_FILE})
        set(TensorRT_VERSION_PATCH ${CMAKE_MATCH_1})
        set(TensorRT_VERSION "${TensorRT_VERSION_MAJOR}.${TensorRT_VERSION_MINOR}.${TensorRT_VERSION_PATCH}")
    endif()
else()
    set(TensorRT_FOUND FALSE)
endif()

# Print status
if(TensorRT_FOUND)
    if(NOT TensorRT_FIND_QUIETLY)
        message(STATUS "Found TensorRT: ${TensorRT_LIBRARY}")
        if(TensorRT_VERSION)
            message(STATUS "  Version: ${TensorRT_VERSION}")
        endif()
        message(STATUS "  Include: ${TensorRT_INCLUDE_DIRS}")
    endif()
else()
    if(TensorRT_FIND_REQUIRED)
        message(FATAL_ERROR "Could not find TensorRT")
    endif()
endif()

mark_as_advanced(
    TensorRT_INCLUDE_DIR
    TensorRT_LIBRARY
    TensorRT_PLUGIN_LIBRARY
)
