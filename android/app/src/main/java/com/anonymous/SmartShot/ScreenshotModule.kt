package com.anonymous.SmartShot

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.ContentResolver
import android.content.Intent
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.Settings
import android.util.Log
import android.Manifest
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

class ScreenshotModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    private val context: Context = reactContext
    private var contentObserver: ContentObserver? = null
    private val CHANNEL_ID = "screenshot_detection"
    private val NOTIFICATION_ID = 1
    
    init {
        createNotificationChannel()
    }
    
    override fun getName(): String {
        return "ScreenshotModule"
    }
    
    @ReactMethod
    fun startScreenshotDetection() {
        Log.d("ScreenshotModule", "Starting screenshot detection...")
        
        // Check if background service is already running
        if (isBackgroundServiceRunning()) {
            Log.d("ScreenshotModule", "Background service is running, skipping local detection to avoid duplicates")
            return
        }
        
        // Check permissions first
        val hasStorage = PermissionManager.hasStoragePermission(context)
        val hasNotification = PermissionManager.hasNotificationPermission(context)
        
        if (!hasStorage || !hasNotification) {
            Log.e("ScreenshotModule", "Cannot start detection - permissions not granted (Storage: $hasStorage, Notification: $hasNotification)")
            return
        }
        
        try {
            // Start local detection for when app is running
            if (contentObserver == null) {
                contentObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
                    override fun onChange(selfChange: Boolean, uri: Uri?) {
                        super.onChange(selfChange, uri)
                        Log.d("ScreenshotModule", "Content changed: $uri, selfChange: $selfChange")
                        
                        // Check if it's a screenshot
                        if (isScreenshot(uri)) {
                            Log.d("ScreenshotModule", "Screenshot detected!")
                            onScreenshotDetected()
                        }
                    }
                }
                
                val contentResolver = context.contentResolver
                
                // Register for both external and internal storage
                contentResolver.registerContentObserver(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    true,
                    contentObserver!!
                )
                
                // Also register for internal storage (some devices use this)
                contentResolver.registerContentObserver(
                    MediaStore.Images.Media.INTERNAL_CONTENT_URI,
                    true,
                    contentObserver!!
                )
                
                Log.d("ScreenshotModule", "ContentObserver registered successfully for both external and internal storage")
            } else {
                Log.d("ScreenshotModule", "ContentObserver already registered")
            }
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error starting screenshot detection: ${e.message}")
        }
    }
    
    @ReactMethod
    fun checkPermissions(promise: Promise) {
        try {
            val hasStorage = PermissionManager.hasStoragePermission(context)
            val hasNotification = PermissionManager.hasNotificationPermission(context)
            
            Log.d("ScreenshotModule", "Storage permission: $hasStorage, Notification permission: $hasNotification")
            
            val allGranted = hasStorage && hasNotification
            promise.resolve(allGranted)
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error checking permissions: ${e.message}")
            promise.reject("PERMISSION_ERROR", "Error checking permissions: ${e.message}")
        }
    }
    
    @ReactMethod
    fun checkStoragePermission(promise: Promise) {
        try {
            val hasStorage = PermissionManager.hasStoragePermission(context)
            Log.d("ScreenshotModule", "Storage permission check: $hasStorage")
            promise.resolve(hasStorage)
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error checking storage permission: ${e.message}")
            promise.reject("STORAGE_PERMISSION_ERROR", "Error checking storage permission: ${e.message}")
        }
    }
    
    @ReactMethod
    fun requestPermissions() {
        Log.d("ScreenshotModule", "Requesting permissions...")
        // This will be handled by React Native side
    }
    
    @ReactMethod
    fun startBackgroundService() {
        Log.d("ScreenshotModule", "Starting background service...")
        try {
            // Check permissions first
            val hasStorage = PermissionManager.hasStoragePermission(context)
            val hasNotification = PermissionManager.hasNotificationPermission(context)
            
            if (!hasStorage || !hasNotification) {
                Log.e("ScreenshotModule", "Cannot start background service - permissions not granted")
                return
            }
            
            // Stop local detection to avoid duplicates
            stopScreenshotDetection()
            
            val serviceIntent = Intent(context, ScreenshotDetectionService::class.java).apply {
                action = ScreenshotDetectionService.ACTION_START_SERVICE
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            
            Log.d("ScreenshotModule", "Background service started successfully")
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Failed to start background service: ${e.message}")
        }
    }
    
    @ReactMethod
    fun stopBackgroundService() {
        Log.d("ScreenshotModule", "Stopping background service...")
        try {
            val serviceIntent = Intent(context, ScreenshotDetectionService::class.java).apply {
                action = ScreenshotDetectionService.ACTION_STOP_SERVICE
            }
            context.startService(serviceIntent)
            
            // Restart local detection when background service stops
            startScreenshotDetection()
            
            Log.d("ScreenshotModule", "Background service stop requested, local detection restarted")
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Failed to stop background service: ${e.message}")
        }
    }
    
    
    @ReactMethod
    fun stopScreenshotDetection() {
        Log.d("ScreenshotModule", "Stopping screenshot detection...")
        contentObserver?.let { observer ->
            context.contentResolver.unregisterContentObserver(observer)
            contentObserver = null
        }
    }
    
    @ReactMethod
    fun testDetection() {
        Log.d("ScreenshotModule", "Testing detection - sending test event")
        onScreenshotDetected()
    }
    
    @ReactMethod
    fun restartDetection() {
        Log.d("ScreenshotModule", "Restarting screenshot detection...")
        stopScreenshotDetection()
        startScreenshotDetection()
    }
    
    @ReactMethod
    fun testNotification() {
        Log.d("ScreenshotModule", "Testing notification...")
        onScreenshotDetected()
    }
    
    @ReactMethod
    fun checkNotificationPermission(promise: Promise) {
        try {
            val notificationManager = NotificationManagerCompat.from(context)
            val hasPermission = notificationManager.areNotificationsEnabled()
            Log.d("ScreenshotModule", "Notification permission: $hasPermission")
            promise.resolve(hasPermission)
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error checking notification permission: ${e.message}")
            promise.reject("NOTIFICATION_PERMISSION_ERROR", "Error checking notification permission: ${e.message}")
        }
    }
    
    @ReactMethod
    fun isBackgroundServiceRunning(promise: Promise) {
        try {
            val isRunning = isBackgroundServiceRunning()
            Log.d("ScreenshotModule", "Background service running: $isRunning")
            promise.resolve(isRunning)
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error checking background service status: ${e.message}")
            promise.reject("SERVICE_STATUS_ERROR", "Error checking background service status: ${e.message}")
        }
    }
    
    @ReactMethod
    fun restartBackgroundService() {
        Log.d("ScreenshotModule", "Restarting background service...")
        try {
            // Stop current service
            stopBackgroundService()
            
            // Wait a moment then restart
            Handler(Looper.getMainLooper()).postDelayed({
                startBackgroundService()
            }, 1000)
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error restarting background service: ${e.message}")
        }
    }
    
    @ReactMethod
    fun recreateNotificationChannel() {
        Log.d("ScreenshotModule", "Recreating notification channel...")
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                
                // Delete existing channel
                notificationManager.deleteNotificationChannel(CHANNEL_ID)
                
                // Create new channel with high importance
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Screenshot Detection",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Notifications for screenshot detection"
                    enableLights(true)
                    enableVibration(true)
                    setShowBadge(true)
                    setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI, null)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                }
                
                notificationManager.createNotificationChannel(channel)
                Log.d("ScreenshotModule", "Notification channel recreated with HIGH importance and sound")
            }
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error recreating notification channel: ${e.message}")
        }
    }
    
    @ReactMethod
    fun openNotificationSettings() {
        Log.d("ScreenshotModule", "Opening notification settings...")
        try {
            val intent = Intent().apply {
                action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
                putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
            Log.d("ScreenshotModule", "Notification settings opened")
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error opening notification settings: ${e.message}")
        }
    }
    
    @ReactMethod
    fun getScreenshots(promise: Promise) {
        Log.d("ScreenshotModule", "Getting screenshots...")
        try {
            val screenshots = mutableListOf<WritableMap>()
            
            val projection = arrayOf(
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DISPLAY_NAME,
                MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
                MediaStore.Images.Media.BUCKET_ID,
                MediaStore.Images.Media.DATA,
                MediaStore.Images.Media.DATE_ADDED,
                MediaStore.Images.Media.MIME_TYPE,
                MediaStore.Images.Media.SIZE
            )
            
            val selection = "${MediaStore.Images.Media.MIME_TYPE} LIKE 'image/%'"
            val sortOrder = "${MediaStore.Images.Media.DATE_ADDED} DESC"
            
            val cursor = context.contentResolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                null,
                sortOrder
            )
            
            cursor?.use {
                while (it.moveToNext()) { // Show all screenshots
                    try {
                        val id = it.getLong(it.getColumnIndexOrThrow(MediaStore.Images.Media._ID))
                        val displayName = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME))
                        val bucketName = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_DISPLAY_NAME))
                        val bucketId = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_ID))
                        val data = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATA))
                        val dateAdded = it.getLong(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED))
                        val mimeType = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE))
                        val size = it.getLong(it.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE))
                        
                        // Include ALL images, not just screenshots
                        // (Remove screenshot filtering to show all images)
                        val screenshot = Arguments.createMap()
                        screenshot.putString("id", id.toString())
                        screenshot.putString("name", displayName)
                        if (bucketName != null) screenshot.putString("bucketName", bucketName)
                        if (bucketId != null) screenshot.putString("bucketId", bucketId)
                        screenshot.putString("uri", "file://$data")
                        screenshot.putDouble("dateAdded", dateAdded.toDouble())
                        screenshot.putString("mimeType", mimeType)
                        screenshot.putDouble("size", size.toDouble())
                        
                        screenshots.add(screenshot)
                    } catch (e: Exception) {
                        Log.e("ScreenshotModule", "Error reading screenshot data: ${e.message}")
                    }
                }
            }
            
            val result = Arguments.createArray()
            for (screenshot in screenshots) {
                result.pushMap(screenshot)
            }
            
            promise.resolve(result)
            Log.d("ScreenshotModule", "Found ${screenshots.size} screenshots")
            
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error getting screenshots: ${e.message}")
            promise.reject("SCREENSHOT_ERROR", "Error getting screenshots: ${e.message}")
        }
    }

    @ReactMethod
    fun getImageAlbums(promise: Promise) {
        Log.d("ScreenshotModule", "Getting image albums...")
        try {
            val resolver = context.contentResolver
            val projection = arrayOf(
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
                MediaStore.Images.Media.BUCKET_ID,
                MediaStore.Images.Media.DATE_ADDED,
                MediaStore.Images.Media.DATA
            )
            val selection = "${MediaStore.Images.Media.MIME_TYPE} LIKE 'image/%'"
            val sortOrder = "${MediaStore.Images.Media.DATE_ADDED} DESC"

            val cursor = resolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                null,
                sortOrder
            )

            val bucketIdToAlbum = HashMap<String, WritableMap>()
            cursor?.use {
                while (it.moveToNext()) {
                    try {
                        val id = it.getLong(it.getColumnIndexOrThrow(MediaStore.Images.Media._ID))
                        val bucketName = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_DISPLAY_NAME)) ?: "Unknown"
                        val bucketId = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_ID)) ?: bucketName
                        val dateAdded = it.getLong(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED))
                        val data = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATA))

                        val key = bucketId
                        val existing = bucketIdToAlbum[key]
                        if (existing == null) {
                            val album = Arguments.createMap()
                            album.putString("id", key)
                            album.putString("name", bucketName)
                            album.putInt("count", 1)
                            album.putDouble("latest", dateAdded.toDouble())
                            // cover URI
                            album.putString("coverUri", "file://$data")
                            bucketIdToAlbum[key] = album
                        } else {
                            // increment count
                            val count = existing.getInt("count") + 1
                            existing.putInt("count", count)
                            val prevLatest = existing.getDouble("latest")
                            if (dateAdded.toDouble() >= prevLatest) {
                                existing.putDouble("latest", dateAdded.toDouble())
                                existing.putString("coverUri", "file://$data")
                            }
                        }
                    } catch (e: Exception) {
                        Log.e("ScreenshotModule", "Error reading album row: ${e.message}")
                    }
                }
            }

            val result = Arguments.createArray()
            // Sort by latest descending
            val sorted = bucketIdToAlbum.values.sortedByDescending { it.getDouble("latest") }
            for (album in sorted) {
                result.pushMap(album)
            }
            promise.resolve(result)
            Log.d("ScreenshotModule", "Found ${sorted.size} albums")
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error getting albums: ${e.message}")
            promise.reject("ALBUMS_ERROR", "Error getting albums: ${e.message}")
        }
    }
    
    @ReactMethod
    fun checkRecentImages() {
        Log.d("ScreenshotModule", "Checking recent images...")
        
        try {
            // Check permissions first
            if (!PermissionManager.hasStoragePermission(context)) {
                Log.e("ScreenshotModule", "No storage permission for checking recent images")
                return
            }
            
            val projection = arrayOf(
                MediaStore.Images.Media.DISPLAY_NAME,
                MediaStore.Images.Media.DATA,
                MediaStore.Images.Media.DATE_ADDED,
                MediaStore.Images.Media.MIME_TYPE
            )
            
            // Remove LIMIT from sortOrder - it's not supported by ContentResolver
            val sortOrder = "${MediaStore.Images.Media.DATE_ADDED} DESC"
            
            val cursor = context.contentResolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection,
                null,
                null,
                sortOrder
            )
            
            cursor?.use {
                var count = 0
                val maxCount = 10
                
                Log.d("ScreenshotModule", "Found ${it.count} total images in MediaStore")
                
                while (it.moveToNext() && count < maxCount) {
                    try {
                        val displayName = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME))
                        val data = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATA))
                        val dateAdded = it.getLong(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED))
                        val mimeType = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE))
                        
                        val currentTime = System.currentTimeMillis() / 1000
                        val timeDiff = currentTime - dateAdded
                        
                        Log.d("ScreenshotModule", "Recent file $count: $displayName, Path: $data, MIME: $mimeType, Time diff: $timeDiff")
                        count++
                    } catch (e: Exception) {
                        Log.e("ScreenshotModule", "Error reading image data at position $count: ${e.message}")
                        // Continue to next item instead of crashing
                    }
                }
                
                Log.d("ScreenshotModule", "Successfully checked $count recent images")
            } ?: run {
                Log.e("ScreenshotModule", "Cursor is null - no images found or permission denied")
            }
            
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error checking recent images: ${e.message}")
            e.printStackTrace()
        }
    }

    @ReactMethod
    fun getPeopleThumbnails(limit: Int, promise: Promise) {
        Log.d("ScreenshotModule", "Getting people thumbnails, limit=$limit")
        try {
            val resolver = context.contentResolver
            val projection = arrayOf(
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
                MediaStore.Images.Media.BUCKET_ID,
                MediaStore.Images.Media.DATA,
                MediaStore.Images.Media.DATE_ADDED
            )

            // Heuristics: common buckets/paths created by OEM galleries for faces/people
            val selection = (
                "LOWER(" + MediaStore.Images.Media.BUCKET_DISPLAY_NAME + ") LIKE ? OR " +
                "LOWER(" + MediaStore.Images.Media.DATA + ") LIKE ? OR " +
                "LOWER(" + MediaStore.Images.Media.DATA + ") LIKE ?"
            )
            val args = arrayOf("%people%", "%/people/%", "%/faces/%")
            val sortOrder = MediaStore.Images.Media.DATE_ADDED + " DESC"

            val cursor = resolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                args,
                sortOrder
            )

            val result = Arguments.createArray()
            var count = 0
            cursor?.use {
                while (it.moveToNext() && count < limit) {
                    try {
                        val data = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATA))
                        val dateAdded = it.getLong(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED))
                        val row = Arguments.createMap()
                        row.putString("uri", "file://$data")
                        row.putDouble("dateAdded", dateAdded.toDouble())
                        result.pushMap(row)
                        count++
                    } catch (e: Exception) {
                        Log.e("ScreenshotModule", "Error reading people row: ${e.message}")
                    }
                }
            }

            promise.resolve(result)
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error getting people thumbnails: ${e.message}")
            promise.reject("PEOPLE_ERROR", "Error getting people thumbnails: ${e.message}")
        }
    }

    @ReactMethod
    fun getSimilarGroups(limit: Int, minGroupSize: Int, promise: Promise) {
        Log.d("ScreenshotModule", "Getting similar groups (burst/name-based) limit=$limit min=$minGroupSize")
        try {
            val resolver = context.contentResolver
            val projection = arrayOf(
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DISPLAY_NAME,
                MediaStore.Images.Media.DATA,
                MediaStore.Images.Media.DATE_ADDED
            )
            val selection = "${MediaStore.Images.Media.MIME_TYPE} LIKE 'image/%'"
            val sortOrder = MediaStore.Images.Media.DATE_ADDED + " DESC"

            val cursor = resolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                null,
                sortOrder
            )

            // Group by filename stem (e.g., IMG_20241010_1234 -> IMG_20241010)
            data class Row(val name: String, val path: String, val date: Long)
            val rows = ArrayList<Row>()
            var countScanned = 0
            cursor?.use {
                while (it.moveToNext() && countScanned < 2000) { // scan at most 2000 newest
                    try {
                        val name = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)) ?: ""
                        val data = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATA)) ?: continue
                        val date = it.getLong(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED))
                        rows.add(Row(name, data, date))
                        countScanned++
                    } catch (_: Exception) { }
                }
            }

            fun stem(s: String): String {
                // remove extension
                val base = s.substringBeforeLast('.')
                // drop trailing underscore/sequence of digits
                return base.replace(Regex("[_-]\\d+$"), "").lowercase()
            }

            val map = LinkedHashMap<String, MutableList<Row>>()
            for (r in rows) {
                val key = stem(r.name)
                val list = map.getOrPut(key) { mutableListOf() }
                list.add(r)
            }

            // Build groups
            data class Group(val key: String, val items: List<Row>)
            val groups = map.entries
                .filter { it.value.size >= minGroupSize }
                .map { Group(it.key, it.value.sortedByDescending { row -> row.date }) }
                .sortedByDescending { g -> g.items.first().date }
                .take(limit)

            val result = Arguments.createArray()
            for (g in groups) {
                val m = Arguments.createMap()
                m.putString("id", g.key)
                m.putString("name", g.key.ifEmpty { "Series" })
                m.putInt("count", g.items.size)
                m.putString("coverUri", "file://${g.items.first().path}")
                result.pushMap(m)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error getting similar groups: ${e.message}")
            promise.reject("GROUPS_ERROR", "Error getting similar groups: ${e.message}")
        }
    }
    
    private fun isScreenshot(uri: Uri?): Boolean {
        if (uri == null) {
            Log.d("ScreenshotModule", "URI is null")
            return false
        }
        
        Log.d("ScreenshotModule", "Checking URI: $uri")
        
        val projection = arrayOf(
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.DATA,
            MediaStore.Images.Media.DATE_ADDED,
            MediaStore.Images.Media.MIME_TYPE,
            MediaStore.Images.Media.SIZE
        )
        
        val cursor = context.contentResolver.query(uri, projection, null, null, null)
        cursor?.use {
            if (it.moveToFirst()) {
                val displayName = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME))
                val data = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATA))
                val dateAdded = it.getLong(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED))
                val mimeType = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE))
                val size = it.getLong(it.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE))
                
                Log.d("ScreenshotModule", "File: $displayName, Path: $data, MIME: $mimeType, Size: $size")
                
                // Check if it's a recent file (within last 15 seconds)
                val currentTime = System.currentTimeMillis() / 1000
                val isRecent = (currentTime - dateAdded) < 15
                
                // More comprehensive screenshot detection
                val isScreenshot = isRecent && (
                    // Common screenshot naming patterns
                    displayName.startsWith("Screenshot_") ||
                    displayName.startsWith("screenshot_") ||
                    displayName.startsWith("Screen_") ||
                    displayName.startsWith("screen_") ||
                    displayName.startsWith("IMG_") ||
                    displayName.startsWith("img_") ||
                    displayName.startsWith("PXL_") ||
                    displayName.startsWith("pxl_") ||
                    displayName.contains("Screenshot") ||
                    displayName.contains("screenshot") ||
                    displayName.contains("Screen") ||
                    displayName.contains("screen") ||
                    displayName.contains("Capture") ||
                    displayName.contains("capture") ||
                    // Common screenshot directories
                    data.contains("/Screenshots/") ||
                    data.contains("/Pictures/Screenshots/") ||
                    data.contains("/DCIM/Screenshots/") ||
                    data.contains("/Screenshots") ||
                    data.contains("/screenshots") ||
                    data.contains("/Screen") ||
                    data.contains("/screen") ||
                    data.contains("/Capture") ||
                    data.contains("/capture") ||
                    // Some devices use different patterns
                    data.contains("Screenshot") ||
                    data.contains("screenshot") ||
                    data.contains("Screen") ||
                    data.contains("screen") ||
                    // Check if it's a PNG (screenshots are often PNG)
                    (mimeType == "image/png" && isRecent) ||
                    // Check if it's a recent JPEG that might be a screenshot
                    (mimeType == "image/jpeg" && isRecent && size > 100000) // Larger than 100KB
                )
                
                Log.d("ScreenshotModule", "Is screenshot: $isScreenshot, Is recent: $isRecent, Time diff: ${currentTime - dateAdded}")
                return isScreenshot
            }
        }
        return false
    }
    
    private fun onScreenshotDetected() {
        // Send event to React Native
        val params = Arguments.createMap()
        params.putString("message", "Screenshot detected!")
        params.putDouble("timestamp", System.currentTimeMillis().toDouble())
        
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("ScreenshotDetected", params)
        
        // Show local notification
        showNotification()
    }
    
    private fun createNotificationChannel() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                
                // Always delete and recreate to ensure proper settings
                notificationManager.deleteNotificationChannel(CHANNEL_ID)
                
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Screenshot Detection",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Notifications for screenshot detection"
                    enableLights(true)
                    enableVibration(true)
                    setShowBadge(true)
                    setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI, null)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                }
                
                notificationManager.createNotificationChannel(channel)
                Log.d("ScreenshotModule", "Notification channel created with HIGH importance and sound")
            }
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error creating notification channel: ${e.message}")
        }
    }
    
    private fun isBackgroundServiceRunning(): Boolean {
        return try {
            val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            val runningServices = activityManager.getRunningServices(Integer.MAX_VALUE)
            
            for (serviceInfo in runningServices) {
                if (ScreenshotDetectionService::class.java.name == serviceInfo.service.className) {
                    Log.d("ScreenshotModule", "Background service is running")
                    return true
                }
            }
            Log.d("ScreenshotModule", "Background service is not running")
            false
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error checking background service status: ${e.message}")
            false
        }
    }
    
    private fun showNotification() {
        try {
            // Check if notifications are enabled
            val notificationManager = NotificationManagerCompat.from(context)
            if (!notificationManager.areNotificationsEnabled()) {
                Log.e("ScreenshotModule", "Notifications are disabled")
                return
            }
            
            // Create notification channel for Android 8.0+
            createNotificationChannel()
            
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_camera)
                .setContentTitle("Screenshot Detected! 📸")
                .setContentText("Someone took a screenshot of the app")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setVibrate(longArrayOf(0, 1000, 500, 1000))
                .build()
            
            notificationManager.notify(NOTIFICATION_ID, notification)
            Log.d("ScreenshotModule", "Notification displayed successfully")
            
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error showing notification: ${e.message}")
        }
    }
}
