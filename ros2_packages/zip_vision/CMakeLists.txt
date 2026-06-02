cmake_minimum_required(VERSION 3.8)
project(zip_vision)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# Add custom cmake modules path (before find_package calls)
list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

# Find dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(std_msgs REQUIRED)
find_package(sensor_msgs REQUIRED)
find_package(cv_bridge REQUIRED)
find_package(image_transport REQUIRED)
find_package(vision_msgs REQUIRED)

# Generate custom service
rosidl_generate_interfaces(${PROJECT_NAME}
  "srv/VLMInference.srv"
  DEPENDENCIES sensor_msgs
)
find_package(OpenCV REQUIRED)
find_package(CUDA REQUIRED)

# Find TensorRT (custom module for Jetson)
find_package(TensorRT REQUIRED)

# Include directories (only if include directory exists)
if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/include")
  include_directories(include)
endif()
include_directories(${OpenCV_INCLUDE_DIRS})

# Install directories (only if they exist)
if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/include")
  install(DIRECTORY include/
    DESTINATION include
  )
endif()

if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/launch")
  install(DIRECTORY launch/
    DESTINATION share/${PROJECT_NAME}/launch
  )
endif()

if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/config")
  install(DIRECTORY config/
    DESTINATION share/${PROJECT_NAME}/config
  )
endif()

# Install Python package
install(DIRECTORY zip_vision/
  DESTINATION lib/python3.10/site-packages/zip_vision
  FILES_MATCHING PATTERN "*.py"
)

# Install Python executables
install(PROGRAMS
  zip_vision/vlm_service_node.py
  src/vision_diagnostics_bridge.py
  src/yoloe_ros_node.py
  DESTINATION lib/${PROJECT_NAME}
)

# YOLOE Engine Library
add_library(yoloe_engine src/yoloe_engine.cpp)
ament_target_dependencies(yoloe_engine
  rclcpp
  std_msgs
  sensor_msgs
  cv_bridge
)
target_include_directories(yoloe_engine PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>
  ${CUDA_INCLUDE_DIRS}
  ${TensorRT_INCLUDE_DIRS}
)
# Use linker flags to allow undefined symbols - DLA driver symbols provided at runtime
# These symbols are provided by Jetson kernel modules/drivers when the program runs
target_link_options(yoloe_engine PRIVATE
    "-Wl,--unresolved-symbols=ignore-all"
    "-Wl,-rpath,/usr/lib/aarch64-linux-gnu:/usr/lib/aarch64-linux-gnu/nvidia"
    "-Wl,--no-as-needed"
    "-L/usr/lib/aarch64-linux-gnu"
    "-L/usr/lib/aarch64-linux-gnu/nvidia"
)

target_link_libraries(yoloe_engine 
  ${OpenCV_LIBS}
  ${TensorRT_LIBRARIES}
  nvinfer
  nvinfer_plugin
)

# Link CUDA shared libraries explicitly, avoiding compat and static
if(EXISTS "/usr/lib/aarch64-linux-gnu/libcuda.so")
    target_link_libraries(yoloe_engine 
        /usr/lib/aarch64-linux-gnu/libcuda.so
    )
    # Add shared CUDA runtime if available
    if(EXISTS "/usr/local/cuda-12.6/targets/aarch64-linux/lib/libcudart.so")
        target_link_libraries(yoloe_engine /usr/local/cuda-12.6/targets/aarch64-linux/lib/libcudart.so)
    elseif(EXISTS "/usr/local/cuda/lib64/libcudart.so")
        target_link_libraries(yoloe_engine /usr/local/cuda/lib64/libcudart.so)
    endif()
else()
    target_link_libraries(yoloe_engine ${CUDA_LIBRARIES})
endif()

# Set rpath to find libraries at runtime (including nvidia subdirectory)
# Use unresolved-symbols=ignore-all to allow DLA driver symbols (provided at runtime)
set_target_properties(yoloe_engine PROPERTIES
  INSTALL_RPATH "${CMAKE_INSTALL_PREFIX}/lib:/usr/lib/aarch64-linux-gnu:/usr/lib/aarch64-linux-gnu/nvidia:/usr/local/cuda-12.6/targets/aarch64-linux/lib"
  BUILD_WITH_INSTALL_RPATH TRUE
  LINK_FLAGS "-Wl,--unresolved-symbols=ignore-all -Wl,-rpath,/usr/lib/aarch64-linux-gnu:/usr/lib/aarch64-linux-gnu/nvidia -L/usr/lib/aarch64-linux-gnu -L/usr/lib/aarch64-linux-gnu/nvidia"
)
install(TARGETS yoloe_engine
  ARCHIVE DESTINATION lib
  LIBRARY DESTINATION lib
  RUNTIME DESTINATION bin
)

# YOLOE Node (optional - can be disabled if CUDA compat issues)
option(BUILD_YOLOE_NODE "Build YOLOE node" ON)

if(BUILD_YOLOE_NODE)
add_executable(yoloe_node src/yoloe_node.cpp)
ament_target_dependencies(yoloe_node
  rclcpp
  std_msgs
  sensor_msgs
  cv_bridge
  image_transport
  vision_msgs
)
target_include_directories(yoloe_node PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>
)
# Use linker flags to allow undefined symbols - DLA driver symbols provided at runtime
# These symbols are provided by Jetson kernel modules/drivers when the program runs
target_link_options(yoloe_node PRIVATE
    "-Wl,--unresolved-symbols=ignore-all"
    "-Wl,-rpath,/usr/lib/aarch64-linux-gnu:/usr/lib/aarch64-linux-gnu/nvidia"
    "-Wl,--no-as-needed"
    "-L/usr/lib/aarch64-linux-gnu"
    "-L/usr/lib/aarch64-linux-gnu/nvidia"
)

target_link_libraries(yoloe_node 
  yoloe_engine 
  ${OpenCV_LIBS}
  ${TensorRT_LIBRARIES}
  nvinfer
  nvinfer_plugin
)

# Link CUDA and NVIDIA runtime libraries explicitly
if(EXISTS "/usr/lib/aarch64-linux-gnu/libcuda.so")
    target_link_libraries(yoloe_node 
        /usr/lib/aarch64-linux-gnu/libcuda.so
    )
    # Add shared CUDA runtime
    if(EXISTS "/usr/local/cuda-12.6/targets/aarch64-linux/lib/libcudart.so")
        target_link_libraries(yoloe_node /usr/local/cuda-12.6/targets/aarch64-linux/lib/libcudart.so)
    elseif(EXISTS "/usr/local/cuda/lib64/libcudart.so")
        target_link_libraries(yoloe_node /usr/local/cuda/lib64/libcudart.so)
    endif()
else()
    target_link_libraries(yoloe_node ${CUDA_LIBRARIES})
endif()

# Set rpath to find libraries at runtime (including nvidia subdirectory)
# Exclude compat directory from library search
set_target_properties(yoloe_node PROPERTIES
  INSTALL_RPATH "${CMAKE_INSTALL_PREFIX}/lib:/usr/lib/aarch64-linux-gnu:/usr/lib/aarch64-linux-gnu/nvidia:/usr/local/cuda-12.6/targets/aarch64-linux/lib"
  BUILD_WITH_INSTALL_RPATH TRUE
  LINK_FLAGS "-Wl,--exclude-libs,ALL -Wl,-rpath,/usr/lib/aarch64-linux-gnu:/usr/lib/aarch64-linux-gnu/nvidia -L/usr/lib/aarch64-linux-gnu -L/usr/lib/aarch64-linux-gnu/nvidia"
)
install(TARGETS yoloe_node
  DESTINATION lib/${PROJECT_NAME}
)
endif()  # BUILD_YOLOE_NODE

# VLM Engine Library
add_library(vlm_engine src/vlm_engine.cpp)
ament_target_dependencies(vlm_engine
  rclcpp
  std_msgs
  sensor_msgs
  cv_bridge
)
target_include_directories(vlm_engine PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>
)
target_link_libraries(vlm_engine ${OpenCV_LIBS})
install(TARGETS vlm_engine
  ARCHIVE DESTINATION lib
  LIBRARY DESTINATION lib
  RUNTIME DESTINATION bin
)

# VLM Node
add_executable(vlm_node src/vlm_node.cpp)
ament_target_dependencies(vlm_node
  rclcpp
  std_msgs
  sensor_msgs
  cv_bridge
  image_transport
  vision_msgs
)
target_include_directories(vlm_node PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>
)
rosidl_target_interfaces(vlm_node ${PROJECT_NAME} "rosidl_typesupport_cpp")
target_link_libraries(vlm_node vlm_engine ${OpenCV_LIBS})
install(TARGETS vlm_node
  DESTINATION lib/${PROJECT_NAME}
)

# Diagnostics Bridge Node
add_executable(diagnostics_bridge_node src/diagnostics_bridge_node.cpp)
ament_target_dependencies(diagnostics_bridge_node
  rclcpp
  std_msgs
  sensor_msgs
  cv_bridge
  image_transport
  vision_msgs
)
target_include_directories(diagnostics_bridge_node PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>
)
target_link_libraries(diagnostics_bridge_node ${OpenCV_LIBS})
install(TARGETS diagnostics_bridge_node
  DESTINATION lib/${PROJECT_NAME}
)

# Standalone YOLOE test (no ROS 2 dependencies) - DISABLED by default due to CUDA DLA issues
option(BUILD_YOLOE_TEST "Build YOLOE test executable" OFF)

if(BUILD_YOLOE_NODE AND BUILD_YOLOE_TEST)
add_executable(test_yoloe_standalone src/test_yoloe_standalone.cpp)

# Use linker flags to allow undefined symbols - DLA driver symbols provided at runtime
target_link_options(test_yoloe_standalone PRIVATE
    "-Wl,--unresolved-symbols=ignore-all"
    "-Wl,-rpath,/usr/lib/aarch64-linux-gnu:/usr/lib/aarch64-linux-gnu/nvidia"
    "-Wl,--no-as-needed"
    "-L/usr/lib/aarch64-linux-gnu"
    "-L/usr/lib/aarch64-linux-gnu/nvidia"
)
target_include_directories(test_yoloe_standalone PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>
)
target_link_libraries(test_yoloe_standalone 
  yoloe_engine 
  ${OpenCV_LIBS}
)

# Link CUDA libraries explicitly, avoiding compat
# Also link NVIDIA runtime libraries
if(EXISTS "/usr/lib/aarch64-linux-gnu/libcuda.so")
    target_link_libraries(test_yolo11_standalone /usr/lib/aarch64-linux-gnu/libcuda.so)
    # Add shared CUDA runtime
    if(EXISTS "/usr/local/cuda-12.6/targets/aarch64-linux/lib/libcudart.so")
        target_link_libraries(test_yolo11_standalone /usr/local/cuda-12.6/targets/aarch64-linux/lib/libcudart.so)
    elseif(EXISTS "/usr/local/cuda/lib64/libcudart.so")
        target_link_libraries(test_yolo11_standalone /usr/local/cuda/lib64/libcudart.so)
    endif()
    # Link NVIDIA runtime libraries
    if(EXISTS "/usr/lib/aarch64-linux-gnu/nvidia/libnvrm_gpu.so")
        target_link_libraries(test_yolo11_standalone /usr/lib/aarch64-linux-gnu/nvidia/libnvrm_gpu.so)
    endif()
    if(EXISTS "/usr/lib/aarch64-linux-gnu/nvidia/libnvrm_mem.so")
        target_link_libraries(test_yolo11_standalone /usr/lib/aarch64-linux-gnu/nvidia/libnvrm_mem.so)
    endif()
    if(EXISTS "/usr/lib/aarch64-linux-gnu/nvidia/libnvdla_compiler.so")
        target_link_libraries(test_yolo11_standalone /usr/lib/aarch64-linux-gnu/nvidia/libnvdla_compiler.so)
    endif()
    if(EXISTS "/usr/lib/aarch64-linux-gnu/nvidia/libnvdla_runtime.so")
        target_link_libraries(test_yolo11_standalone /usr/lib/aarch64-linux-gnu/nvidia/libnvdla_runtime.so)
    endif()
    # Set rpath
    set_target_properties(test_yoloe_standalone PROPERTIES
      INSTALL_RPATH "${CMAKE_INSTALL_PREFIX}/lib:/usr/lib/aarch64-linux-gnu:/usr/lib/aarch64-linux-gnu/nvidia:/usr/local/cuda-12.6/targets/aarch64-linux/lib"
      BUILD_WITH_INSTALL_RPATH TRUE
    )
else()
    target_link_libraries(test_yoloe_standalone ${CUDA_LIBRARIES})
endif()
# Don't install test executable by default
endif()  # BUILD_YOLOE_NODE AND BUILD_YOLOE_TEST

if(BUILD_TESTING)
  find_package(ament_lint_auto REQUIRED)
  ament_lint_auto_find_test_dependencies()
endif()

ament_package()
