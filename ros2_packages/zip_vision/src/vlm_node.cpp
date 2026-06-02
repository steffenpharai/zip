#include <rclcpp/rclcpp.hpp>
#include <sensor_msgs/msg/image.hpp>
#include <std_msgs/msg/string.hpp>
#include <vision_msgs/msg/detection2_d_array.hpp>
#include <cv_bridge/cv_bridge.h>
#include <opencv2/opencv.hpp>
#include <memory>
#include <string>
#include <chrono>
#include "zip_vision/srv/vlm_inference.hpp"

#include "zip_vision/vlm_engine.hpp"

using std::placeholders::_1;

class VLMNode : public rclcpp::Node
{
public:
    VLMNode()
        : Node("vlm_node")
    {
        // Declare parameters
        this->declare_parameter<std::string>("model_path", "");
        this->declare_parameter<std::string>("quantization", "int4");
        this->declare_parameter<int>("max_tokens", 512);
        this->declare_parameter<double>("temperature", 0.7);
        this->declare_parameter<std::string>("system_prompt", 
            "Describe this scene in detail, including all visible objects and their relationships. Be concise but informative.");
        this->declare_parameter<bool>("use_detections_context", true);
        this->declare_parameter<int>("inference_frequency", 5);
        this->declare_parameter<std::string>("device", "GPU");
        
        // Get parameters
        std::string model_path = this->get_parameter("model_path").as_string();
        std::string quantization = this->get_parameter("quantization").as_string();
        max_tokens_ = this->get_parameter("max_tokens").as_int();
        temperature_ = this->get_parameter("temperature").as_double();
        system_prompt_ = this->get_parameter("system_prompt").as_string();
        use_detections_context_ = this->get_parameter("use_detections_context").as_bool();
        inference_frequency_ = this->get_parameter("inference_frequency").as_int();
        
        // Validate model path
        if (model_path.empty()) {
            RCLCPP_ERROR(this->get_logger(), "model_path parameter is required");
            throw std::runtime_error("model_path parameter is required");
        }
        
        // Initialize VLM engine
        engine_ = std::make_unique<zip_vision::VLMEngine>();
        
        RCLCPP_INFO(this->get_logger(), "Loading VLM model from: %s", model_path.c_str());
        RCLCPP_INFO(this->get_logger(), "Quantization: %s", quantization.c_str());
        
        if (!engine_->initialize(model_path, quantization)) {
            RCLCPP_ERROR(this->get_logger(), "Failed to initialize VLM engine");
            throw std::runtime_error("Failed to initialize VLM engine");
        }
        
        RCLCPP_INFO(this->get_logger(), "VLM engine initialized successfully");
        RCLCPP_INFO(this->get_logger(), "Inference frequency: every %d frames", inference_frequency_);
        
        // Create subscribers
        image_sub_ = this->create_subscription<sensor_msgs::msg::Image>(
            "/camera/image_raw",
            10,
            std::bind(&VLMNode::imageCallback, this, _1)
        );
        
        if (use_detections_context_) {
            detections_sub_ = this->create_subscription<vision_msgs::msg::Detection2DArray>(
                "/detections",
                10,
                std::bind(&VLMNode::detectionsCallback, this, _1)
            );
        }
        
        // Create publisher
        scene_description_pub_ = this->create_publisher<std_msgs::msg::String>(
            "/scene_description",
            10
        );
        
        // Create VLM service client (calls Python service node)
        vlm_client_ = this->create_client<zip_vision::srv::VLMInference>("vlm/inference");
        
        // Wait for service to be available
        while (!vlm_client_->wait_for_service(std::chrono::seconds(1))) {
            if (!rclcpp::ok()) {
                RCLCPP_ERROR(this->get_logger(), "Interrupted while waiting for VLM service");
                return;
            }
            RCLCPP_INFO(this->get_logger(), "Waiting for VLM service...");
        }
        
        // Frame counter for inference frequency
        frame_counter_ = 0;
        
        RCLCPP_INFO(this->get_logger(), "VLM node started");
    }

private:
    void imageCallback(const sensor_msgs::msg::Image::SharedPtr msg)
    {
        // Update latest image
        latest_image_ = msg;
        
        // Process based on inference frequency
        frame_counter_++;
        if (frame_counter_ % inference_frequency_ != 0) {
            return;
        }
        
        // Process image
        processImage();
    }
    
    void detectionsCallback(const vision_msgs::msg::Detection2DArray::SharedPtr msg)
    {
        // Update latest detections
        latest_detections_ = msg;
    }
    
    void processImage()
    {
        if (!latest_image_) {
            return;
        }
        
        try {
            // Convert ROS image to OpenCV Mat
            cv_bridge::CvImagePtr cv_ptr = cv_bridge::toCvCopy(
                latest_image_, 
                sensor_msgs::image_encodings::BGR8
            );
            cv::Mat image = cv_ptr->image;
            
            // Prepare detections context if enabled
            std::vector<std::string> detections_context;
            if (use_detections_context_ && latest_detections_) {
                for (const auto& det : latest_detections_->detections) {
                    if (!det.results.empty()) {
                        std::string class_id = det.results[0].hypothesis.class_id;
                        float score = det.results[0].hypothesis.score;
                        detections_context.push_back(
                            "Object " + class_id + " (confidence: " + 
                            std::to_string(score).substr(0, 4) + ")"
                        );
                    }
                }
            }
            
            // Call VLM service (Python TensorRT-LLM service)
            auto request = std::make_shared<zip_vision::srv::VLMInference::Request>();
            if (latest_image_) {
                request->image_msg = *latest_image_;  // Dereference SharedPtr
            }
            request->prompt = system_prompt_;
            
            // Convert detections context to string array
            for (const auto& det_str : detections_context) {
                request->detections_context.push_back(det_str);
            }
            
            request->max_tokens = max_tokens_;
            request->temperature = temperature_;
            
            auto start_time = std::chrono::steady_clock::now();
            
            // Call service asynchronously
            auto future = vlm_client_->async_send_request(request);
            
            // Wait for response (with timeout)
            if (rclcpp::spin_until_future_complete(
                    this->shared_from_this(), future, std::chrono::seconds(10)) ==
                rclcpp::FutureReturnCode::SUCCESS) {
                
                auto response = future.get();
                
                auto end_time = std::chrono::steady_clock::now();
                auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(
                    end_time - start_time
                ).count();
                
                if (response->success) {
                    RCLCPP_DEBUG(this->get_logger(), "VLM inference took %ld ms", duration);
                    
                    // Publish scene description
                    std_msgs::msg::String msg;
                    msg.data = response->description;
                    scene_description_pub_->publish(msg);
                } else {
                    RCLCPP_ERROR(this->get_logger(), "VLM inference failed: %s", 
                                response->description.c_str());
                }
            } else {
                RCLCPP_ERROR(this->get_logger(), "VLM service call timed out");
            }
            
        } catch (const cv_bridge::Exception& e) {
            RCLCPP_ERROR(this->get_logger(), "cv_bridge exception: %s", e.what());
        } catch (const std::exception& e) {
            RCLCPP_ERROR(this->get_logger(), "Exception in processImage: %s", e.what());
        }
    }
    
    // Members
    std::unique_ptr<zip_vision::VLMEngine> engine_;
    rclcpp::Subscription<sensor_msgs::msg::Image>::SharedPtr image_sub_;
    rclcpp::Subscription<vision_msgs::msg::Detection2DArray>::SharedPtr detections_sub_;
    rclcpp::Publisher<std_msgs::msg::String>::SharedPtr scene_description_pub_;
    rclcpp::Client<zip_vision::srv::VLMInference>::SharedPtr vlm_client_;
    
    sensor_msgs::msg::Image::SharedPtr latest_image_;
    vision_msgs::msg::Detection2DArray::SharedPtr latest_detections_;
    
    int max_tokens_;
    double temperature_;
    std::string system_prompt_;
    bool use_detections_context_;
    int inference_frequency_;
    int frame_counter_;
};

int main(int argc, char** argv)
{
    rclcpp::init(argc, argv);
    auto node = std::make_shared<VLMNode>();
    rclcpp::spin(node);
    rclcpp::shutdown();
    return 0;
}
