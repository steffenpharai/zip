cmake_minimum_required(VERSION 3.8)
project(zip_core)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# Find dependencies
find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(std_msgs REQUIRED)
find_package(sensor_msgs REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(rosidl_default_generators REQUIRED)

# Custom messages and services
rosidl_generate_interfaces(${PROJECT_NAME}
  "msg/RobotDiagnostics.msg"
  "msg/RobotSensors.msg"
  "msg/BatteryStatus.msg"
  "msg/VoiceState.msg"
  "srv/EmergencyStop.srv"
  "srv/ServoControl.srv"
  "srv/MacroExecute.srv"
  "srv/MacroCancel.srv"
  "srv/GetDiagnostics.srv"
  "srv/DirectMotorControl.srv"
  "srv/ReRunInit.srv"
  "srv/SetDriveConfig.srv"
  DEPENDENCIES std_msgs sensor_msgs builtin_interfaces
)

# Include directories (only if include directory exists)
if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/include")
  include_directories(include)
  install(DIRECTORY include/
    DESTINATION include
  )
endif()

# Install directories (only if they exist)
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

if(BUILD_TESTING)
  find_package(ament_lint_auto REQUIRED)
  ament_lint_auto_find_test_dependencies()
endif()

ament_package()
