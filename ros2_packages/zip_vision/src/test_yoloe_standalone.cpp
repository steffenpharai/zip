/**
 * @file test_yoloe_standalone.cpp
 * @brief Minimal standalone test for YOLOE TensorRT engine
 * 
 * This test bypasses ROS 2 entirely to isolate TensorRT/CUDA issues.
 * Usage: ./test_yoloe_standalone <engine_path> [test_image_path]
 */

#include "zip_vision/yoloe_engine.hpp"
#include <opencv2/opencv.hpp>
#include <iostream>
#include <chrono>
#include <cstring>
#include <csignal>
#include <execinfo.h>

// Signal handler for debugging
void signalHandler(int sig)
{
    const char* sig_name = (sig == SIGSEGV) ? "SIGSEGV" : (sig == SIGABRT) ? "SIGABRT" : "UNKNOWN";
    fprintf(stderr, "\n=== Signal Caught: %s (%d) ===\n", sig_name, sig);
    
    void* array[20];
    size_t size = backtrace(array, 20);
    char** messages = backtrace_symbols(array, size);
    
    fprintf(stderr, "Backtrace:\n");
    for (size_t i = 0; i < size; ++i) {
        fprintf(stderr, "  [%zu] %s\n", i, messages[i]);
    }
    free(messages);
    
    signal(sig, SIG_DFL);
    raise(sig);
}

int main(int argc, char** argv)
{
    // Install signal handlers
    signal(SIGSEGV, signalHandler);
    signal(SIGABRT, signalHandler);
    
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <engine_path> [test_image_path]" << std::endl;
        std::cerr << "  engine_path: Path to TensorRT engine file (.engine)" << std::endl;
        std::cerr << "  test_image_path: Optional path to test image (default: creates 640x640 test image)" << std::endl;
        return 1;
    }
    
    std::string engine_path = argv[1];
    std::string image_path;
    
    if (argc >= 3) {
        image_path = argv[2];
    }
    
    std::cout << "=== YOLOE Standalone Test ===" << std::endl;
    std::cout << "Engine path: " << engine_path << std::endl;
    
    // Create YOLOE engine
    zip_vision::YOLOEEngine engine;
    
    std::cout << "\n[1/5] Initializing engine..." << std::endl;
    if (!engine.initialize(engine_path, 640, 640, false)) {
        std::cerr << "ERROR: Failed to initialize engine" << std::endl;
        return 1;
    }
    std::cout << "✓ Engine initialized successfully" << std::endl;
    
    // Load or create test image
    cv::Mat test_image;
    if (!image_path.empty()) {
        std::cout << "\n[2/5] Loading test image: " << image_path << std::endl;
        test_image = cv::imread(image_path);
        if (test_image.empty()) {
            std::cerr << "ERROR: Failed to load image: " << image_path << std::endl;
            return 1;
        }
        std::cout << "✓ Image loaded: " << test_image.cols << "x" << test_image.rows << std::endl;
    } else {
        std::cout << "\n[2/5] Creating test image (640x640)..." << std::endl;
        test_image = cv::Mat(640, 640, CV_8UC3, cv::Scalar(128, 128, 128));
        // Draw some shapes for visual interest
        cv::rectangle(test_image, cv::Point(100, 100), cv::Point(300, 300), cv::Scalar(255, 0, 0), -1);
        cv::circle(test_image, cv::Point(450, 450), 100, cv::Scalar(0, 255, 0), -1);
        std::cout << "✓ Test image created: " << test_image.cols << "x" << test_image.rows << std::endl;
    }
    
    // Validate image
    if (test_image.empty() || test_image.data == nullptr) {
        std::cerr << "ERROR: Invalid test image" << std::endl;
        return 1;
    }
    
    std::cout << "\n[3/5] Running inference..." << std::endl;
    std::vector<zip_vision::Detection> detections;
    
    auto start_time = std::chrono::high_resolution_clock::now();
    
    bool success = engine.infer(test_image, detections, 0.5f, 0.4f);
    
    auto end_time = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time);
    
    if (!success) {
        std::cerr << "ERROR: Inference failed" << std::endl;
        return 1;
    }
    
    std::cout << "✓ Inference completed in " << duration.count() << " ms" << std::endl;
    std::cout << "✓ Detections found: " << detections.size() << std::endl;
    
    // Print detection details
    std::cout << "\n[4/5] Detection results:" << std::endl;
    for (size_t i = 0; i < detections.size() && i < 10; ++i) {
        const auto& det = detections[i];
        std::cout << "  [" << i << "] " << det.class_name 
                  << " (conf: " << det.confidence 
                  << ", bbox: [" << det.bbox.x << ", " << det.bbox.y 
                  << ", " << det.bbox.width << ", " << det.bbox.height << "])" << std::endl;
    }
    if (detections.size() > 10) {
        std::cout << "  ... and " << (detections.size() - 10) << " more" << std::endl;
    }
    
    // Run multiple iterations for timing
    std::cout << "\n[5/5] Running timing test (10 iterations)..." << std::endl;
    std::vector<long> timings;
    for (int i = 0; i < 10; ++i) {
        std::vector<zip_vision::Detection> dets;
        auto t1 = std::chrono::high_resolution_clock::now();
        engine.infer(test_image, dets, 0.5f, 0.4f);
        auto t2 = std::chrono::high_resolution_clock::now();
        auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(t2 - t1).count();
        timings.push_back(ms);
    }
    
    long sum = 0;
    for (long t : timings) {
        sum += t;
    }
    double avg = static_cast<double>(sum) / timings.size();
    
    std::cout << "✓ Average inference time: " << avg << " ms" << std::endl;
    std::cout << "✓ Estimated FPS: " << (1000.0 / avg) << std::endl;
    
    std::cout << "\n=== Test completed successfully ===" << std::endl;
    return 0;
}
