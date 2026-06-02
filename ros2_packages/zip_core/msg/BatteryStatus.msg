# ZIP Robot Battery Status Message
# Battery voltage and health monitoring

std_msgs/Header header

# Battery voltage in millivolts (raw reading from A3 via voltage divider)
uint32 voltage_mv

# Calculated voltage (accounting for divider ratio)
float32 voltage_v

# Battery health status
uint8 BATTERY_UNKNOWN = 0
uint8 BATTERY_NORMAL = 1
uint8 BATTERY_LOW = 2
uint8 BATTERY_CRITICAL = 3
uint8 BATTERY_CHARGING = 4

uint8 status

# Estimated percentage (if calibration available)
float32 percentage  # 0.0-100.0, -1 if unknown

# Timestamp of last reading
builtin_interfaces/Time last_reading_time
