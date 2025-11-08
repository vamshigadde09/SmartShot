package com.anonymous.SmartShot

import android.content.Context
import android.util.Log
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.Data
import java.net.HttpURLConnection
import java.net.URL
import java.io.OutputStreamWriter
import org.json.JSONObject

/**
 * WorkManager worker for sending screenshot detection data to a background server.
 * This worker runs reliably in the background even when the app is closed.
 * 
 * Configuration:
 * 1. Add server URL to android/gradle.properties:
 *    screenshotServerUrl=https://your-server.com/api/screenshot-detected
 * 2. Optionally add API key for authentication:
 *    screenshotApiKey=your-api-key-here
 * 3. Rebuild the app for changes to take effect
 * 
 * Features:
 * - Automatically retries on failure with exponential backoff
 * - Works with WorkManager's constraints (network, battery, etc.)
 * - Sends device info and screenshot metadata to server
 * - Gracefully handles missing server configuration
 */
class ScreenshotUploadWorker(
    context: Context,
    workerParams: WorkerParameters
) : Worker(context, workerParams) {
    
    companion object {
        private const val TAG = "ScreenshotUploadWorker"
        
        // Data keys for worker input
        const val KEY_TIMESTAMP = "timestamp"
        const val KEY_URI = "uri"
        const val KEY_ANDROID14_API = "android14_api"
        const val KEY_PACKAGE_NAME = "packageName"
    }
    
    private val serverUrl: String
        get() = BuildConfig.SCREENSHOT_SERVER_URL
    
    private val apiKey: String
        get() = BuildConfig.SCREENSHOT_API_KEY
    
    override fun doWork(): Result {
        return try {
            // Check if server URL is configured
            if (serverUrl.isBlank()) {
                Log.d(TAG, "Server URL not configured, skipping upload")
                return Result.success() // Return success to avoid retries
            }
            
            // Get input data
            val timestamp = inputData.getLong(KEY_TIMESTAMP, System.currentTimeMillis())
            val uri = inputData.getString(KEY_URI) ?: ""
            val isAndroid14Api = inputData.getBoolean(KEY_ANDROID14_API, false)
            val packageName = inputData.getString(KEY_PACKAGE_NAME) ?: ""
            
            Log.d(TAG, "Processing screenshot upload: timestamp=$timestamp, uri=$uri, android14Api=$isAndroid14Api")
            
            // Prepare JSON payload
            val jsonPayload = JSONObject().apply {
                put("timestamp", timestamp)
                put("uri", uri)
                put("android14Api", isAndroid14Api)
                put("packageName", packageName)
                put("deviceInfo", getDeviceInfo())
            }
            
            // Send to server
            val success = sendToServer(jsonPayload)
            
            if (success) {
                Log.d(TAG, "Successfully sent screenshot data to server")
                Result.success()
            } else {
                Log.w(TAG, "Failed to send screenshot data to server, will retry")
                Result.retry()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in screenshot upload worker: ${e.message}", e)
            Result.retry()
        }
    }
    
    private fun sendToServer(jsonPayload: JSONObject): Boolean {
        return try {
            val url = URL(serverUrl)
            val connection = url.openConnection() as HttpURLConnection
            
            connection.apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
                
                // Add API key if configured
                if (apiKey.isNotBlank()) {
                    setRequestProperty("Authorization", "Bearer $apiKey")
                    // Alternative: setRequestProperty("X-API-Key", apiKey)
                }
                
                doOutput = true
                connectTimeout = 10000 // 10 seconds
                readTimeout = 10000 // 10 seconds
            }
            
            // Write JSON payload
            OutputStreamWriter(connection.outputStream, "UTF-8").use { writer ->
                writer.write(jsonPayload.toString())
                writer.flush()
            }
            
            val responseCode = connection.responseCode
            val success = responseCode in 200..299
            
            if (success) {
                Log.d(TAG, "Server responded with code: $responseCode")
            } else {
                // Read error response if available
                try {
                    val errorStream = connection.errorStream
                    if (errorStream != null) {
                        val errorResponse = errorStream.bufferedReader().use { it.readText() }
                        Log.w(TAG, "Server error response: $errorResponse")
                    }
                } catch (e: Exception) {
                    // Ignore error reading error stream
                }
                Log.w(TAG, "Server responded with error code: $responseCode")
            }
            
            connection.disconnect()
            success
        } catch (e: Exception) {
            Log.e(TAG, "Network error sending to server: ${e.message}", e)
            false
        }
    }
    
    private fun getDeviceInfo(): JSONObject {
        return JSONObject().apply {
            put("model", android.os.Build.MODEL)
            put("manufacturer", android.os.Build.MANUFACTURER)
            put("androidVersion", android.os.Build.VERSION.SDK_INT)
            put("androidRelease", android.os.Build.VERSION.RELEASE)
        }
    }
}

