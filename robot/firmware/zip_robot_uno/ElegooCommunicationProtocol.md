R
Motor
Command { "H": ID , "N" :1 , "D1": parameter 1 , "D2": parameter 2 , "D3": parameter 3 }
Function Select the motor to set the rotation direction and speed.
Return { ID_ ok}
Parameter
Description
Parameter 1 ( select the corresponding motor )
0 : All motors
1 : Left motor
2 : Right motor
Parameter 2 ( the rotation speed value of the selected motor )
The range of speed value: 0~ 255
Parameter 3 ( select the rotation direction of the selected motor)
1 : Clockwise
2 : Counterclockwise
Command { "H": ID , "N": 3 , "D1": parameter 1 , "D2" : parameter 2 }
Function Set the direction and speed of the car.
Return { ID_ ok}
Parameter
Description
Parameter 1 ( the rotation direction of the selected motor )
1 : Turn left
2 : Turn right
3 : Go forward
4 : Back
Parameter 2 ( the rotation speed value of the selected motor )
The range of speed value: 0~ 255
Command { "H": ID , "N": 4 , "D1": parameter 1 , "D2" : parameter 2 }
Function Set the speed of the left and right motors separately.
Return { ID_ ok}
Parameter
Description
Parameter 1 ( the speed of left wheel )
The range of speed value: 0~ 255
Parameter 2 ( the speed of right wheel )
The range of speed value: 0~ 255
Servo motor
Command { "H": ID , "N": 5 , "D1": parameter 1 , "D2" : parameter 2 }
Function Select the rotation angle of the servo motor.
Return { ID_ ok}
Parameter
Description
Parameter 1 ( select the servo motor )
1 Servo motor that can turn left and right
2 Servo motor that can turn up and down
Parameter 2 ( the rotation angle of the servo motor: 0-180 )
Command for remotely switching the car mode
Command { "N" : 101 , "D1" : Parameter 1 }
Function Switch the car mode.
Return No return
Parameter
Description
Parameter 1
1 : Tracking mode
2 ：Obstacle-avoidance mode
3 : Follow mode
Joystick clear mode
Command { "N":100 }
Function Clear all functions being executed.
Return No return
Joystick movement command
Command { "N": 102 , "D1": parameter 1 , "D2": parameter 2 }
Function Make the car move in a certain direction at the default maximum speed.
Return No return
Parameter
Description
Parameter 1
1 : Go forward
2 : Back
3 : Turn left
4 : Turn right
5 : Left front
6 : Rear left
7 : Right front
8 : Rear Right
Parameter 2 : Speed value
Remote control - Threshold adjustment
Command { "N": 104 , "D1": Parameter 1 }
Function Adjust the tracking sensitivity of the car.
Return No return
Parameter
Description
Parameter 1 : 50-1000
Camera rotation
Command { "N": 106 , "D1": Parameter 1 }
Function Set the rotation direction of the camera.
Return No return
Parameter
Description
Parameter 1
1 : Turn up
2 : Turn down
3 : Turn left
4 : Turn right
Ultrasonic module
Command { "H": ID , "N": 21, "D1": parameter 1 }
Function Check whether an obstacle is detected.
Return { ID_ false } : No obstacles detected
{ ID_ true } : Obstacles detected
{ Ultrasonic value }
Parameter
Description
1 : Check whether an obstacle is detected.
2 : Check the value of the ultrasonic sensor.
Infrared module
Command { "H":ID , "N" : 22,"D1":0 }
Function Check the value of the infrared sensor.
Return { ID_Infrared sensor value }
Parameter
Description
Parameter D 1
0 : The value of the L infrared sensor
1 : The value of the M infrared sensor
2 : The value of the R infrared sensor
Command { "H":ID , "N" : 23 }
Function Check if the car leaves the ground
Return { ID_ false} : the car does not leave the ground
{ ID _ true } : the car leaves the ground
Programming mode clears all states
Command { "H":ID , "N":110 }
Function Clear all the functions being executed, and do not enter the standby mode.
Return {ID_ok}
http://www.elegoo.com