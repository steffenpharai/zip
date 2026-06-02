# ZIP Robot Diagnostics Message
# Comprehensive robot state and diagnostic information

std_msgs/Header header

# Motion state
bool motion_active
float32 linear_velocity
float32 angular_velocity
float32 left_motor_pwm
float32 right_motor_pwm

# Sensor readings
float32 ultrasonic_distance_cm
bool line_sensor_left
bool line_sensor_middle
bool line_sensor_right

# IMU data (if available)
bool imu_available
float32 imu_accel_x
float32 imu_accel_y
float32 imu_accel_z
float32 imu_gyro_x
float32 imu_gyro_y
float32 imu_gyro_z

# System health
bool serial_connected
uint32 command_count
uint32 error_count
string last_error

# Timestamps
builtin_interfaces/Time last_command_time
builtin_interfaces/Time last_response_time
