#include <rclcpp/rclcpp.hpp>
#include <sensor_msgs/msg/image.hpp>
#include <vision_msgs/msg/detection2_d_array.hpp>
#include <vision_msgs/msg/detection2_d.hpp>
#include <vision_msgs/msg/bounding_box2_d.hpp>
#include <cv_bridge/cv_bridge.h>
#include <opencv2/opencv.hpp>
#include <memory>
#include <string>
#include <sstream>
#include <algorithm>
#include <set>
#include <csignal>
#include <execinfo.h>
#include <cxxabi.h>
#include <fstream>
#include <chrono>
#include <iomanip>

#include "zip_vision/yoloe_engine.hpp"

using std::placeholders::_1;

// Signal handler for debugging segfaults
void signalHandler(int sig)
{
    const char* sig_name = (sig == SIGSEGV) ? "SIGSEGV" : (sig == SIGABRT) ? "SIGABRT" : "UNKNOWN";
    
    // Print signal info
    fprintf(stderr, "\n=== Signal Caught: %s (%d) ===\n", sig_name, sig);
    
    // Print backtrace
    void* array[20];
    size_t size = backtrace(array, 20);
    char** messages = backtrace_symbols(array, size);
    
    fprintf(stderr, "Backtrace:\n");
    for (size_t i = 0; i < size; ++i) {
        fprintf(stderr, "  [%zu] %s\n", i, messages[i]);
    }
    free(messages);
    
    // Restore default handler and re-raise
    signal(sig, SIG_DFL);
    raise(sig);
}

class YOLOENode : public rclcpp::Node
{
public:
    YOLOENode()
        : Node("yoloe_node")
    {
        // Declare parameters
        this->declare_parameter<std::string>("model_path", "");
        this->declare_parameter<int>("input_width", 640);
        this->declare_parameter<int>("input_height", 640);
        this->declare_parameter<float>("confidence_threshold", 0.15);
        this->declare_parameter<float>("nms_threshold", 0.4);
        this->declare_parameter<int>("max_detections", 100);
        this->declare_parameter<bool>("enable_visualization", true);
        this->declare_parameter<std::string>("device", "GPU");
        
        // Get parameters
        std::string model_path = this->get_parameter("model_path").as_string();
        int input_width = this->get_parameter("input_width").as_int();
        int input_height = this->get_parameter("input_height").as_int();
        confidence_threshold_ = this->get_parameter("confidence_threshold").as_double();
        nms_threshold_ = this->get_parameter("nms_threshold").as_double();
        max_detections_ = this->get_parameter("max_detections").as_int();
        enable_visualization_ = this->get_parameter("enable_visualization").as_bool();
        
        // Validate model path
        if (model_path.empty()) {
            RCLCPP_ERROR(this->get_logger(), "model_path parameter is required");
            throw std::runtime_error("model_path parameter is required");
        }
        
        // Initialize YOLOE engine
        // YOLOE supports open-vocabulary detection with zero overhead in closed mode
        engine_ = std::make_unique<zip_vision::YOLOEEngine>();
        // CRITICAL: INT8 can cause bbox regression collapse if calibration is poor
        // Per NVIDIA best practices: Use FP16 if INT8 calibration is not properly done
        // INT8 requires representative calibration dataset to avoid identical bbox outputs
        bool use_int8 = false;  // Default to FP16 for reliability (can be overridden via parameter)
        
        // Check for INT8 preference (can be set via environment or parameter)
        const char* precision_env = std::getenv("YOLOE_PRECISION");
        if (!precision_env) {
            precision_env = std::getenv("YOLOE_PRECISION");  // YOLOE precision setting
        }
        if (precision_env && std::string(precision_env) == "int8") {
            use_int8 = true;
            RCLCPP_WARN(this->get_logger(), "Using INT8 precision - ensure proper calibration dataset was used during export");
        }
        
        RCLCPP_INFO(this->get_logger(), "Loading YOLOE model from: %s", model_path.c_str());
        if (!engine_->initialize(model_path, input_width, input_height, use_int8)) {
            RCLCPP_ERROR(this->get_logger(), "Failed to initialize YOLOE engine");
            throw std::runtime_error("Failed to initialize YOLOE engine");
        }
        
        RCLCPP_INFO(this->get_logger(), "YOLOE engine initialized successfully");
        RCLCPP_INFO(this->get_logger(), "Input size: %dx%d", input_width, input_height);
        RCLCPP_INFO(this->get_logger(), "Confidence threshold: %.2f", confidence_threshold_);
        
        // Create subscribers
        // CRITICAL FIX: v4l2_camera publishes with RELIABLE QoS, so we must use RELIABLE too
        // ROS 2 requires matching reliability policies (RELIABLE <-> RELIABLE, BEST_EFFORT <-> BEST_EFFORT)
        rclcpp::QoS image_qos(10);
        image_qos.reliability(rclcpp::ReliabilityPolicy::Reliable);
        image_sub_ = this->create_subscription<sensor_msgs::msg::Image>(
            "/camera/image_raw",
            image_qos,
            std::bind(&YOLOENode::imageCallback, this, _1)
        );
        
        RCLCPP_INFO(this->get_logger(), "✓ Subscribed to /camera/image_raw");
        RCLCPP_INFO(this->get_logger(), "  QoS: reliability=%s, depth=%zu", 
                   image_qos.reliability() == rclcpp::ReliabilityPolicy::Reliable ? "RELIABLE" : "BEST_EFFORT",
                   image_qos.depth());
        
        // Create publishers with RELIABLE QoS (explicit to match subscribers)
        rclcpp::QoS pub_qos(10);
        pub_qos.reliability(rclcpp::ReliabilityPolicy::Reliable);
        
        detections_pub_ = this->create_publisher<vision_msgs::msg::Detection2DArray>(
            "/detections",
            pub_qos
        );
        
        if (enable_visualization_) {
            visualization_pub_ = this->create_publisher<sensor_msgs::msg::Image>(
                "/detections/visualization",
                pub_qos
            );
        }
        
        RCLCPP_INFO(this->get_logger(), "Publishers QoS: RELIABLE, depth=10");
        
        RCLCPP_INFO(this->get_logger(), "YOLOE node started");
        
        // Install signal handler for debugging
        signal(SIGSEGV, signalHandler);
        signal(SIGABRT, signalHandler);
    }

private:
    void imageCallback(const sensor_msgs::msg::Image::SharedPtr msg)
    {
        // Log callback count for debugging (DEBUG level to reduce overhead)
        static int callback_count = 0;
        callback_count++;
        RCLCPP_DEBUG(this->get_logger(), "[CALLBACK #%d] Image received: %dx%d, encoding=%s", 
                   callback_count, msg ? msg->width : 0, msg ? msg->height : 0,
                   msg ? msg->encoding.c_str() : "null");
        
        // Early validation
        if (!msg || !engine_ || !engine_->isInitialized()) {
            RCLCPP_WARN(this->get_logger(), "[CALLBACK #%d] Early return: msg=%p, engine=%p, initialized=%d",
                       callback_count, static_cast<void*>(msg.get()), static_cast<void*>(engine_.get()), engine_ ? engine_->isInitialized() : false);
            return;
        }
        
        try {
            RCLCPP_DEBUG(this->get_logger(), "[CALLBACK #%d] Processing image: %dx%d", callback_count, msg->width, msg->height);
            
            // Convert ROS image to OpenCV Mat
            cv_bridge::CvImagePtr cv_ptr;
            try {
                cv_ptr = cv_bridge::toCvCopy(msg, sensor_msgs::image_encodings::BGR8);
            } catch (const cv_bridge::Exception& e) {
                RCLCPP_ERROR(this->get_logger(), "cv_bridge exception: %s", e.what());
                return;
            }
            
            if (cv_ptr == nullptr || cv_ptr->image.empty()) {
                RCLCPP_WARN(this->get_logger(), "Empty image received");
                return;
            }
            
            cv::Mat image = cv_ptr->image;
            
            // Validate image
            if (image.cols <= 0 || image.rows <= 0 || image.data == nullptr) {
                RCLCPP_WARN(this->get_logger(), "Invalid image dimensions");
                return;
            }
            
            RCLCPP_DEBUG(this->get_logger(), "Image validated: %dx%d", image.cols, image.rows);
            
            // Run inference with exception handling
            // CRITICAL: Use pipelined inference for multi-stream performance
            // Use configured confidence threshold consistently (no adaptive thresholding to prevent flickering)
            std::vector<zip_vision::Detection> detections;
            
            try {
                RCLCPP_DEBUG(this->get_logger(), "Calling engine_->infer_pipelined() on %dx%d image", image.cols, image.rows);
                bool infer_result = engine_->infer_pipelined(image, detections, confidence_threshold_, nms_threshold_);
                RCLCPP_DEBUG(this->get_logger(), "Inference returned: %s, detections: %zu", infer_result ? "SUCCESS" : "FAILED", detections.size());
                if (!infer_result) {
                    RCLCPP_ERROR(this->get_logger(), "Inference failed - engine returned false");
                    return;
                }
            } catch (const std::exception& e) {
                RCLCPP_ERROR(this->get_logger(), "Exception during inference: %s", e.what());
                return;
            } catch (...) {
                RCLCPP_ERROR(this->get_logger(), "Unknown exception during inference");
                return;
            }
            
            RCLCPP_DEBUG(this->get_logger(), "Inference completed, processing %zu detections", detections.size());
            
            // Debug logging (first 10 frames, then every 100 frames)
            static int frame_count = 0;
            static int last_log_frame = -1;
            bool should_log = (frame_count < 10) || (frame_count % 100 == 0);
            
            if (should_log && frame_count != last_log_frame) {
                RCLCPP_INFO(this->get_logger(), "[Frame %d] Image: %dx%d, Detections: %zu (conf_thresh=%.3f)", 
                           frame_count, image.cols, image.rows, detections.size(), confidence_threshold_);
                if (detections.size() > 0) {
                    // Count unique classes
                    std::set<int> unique_classes;
                    for (const auto& det : detections) {
                        unique_classes.insert(det.class_id);
                    }
                    RCLCPP_INFO(this->get_logger(), "  ✅ %zu unique object classes detected", unique_classes.size());
                    
                    // Log all detections (up to 10)
                    for (size_t i = 0; i < std::min(detections.size(), size_t(10)); ++i) {
                        RCLCPP_INFO(this->get_logger(), "  Det[%zu]: class=%d (%s), conf=%.3f, bbox=(%d,%d,%d,%d)", 
                                   i, detections[i].class_id, detections[i].class_name.c_str(), detections[i].confidence,
                                   detections[i].bbox.x, detections[i].bbox.y,
                                   detections[i].bbox.width, detections[i].bbox.height);
                    }
                    if (detections.size() > 10) {
                        RCLCPP_INFO(this->get_logger(), "  ... and %zu more detections", detections.size() - 10);
                    }
                } else {
                    // CRITICAL: Log detailed diagnostics when no detections
                    RCLCPP_WARN(this->get_logger(), "  ❌ NO DETECTIONS - conf_thresh=%.3f, img=%dx%d", 
                               confidence_threshold_, image.cols, image.rows);
                    RCLCPP_WARN(this->get_logger(), "     This suggests postprocessing is filtering all detections");
                    RCLCPP_WARN(this->get_logger(), "     Check: 1) Model output values 2) Confidence calculation 3) Bbox validation");
                }
                last_log_frame = frame_count;
            }
            frame_count++;
            
            // Convert to ROS message (publish and draw all NMS detections; no cap)
            vision_msgs::msg::Detection2DArray detections_msg;
            detections_msg.header = msg->header;
            // Add image dimensions to frame_id for metadata (format: "frame_id:width:height")
            std::ostringstream frame_id_with_dims;
            frame_id_with_dims << msg->header.frame_id << ":" << image.cols << ":" << image.rows;
            detections_msg.header.frame_id = frame_id_with_dims.str();
            
            for (const auto& det : detections) {
                vision_msgs::msg::Detection2D detection;
                detection.header = msg->header;
                detection.id = std::to_string(det.class_id);
                
                // Bounding box
                detection.bbox.center.position.x = det.bbox.x + det.bbox.width / 2.0;
                detection.bbox.center.position.y = det.bbox.y + det.bbox.height / 2.0;
                detection.bbox.size_x = det.bbox.width;
                detection.bbox.size_y = det.bbox.height;
                
                // Results (class and confidence)
                vision_msgs::msg::ObjectHypothesisWithPose result;
                result.hypothesis.class_id = std::to_string(det.class_id);
                result.hypothesis.score = det.confidence;
                detection.results.push_back(result);
                
                detections_msg.detections.push_back(detection);
            }
            
            // Publish detections
            detections_pub_->publish(detections_msg);
            
            // Publish visualization if enabled
            if (enable_visualization_ && visualization_pub_) {
                cv::Mat vis_image = image.clone();
                drawDetections(vis_image, detections);
                
                cv_bridge::CvImage vis_cv_image;
                vis_cv_image.header = msg->header;
                vis_cv_image.encoding = sensor_msgs::image_encodings::BGR8;
                vis_cv_image.image = vis_image;
                
                sensor_msgs::msg::Image::SharedPtr vis_msg = vis_cv_image.toImageMsg();
                visualization_pub_->publish(*vis_msg);  // Dereference SharedPtr
            }
            
        } catch (const cv_bridge::Exception& e) {
            RCLCPP_ERROR(this->get_logger(), "cv_bridge exception: %s", e.what());
        } catch (const std::exception& e) {
            RCLCPP_ERROR(this->get_logger(), "Exception in imageCallback: %s", e.what());
        }
    }
    
    // Generate color for class ID (80 distinct colors) with caching
    cv::Scalar getClassColor(int class_id) const {
        // Check cache first
        auto it = color_cache_.find(class_id);
        if (it != color_cache_.end()) {
            return it->second;
        }
        
        // Generate distinct colors using HSV color space
        int hue = (class_id * 137) % 180;  // Golden angle approximation for distribution
        cv::Mat hsv(1, 1, CV_8UC3, cv::Scalar(hue, 200, 255));
        cv::Mat bgr;
        cv::cvtColor(hsv, bgr, cv::COLOR_HSV2BGR);
        cv::Vec3b color = bgr.at<cv::Vec3b>(0, 0);
        cv::Scalar result(color[0], color[1], color[2]);
        
        // Cache result (limit cache size)
        if (color_cache_.size() < 100) {
            color_cache_[class_id] = result;
        }
        
        return result;
    }
    
    // Draw rounded rectangle using polylines with anti-aliasing
    void drawRoundedRect(cv::Mat& image, const cv::Rect& rect, const cv::Scalar& color, int thickness, int radius) {
        int x = rect.x;
        int y = rect.y;
        int w = rect.width;
        int h = rect.height;
        
        // Clamp radius to half of smallest dimension
        radius = std::min(radius, std::min(w, h) / 2);
        
        // Draw rounded rectangle using 4 arcs and 4 lines with anti-aliasing
        // Top-left corner
        cv::ellipse(image, cv::Point(x + radius, y + radius), cv::Size(radius, radius), 180, 0, 90, color, thickness, cv::LINE_AA);
        // Top-right corner
        cv::ellipse(image, cv::Point(x + w - radius, y + radius), cv::Size(radius, radius), 270, 0, 90, color, thickness, cv::LINE_AA);
        // Bottom-right corner
        cv::ellipse(image, cv::Point(x + w - radius, y + h - radius), cv::Size(radius, radius), 0, 0, 90, color, thickness, cv::LINE_AA);
        // Bottom-left corner
        cv::ellipse(image, cv::Point(x + radius, y + h - radius), cv::Size(radius, radius), 90, 0, 90, color, thickness, cv::LINE_AA);
        
        // Draw straight lines with anti-aliasing
        cv::line(image, cv::Point(x + radius, y), cv::Point(x + w - radius, y), color, thickness, cv::LINE_AA);
        cv::line(image, cv::Point(x + w, y + radius), cv::Point(x + w, y + h - radius), color, thickness, cv::LINE_AA);
        cv::line(image, cv::Point(x + w - radius, y + h), cv::Point(x + radius, y + h), color, thickness, cv::LINE_AA);
        cv::line(image, cv::Point(x, y + h - radius), cv::Point(x, y + radius), color, thickness, cv::LINE_AA);
    }
    
    // Draw corner markers with anti-aliasing
    void drawCornerMarkers(cv::Mat& image, const cv::Rect& rect, const cv::Scalar& color, int marker_size) {
        int x = rect.x;
        int y = rect.y;
        int w = rect.width;
        int h = rect.height;
        
        // Top-left
        cv::line(image, cv::Point(x, y), cv::Point(x + marker_size, y), color, 2, cv::LINE_AA);
        cv::line(image, cv::Point(x, y), cv::Point(x, y + marker_size), color, 2, cv::LINE_AA);
        // Top-right
        cv::line(image, cv::Point(x + w, y), cv::Point(x + w - marker_size, y), color, 2, cv::LINE_AA);
        cv::line(image, cv::Point(x + w, y), cv::Point(x + w, y + marker_size), color, 2, cv::LINE_AA);
        // Bottom-right
        cv::line(image, cv::Point(x + w, y + h), cv::Point(x + w - marker_size, y + h), color, 2, cv::LINE_AA);
        cv::line(image, cv::Point(x + w, y + h), cv::Point(x + w, y + h - marker_size), color, 2, cv::LINE_AA);
        // Bottom-left
        cv::line(image, cv::Point(x, y + h), cv::Point(x + marker_size, y + h), color, 2, cv::LINE_AA);
        cv::line(image, cv::Point(x, y + h), cv::Point(x, y + h - marker_size), color, 2, cv::LINE_AA);
    }
    
    void drawDetections(cv::Mat& image, const std::vector<zip_vision::Detection>& detections)
    {
        // #region agent log
        static int draw_call_count = 0;
        draw_call_count++;
        {
            // Write to stderr (captured by Docker logs) and also try /tmp/debug.log
            auto now = std::chrono::system_clock::now();
            auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
            std::ostringstream log_json;
            log_json << "{\"id\":\"log_" << ms << "_draw\",\"timestamp\":" << ms 
                     << ",\"location\":\"yoloe_node.cpp:369\",\"message\":\"drawDetections entry\","
                     << "\"data\":{\"detectionCount\":" << detections.size() << ",\"imageSize\":{\"width\":" 
                     << image.cols << ",\"height\":" << image.rows << "},\"callCount\":" << draw_call_count 
                     << "},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\"}\n";
            fprintf(stderr, "%s", log_json.str().c_str());
            std::ofstream log_file("/tmp/debug.log", std::ios::app);
            if (log_file.is_open()) {
                log_file << log_json.str();
                log_file.close();
            }
        }
        // #endregion
        
        if (detections.empty()) {
            return;
        }
        
        // Sort by confidence (draw high-confidence on top)
        std::vector<zip_vision::Detection> sorted_detections = detections;
        std::sort(sorted_detections.begin(), sorted_detections.end(),
                  [](const zip_vision::Detection& a, const zip_vision::Detection& b) {
                      return a.confidence > b.confidence;
                  });
        
        // Limit visualization to top 5 detections by confidence to keep image readable
        // All detections are still published via ROS; only visualization is capped
        const size_t max_draw = 5;
        const size_t to_draw = std::min(sorted_detections.size(), max_draw);
        
        // #region agent log
        {
            auto now = std::chrono::system_clock::now();
            auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
            std::ostringstream log_json;
            log_json << "{\"id\":\"log_" << ms << "_sorted\",\"timestamp\":" << ms 
                     << ",\"location\":\"yoloe_node.cpp:385\",\"message\":\"sorted detections\","
                     << "\"data\":{\"totalDetections\":" << detections.size() << ",\"toDraw\":" << to_draw 
                     << "},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\"}\n";
            fprintf(stderr, "%s", log_json.str().c_str());
            std::ofstream log_file("/tmp/debug.log", std::ios::app);
            if (log_file.is_open()) {
                log_file << log_json.str();
                log_file.close();
            }
        }
        // #endregion
        
        // Track label positions to detect overlaps
        std::vector<cv::Rect> label_rects;
        
        for (size_t i = 0; i < to_draw; ++i) {
            const auto& det = sorted_detections[i];
            
            // #region agent log
            {
                auto now = std::chrono::system_clock::now();
                auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
                std::ostringstream log_json;
                log_json << "{\"id\":\"log_" << ms << "_det" << i << "\",\"timestamp\":" << ms 
                         << ",\"location\":\"yoloe_node.cpp:388\",\"message\":\"processing detection\","
                         << "\"data\":{\"index\":" << i << ",\"classId\":" << det.class_id 
                         << ",\"className\":\"" << det.class_name << "\",\"confidence\":" << det.confidence 
                         << ",\"bbox\":{\"x\":" << det.bbox.x << ",\"y\":" << det.bbox.y 
                         << ",\"width\":" << det.bbox.width << ",\"height\":" << det.bbox.height 
                         << "}},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"B\"}\n";
                fprintf(stderr, "%s", log_json.str().c_str());
                std::ofstream log_file("/tmp/debug.log", std::ios::app);
                if (log_file.is_open()) {
                    log_file << log_json.str();
                    log_file.close();
                }
            }
            // #endregion
            
            // Calculate dynamic line width based on bbox area
            int bbox_area = det.bbox.width * det.bbox.height;
            int line_width = std::max(2, std::min(static_cast<int>(bbox_area / 10000), 5));
            
            // Get class color
            cv::Scalar color = getClassColor(det.class_id);
            
            // Apply confidence-based opacity (blend with background)
            float opacity = det.confidence * 0.8f + 0.2f;
            cv::Scalar blended_color(
                static_cast<int>(color[0] * opacity),
                static_cast<int>(color[1] * opacity),
                static_cast<int>(color[2] * opacity)
            );
            
            // Draw rounded rectangle bounding box
            int corner_radius = std::min(8, std::min(det.bbox.width, det.bbox.height) / 4);
            drawRoundedRect(image, det.bbox, blended_color, line_width, corner_radius);
            
            // Draw corner markers
            int marker_size = std::max(8, std::min(det.bbox.width, det.bbox.height) / 8);
            drawCornerMarkers(image, det.bbox, blended_color, marker_size);
            
            // Prepare multi-line label
            std::ostringstream label_stream;
            label_stream << det.class_name;
            std::string confidence_str = std::to_string(det.confidence * 100.0f);
            confidence_str = confidence_str.substr(0, confidence_str.find('.') + 2) + "%";
            label_stream << "\n" << confidence_str;
            
            std::string label = label_stream.str();
            
            // Calculate text size
            // CRITICAL FIX: Dynamic font scaling based on image dimensions
            // Industry standard: font_scale ≈ 0.004 * image_height, clamped between 0.4 and 1.2
            double font_scale = std::max(0.4, std::min(1.2, image.rows * 0.004));
            int font_thickness = std::max(1, static_cast<int>(font_scale * 2));
            int baseline = 0;
            
            // Get size of single line to calculate proper line height
            int single_line_baseline = 0;
            cv::Size single_line_size = cv::getTextSize("Ag", cv::FONT_HERSHEY_SIMPLEX, font_scale, font_thickness, &single_line_baseline);
            int line_height_px = single_line_size.height + single_line_baseline + 2; // Add 2px spacing
            
            // Count lines in label
            int line_count = 1;
            for (char c : label) {
                if (c == '\n') line_count++;
            }
            
            // Calculate total text height (lines * line_height)
            int total_text_height = line_count * line_height_px;
            
            // Get maximum width of all lines
            std::istringstream label_istream(label);
            std::string line;
            int max_line_width = 0;
            while (std::getline(label_istream, line)) {
                cv::Size line_size = cv::getTextSize(line, cv::FONT_HERSHEY_SIMPLEX, font_scale, font_thickness, &baseline);
                max_line_width = std::max(max_line_width, line_size.width);
            }
            
            cv::Size text_size(max_line_width, total_text_height);
            
            // Position label above bbox (or below if too close to top)
            // CRITICAL FIX: Implement overlap avoidance to prevent labels stacking on top of each other
            int label_y = det.bbox.y - text_size.height - 5;
            int label_x = det.bbox.x;
            
            // Try multiple positions to avoid overlaps
            std::vector<std::pair<int, int>> position_candidates;
            
            // Candidate 1: Above bbox
            position_candidates.push_back({det.bbox.x, det.bbox.y - text_size.height - 5});
            // Candidate 2: Below bbox
            position_candidates.push_back({det.bbox.x, det.bbox.y + det.bbox.height + text_size.height + 5});
            // Candidate 3: Top-left of bbox
            position_candidates.push_back({det.bbox.x, det.bbox.y});
            // Candidate 4: Top-right of bbox
            position_candidates.push_back({det.bbox.x + det.bbox.width - text_size.width, det.bbox.y});
            // Candidate 5: Center above (if bbox is wide)
            if (det.bbox.width > text_size.width + 20) {
                position_candidates.push_back({det.bbox.x + (det.bbox.width - text_size.width) / 2, det.bbox.y - text_size.height - 5});
            }
            
            // Find first position that doesn't overlap with existing labels
            bool found_position = false;
            for (const auto& candidate : position_candidates) {
                int candidate_x = candidate.first;
                int candidate_y = candidate.second;
                
                // Clamp to image bounds
                if (candidate_x < 0) candidate_x = 5;
                if (candidate_x + text_size.width > image.cols) candidate_x = image.cols - text_size.width - 5;
                if (candidate_y < 0) candidate_y = 5;
                if (candidate_y + text_size.height > image.rows) candidate_y = image.rows - text_size.height - 5;
                
                // Get text size with baseline for this candidate position
                int candidate_baseline = 0;
                cv::Size candidate_text_size = cv::getTextSize(label.substr(0, label.find('\n')), 
                                                               cv::FONT_HERSHEY_SIMPLEX, font_scale, font_thickness, &candidate_baseline);
                // Label rectangle height MUST include baseline (OpenCV requirement)
                int label_rect_height = text_size.height + candidate_baseline + 8; // padding * 2
                cv::Rect candidate_rect(candidate_x - 4, candidate_y - 4, 
                                      text_size.width + 8, label_rect_height);
                
                // Check for overlaps with existing labels (with minimum spacing for readability)
                bool overlaps = false;
                const int min_spacing = 10; // Minimum spacing between labels in pixels
                for (const auto& existing_rect : label_rects) {
                    // Check if rectangles are too close (expanded by min_spacing)
                    cv::Rect expanded_candidate(candidate_rect.x - min_spacing, candidate_rect.y - min_spacing,
                                               candidate_rect.width + 2 * min_spacing, candidate_rect.height + 2 * min_spacing);
                    cv::Rect intersection = expanded_candidate & existing_rect;
                    if (intersection.area() > 0) {
                        overlaps = true;
                        break;
                    }
                }
                
                if (!overlaps) {
                    label_x = candidate_x;
                    label_y = candidate_y;
                    found_position = true;
                    break;
                }
            }
            
            // If all positions overlap, use the one with least overlap (above bbox, clamped)
            if (!found_position) {
                label_y = det.bbox.y - text_size.height - 5;
                if (label_y < 0) {
                    label_y = det.bbox.y + det.bbox.height + text_size.height + 5;
                }
                if (label_y + text_size.height > image.rows) {
                    label_y = image.rows - text_size.height - 5;
                }
                if (label_y < 0) {
                    label_y = 5;
                }
                
                label_x = det.bbox.x;
                if (label_x + text_size.width > image.cols) {
                    label_x = image.cols - text_size.width - 5;
                }
                if (label_x < 0) {
                    label_x = 5;
                }
            }
            
            // Draw label background with rounded corners
            // CRITICAL FIX: Get baseline for final label rect calculation
            // label_y represents top of text area, label_rect should start at label_y
            int final_baseline = 0;
            cv::getTextSize(label.substr(0, label.find('\n')), 
                           cv::FONT_HERSHEY_SIMPLEX, font_scale, font_thickness, &final_baseline);
            // Label rectangle height MUST include baseline (OpenCV getTextSize requirement)
            int label_rect_height = text_size.height + final_baseline + 8; // padding * 2
            cv::Rect label_rect(label_x - 4, label_y - 4, 
                              text_size.width + 8, label_rect_height);
            
            // Store label rect for overlap detection (after position is finalized)
            label_rects.push_back(label_rect);
            
            // #region agent log
            {
                auto now = std::chrono::system_clock::now();
                auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
                // Check for overlaps with existing labels (after avoidance)
                bool has_overlap = false;
                int overlap_count = 0;
                for (size_t j = 0; j < label_rects.size() - 1; ++j) {
                    cv::Rect intersection = label_rect & label_rects[j];
                    if (intersection.area() > label_rect.area() * 0.1) {
                        has_overlap = true;
                        overlap_count++;
                    }
                }
                std::ostringstream log_json;
                log_json << "{\"id\":\"log_" << ms << "_label" << i << "\",\"timestamp\":" << ms 
                         << ",\"location\":\"yoloe_node.cpp:580\",\"message\":\"label position finalized\","
                         << "\"data\":{\"index\":" << i << ",\"labelRect\":{\"x\":" << label_rect.x 
                         << ",\"y\":" << label_rect.y << ",\"width\":" << label_rect.width 
                         << ",\"height\":" << label_rect.height << "},\"textSize\":{\"width\":" 
                         << text_size.width << ",\"height\":" << text_size.height 
                         << "},\"hasOverlap\":" << (has_overlap ? "true" : "false") 
                         << ",\"overlapCount\":" << overlap_count << ",\"foundPosition\":" << (found_position ? "true" : "false")
                         << ",\"existingLabelCount\":" << (label_rects.size() - 1) 
                         << "},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\"}\n";
                fprintf(stderr, "%s", log_json.str().c_str());
                std::ofstream log_file("/tmp/debug.log", std::ios::app);
                if (log_file.is_open()) {
                    log_file << log_json.str();
                    log_file.close();
                }
            }
            // #endregion
            
            // Semi-transparent background
            cv::Mat overlay = image.clone();
            cv::rectangle(overlay, label_rect, blended_color, -1);
            cv::addWeighted(overlay, 0.7, image, 0.3, 0, image);
            
            // Draw label text (split into lines)
            // CRITICAL FIX: Properly calculate line height to prevent text overlapping
            std::vector<std::string> lines;
            size_t pos = 0;
            std::string remaining_label = label;
            while ((pos = remaining_label.find('\n')) != std::string::npos) {
                lines.push_back(remaining_label.substr(0, pos));
                remaining_label.erase(0, pos + 1);
            }
            if (!remaining_label.empty()) {
                lines.push_back(remaining_label);
            }
            
            // Calculate proper line height: use baseline + text height for single line
            // Then add spacing between lines
            // CRITICAL FIX: cv::putText uses baseline (bottom of text) as Y coordinate, not top!
            // Reuse single_line_baseline and single_line_size already calculated above
            int line_height = single_line_size.height + single_line_baseline + 2; // Add 2px spacing between lines
            
            // Convert label_y (top of text area) to baseline coordinate for first line
            // CRITICAL FIX: cv::putText uses baseline (bottom of text) as Y coordinate
            // label_y is the top of text area, so baseline Y = label_y + text height
            // We add padding (4px) since label_rect starts at label_y - 4
            int first_line_baseline_y = label_y + 4 + single_line_size.height + single_line_baseline;
            
            // Draw each line with proper vertical spacing
            for (size_t li = 0; li < lines.size(); ++li) {
                // Calculate baseline Y for this line
                // First line uses first_line_baseline_y, subsequent lines add line_height
                int line_baseline_y = first_line_baseline_y + static_cast<int>(li) * line_height;
                
                // Use white text with black outline for better readability
                cv::Scalar text_color(255, 255, 255);
                cv::Scalar outline_color(0, 0, 0);
                
                // Draw outline first (thicker) for better contrast with anti-aliasing
                for (int dx = -1; dx <= 1; ++dx) {
                    for (int dy = -1; dy <= 1; ++dy) {
                        if (dx != 0 || dy != 0) {
                            cv::putText(image, lines[li], 
                                      cv::Point(label_x + dx, line_baseline_y + dy),
                                      cv::FONT_HERSHEY_SIMPLEX, font_scale, outline_color, font_thickness + 1, cv::LINE_AA);
                        }
                    }
                }
                // Draw main text on top with anti-aliasing
                cv::putText(image, lines[li], 
                          cv::Point(label_x, line_baseline_y),
                          cv::FONT_HERSHEY_SIMPLEX, font_scale, text_color, font_thickness, cv::LINE_AA);
            }
        }
    }
    
    // Members
    std::unique_ptr<zip_vision::YOLOEEngine> engine_;
    rclcpp::Subscription<sensor_msgs::msg::Image>::SharedPtr image_sub_;
    rclcpp::Publisher<vision_msgs::msg::Detection2DArray>::SharedPtr detections_pub_;
    rclcpp::Publisher<sensor_msgs::msg::Image>::SharedPtr visualization_pub_;
    
    float confidence_threshold_;
    float nms_threshold_;
    int max_detections_;
    bool enable_visualization_;
    
    // Performance optimization: cache color palette
    mutable std::map<int, cv::Scalar> color_cache_;
};

int main(int argc, char** argv)
{
    rclcpp::init(argc, argv);
    auto node = std::make_shared<YOLOENode>();
    rclcpp::spin(node);
    rclcpp::shutdown();
    return 0;
}
