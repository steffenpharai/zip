/**
 * Web Server - Interface
 * 
 * HTTP server for camera streaming and diagnostics.
 * Provides:
 *   - Main server on port 80 (/, /capture, /health)
 *   - Stream server on port 81 (/stream)
 */

#ifndef WEB_SERVER_H
#define WEB_SERVER_H

#include <stdbool.h>

// ============================================================================
// Web Server Interface
// ============================================================================

/**
 * Initialize and start HTTP servers.
 * - Main server on CONFIG_HTTP_PORT (default 80)
 * - Stream server on CONFIG_STREAM_PORT (default 81)
 * 
 * @return true if servers started successfully
 */
bool web_server_init();

/**
 * Check if web server is running.
 * 
 * @return true if servers are active
 */
bool web_server_is_ok();

/**
 * Stop web servers.
 */
void web_server_stop();

/**
 * Get last error message.
 * 
 * @return Error message or "OK"
 */
const char* web_server_last_error();

#endif // WEB_SERVER_H

