# ZIP Robot Sensors Message
# Aggregated sensor readings from Arduino

std_msgs/Header header

# Ultrasonic sensor (HC-SR04)
float32 ultrasonic_distance_cm  # Distance in centimeters, -1 if invalid

# Line tracking sensors (3 sensors: left, middle, right)
bool line_left
bool line_middle
bool line_right

# IMU (MPU6050) - optional, may not be available
bool imu_available
sensor_msgs/Imu imu_data

# Servo position (if applicable)
float32 servo_angle  # 0-180 degrees, -1 if not set
