#include <rclcpp/rclcpp.hpp>
#include <sensor_msgs/msg/image.hpp>
#include <vision_msgs/msg/detection2_d_array.hpp>
#include <std_msgs/msg/string.hpp>
#include <cv_bridge/cv_bridge.h>
#include <opencv2/opencv.hpp>
#include <memory>
#include <string>
#include <vector>
#include <chrono>

using std::placeholders::_1;

/**
 * @brief Diagnostics Bridge Node
 * 
 * Bridges ROS 2 vision topics to HTTP API for diagnostics frontend.
 * Subscribes to camera, detections, and scene description.
 * Provides HTTP endpoints for frontend to query current state.
 */
class DiagnosticsBridgeNode : public rclcpp::Node
{
public:
    DiagnosticsBridgeNode()
        : Node("diagnostics_bridge_node")
    {
        // Declare parameters
        this->declare_parameter<int>("http_port", 8767);
        this->declare_parameter<std::string>("camera_topic", "/camera/image_raw");
        this->declare_parameter<std::string>("detections_topic", "/detections");
        this->declare_parameter<std::string>("visualization_topic", "/detections/visualization");
        this->declare_parameter<std::string>("scene_description_topic", "/scene_description");
        
        // Get parameters
        http_port_ = this->get_parameter("http_port").as_int();
        std::string camera_topic = this->get_parameter("camera_topic").as_string();
        std::string detections_topic = this->get_parameter("detections_topic").as_string();
        std::string visualization_topic = this->get_parameter("visualization_topic").as_string();
        std::string scene_description_topic = this->get_parameter("scene_description_topic").as_string();
        
        // CRITICAL FIX: Use RELIABLE QoS to match publishers
        // v4l2_camera and YOLOE node publish with RELIABLE QoS
        // ROS 2 requires matching reliability policies (RELIABLE <-> RELIABLE)
        rclcpp::QoS image_qos(10);
        image_qos.reliability(rclcpp::ReliabilityPolicy::Reliable);
        
        rclcpp::QoS detections_qos(10);
        detections_qos.reliability(rclcpp::ReliabilityPolicy::Reliable);
        
        // Create subscribers with RELIABLE QoS
        camera_sub_ = this->create_subscription<sensor_msgs::msg::Image>(
            camera_topic,
            image_qos,
            std::bind(&DiagnosticsBridgeNode::cameraCallback, this, _1)
        );
        
        detections_sub_ = this->create_subscription<vision_msgs::msg::Detection2DArray>(
            detections_topic,
            detections_qos,
            std::bind(&DiagnosticsBridgeNode::detectionsCallback, this, _1)
        );
        
        visualization_sub_ = this->create_subscription<sensor_msgs::msg::Image>(
            visualization_topic,
            image_qos,
            std::bind(&DiagnosticsBridgeNode::visualizationCallback, this, _1)
        );
        
        scene_description_sub_ = this->create_subscription<std_msgs::msg::String>(
            scene_description_topic,
            detections_qos,
            std::bind(&DiagnosticsBridgeNode::sceneDescriptionCallback, this, _1)
        );
        
        RCLCPP_INFO(this->get_logger(), "QoS: RELIABLE, depth=10 (matching publishers)");
        
        // Initialize state
        last_camera_update_ = std::chrono::steady_clock::now();
        last_detections_update_ = std::chrono::steady_clock::now();
        last_visualization_update_ = std::chrono::steady_clock::now();
        last_scene_description_update_ = std::chrono::steady_clock::now();
        
        RCLCPP_INFO(this->get_logger(), "Diagnostics bridge node started");
        RCLCPP_INFO(this->get_logger(), "Subscribing to:");
        RCLCPP_INFO(this->get_logger(), "  - Camera: %s", camera_topic.c_str());
        RCLCPP_INFO(this->get_logger(), "  - Detections: %s", detections_topic.c_str());
        RCLCPP_INFO(this->get_logger(), "  - Visualization: %s", visualization_topic.c_str());
        RCLCPP_INFO(this->get_logger(), "  - Scene Description: %s", scene_description_topic.c_str());
        RCLCPP_INFO(this->get_logger(), "Note: HTTP server not implemented in C++ node.");
        RCLCPP_INFO(this->get_logger(), "Use rosbridge_suite or separate HTTP bridge for frontend access.");
    }

private:
    void cameraCallback(const sensor_msgs::msg::Image::SharedPtr msg)
    {
        latest_camera_msg_ = msg;
        last_camera_update_ = std::chrono::steady_clock::now();
    }
    
    void detectionsCallback(const vision_msgs::msg::Detection2DArray::SharedPtr msg)
    {
        latest_detections_msg_ = msg;
        last_detections_update_ = std::chrono::steady_clock::now();
        
        // Log detection count
        RCLCPP_DEBUG(this->get_logger(), "Received %zu detections", msg->detections.size());
    }
    
    void visualizationCallback(const sensor_msgs::msg::Image::SharedPtr msg)
    {
        latest_visualization_msg_ = msg;
        last_visualization_update_ = std::chrono::steady_clock::now();
    }
    
    void sceneDescriptionCallback(const std_msgs::msg::String::SharedPtr msg)
    {
        latest_scene_description_msg_ = msg;
        last_scene_description_update_ = std::chrono::steady_clock::now();
        
        RCLCPP_DEBUG(this->get_logger(), "Scene description: %s", msg->data.c_str());
    }
    
    // Members
    rclcpp::Subscription<sensor_msgs::msg::Image>::SharedPtr camera_sub_;
    rclcpp::Subscription<vision_msgs::msg::Detection2DArray>::SharedPtr detections_sub_;
    rclcpp::Subscription<sensor_msgs::msg::Image>::SharedPtr visualization_sub_;
    rclcpp::Subscription<std_msgs::msg::String>::SharedPtr scene_description_sub_;
    
    sensor_msgs::msg::Image::SharedPtr latest_camera_msg_;
    vision_msgs::msg::Detection2DArray::SharedPtr latest_detections_msg_;
    sensor_msgs::msg::Image::SharedPtr latest_visualization_msg_;
    std_msgs::msg::String::SharedPtr latest_scene_description_msg_;
    
    std::chrono::steady_clock::time_point last_camera_update_;
    std::chrono::steady_clock::time_point last_detections_update_;
    std::chrono::steady_clock::time_point last_visualization_update_;
    std::chrono::steady_clock::time_point last_scene_description_update_;
    
    int http_port_;
};

int main(int argc, char** argv)
{
    rclcpp::init(argc, argv);
    auto node = std::make_shared<DiagnosticsBridgeNode>();
    rclcpp::spin(node);
    rclcpp::shutdown();
    return 0;
}
