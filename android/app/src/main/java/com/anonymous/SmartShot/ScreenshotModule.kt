package com.anonymous.SmartShot

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
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
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import android.content.ContentValues
import android.content.ContentUris
import android.media.MediaScannerConnection
import java.io.File
import com.facebook.react.modules.core.DeviceEventManagerModule
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import android.os.Environment

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
    fun getAllMedia(promise: Promise) {
        Log.d("ScreenshotModule", "Getting all media (images + videos)...")
        try {
            val items = mutableListOf<WritableMap>()

            // Query images
            run {
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
                    projection, selection, null, sortOrder
                )
                cursor?.use {
                    while (it.moveToNext()) {
                        try {
                            val id = it.getLong(it.getColumnIndexOrThrow(MediaStore.Images.Media._ID))
                            val displayName = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME))
                            val bucketName = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_DISPLAY_NAME))
                            val bucketId = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_ID))
                            val data = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATA))
                            val dateAdded = it.getLong(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED))
                            val mimeType = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE))
                            val size = it.getLong(it.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE))
                            val map = Arguments.createMap()
                            map.putString("id", id.toString())
                            map.putString("name", displayName)
                            if (bucketName != null) map.putString("bucketName", bucketName)
                            if (bucketId != null) map.putString("bucketId", bucketId)
                            map.putString("uri", "file://$data")
                            map.putDouble("dateAdded", dateAdded.toDouble())
                            map.putString("mimeType", mimeType)
                            map.putDouble("size", size.toDouble())
                            map.putString("mediaType", "image")
                            items.add(map)
                        } catch (e: Exception) { Log.e("ScreenshotModule", "Error reading image row: ${e.message}") }
                    }
                }
            }

            // Query videos
            run {
                val projection = arrayOf(
                    MediaStore.Video.Media._ID,
                    MediaStore.Video.Media.DISPLAY_NAME,
                    MediaStore.Video.Media.BUCKET_DISPLAY_NAME,
                    MediaStore.Video.Media.BUCKET_ID,
                    MediaStore.Video.Media.DATA,
                    MediaStore.Video.Media.DATE_ADDED,
                    MediaStore.Video.Media.MIME_TYPE,
                    MediaStore.Video.Media.SIZE
                )
                val selection = "${MediaStore.Video.Media.MIME_TYPE} LIKE 'video/%'"
                val sortOrder = "${MediaStore.Video.Media.DATE_ADDED} DESC"
                val cursor = context.contentResolver.query(
                    MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                    projection, selection, null, sortOrder
                )
                cursor?.use {
                    while (it.moveToNext()) {
                        try {
                            val id = it.getLong(it.getColumnIndexOrThrow(MediaStore.Video.Media._ID))
                            val displayName = it.getString(it.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME))
                            val bucketName = it.getString(it.getColumnIndexOrThrow(MediaStore.Video.Media.BUCKET_DISPLAY_NAME))
                            val bucketId = it.getString(it.getColumnIndexOrThrow(MediaStore.Video.Media.BUCKET_ID))
                            val data = it.getString(it.getColumnIndexOrThrow(MediaStore.Video.Media.DATA))
                            val dateAdded = it.getLong(it.getColumnIndexOrThrow(MediaStore.Video.Media.DATE_ADDED))
                            val mimeType = it.getString(it.getColumnIndexOrThrow(MediaStore.Video.Media.MIME_TYPE))
                            val size = it.getLong(it.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE))
                            val map = Arguments.createMap()
                            map.putString("id", id.toString())
                            map.putString("name", displayName)
                            if (bucketName != null) map.putString("bucketName", bucketName)
                            if (bucketId != null) map.putString("bucketId", bucketId)
                            map.putString("uri", "file://$data")
                            map.putDouble("dateAdded", dateAdded.toDouble())
                            map.putString("mimeType", mimeType)
                            map.putDouble("size", size.toDouble())
                            map.putString("mediaType", "video")
                            items.add(map)
                        } catch (e: Exception) { Log.e("ScreenshotModule", "Error reading video row: ${e.message}") }
                    }
                }
            }

            // Sort merged list by dateAdded desc
            val result = Arguments.createArray()
            items.sortByDescending { it.getDouble("dateAdded") }
            for (it in items) { result.pushMap(it) }
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error getting all media: ${e.message}")
            promise.reject("MEDIA_ERROR", "Error getting all media: ${e.message}")
        }
    }

    @ReactMethod
    fun renameImage(fileUriOrPath: String, newDisplayNameRaw: String, promise: Promise) {
        try {
            if (!PermissionManager.hasStoragePermission(context)) {
                promise.reject("NO_PERMISSION", "Storage permission not granted")
                return
            }

            val resolver = context.contentResolver

            // Normalize inputs
            val uri = try {
                if (fileUriOrPath.startsWith("content://") || fileUriOrPath.startsWith("file://")) {
                    Uri.parse(fileUriOrPath)
                } else {
                    Uri.fromFile(File(fileUriOrPath))
                }
            } catch (e: Exception) { null }

            // Figure out current mime and extension
            var currentDisplayName = ""
            var currentMime: String? = null
            var dataPath: String? = null
            val projection = arrayOf(
                MediaStore.Images.Media.DISPLAY_NAME,
                MediaStore.Images.Media.MIME_TYPE,
                MediaStore.Images.Media.DATA,
                MediaStore.Images.Media._ID
            )

            // Query by Uri if it's a content uri; otherwise attempt query by file path
            var contentUri: Uri? = null
            if (uri != null && uri.scheme == "content") {
                resolver.query(uri, projection, null, null, null)?.use { c ->
                    if (c.moveToFirst()) {
                        currentDisplayName = c.getString(c.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME))
                        currentMime = c.getString(c.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE))
                        dataPath = c.getString(c.getColumnIndexOrThrow(MediaStore.Images.Media.DATA))
                        val id = c.getLong(c.getColumnIndexOrThrow(MediaStore.Images.Media._ID))
                        contentUri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
                    }
                }
            }

            if (contentUri == null) {
                // Try by DATA path
                val path = if (uri?.scheme == "file") uri.path else fileUriOrPath
                val selection = MediaStore.Images.Media.DATA + "=?"
                resolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, projection, selection, arrayOf(path), null)?.use { c ->
                    if (c.moveToFirst()) {
                        currentDisplayName = c.getString(c.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME))
                        currentMime = c.getString(c.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE))
                        dataPath = c.getString(c.getColumnIndexOrThrow(MediaStore.Images.Media.DATA))
                        val id = c.getLong(c.getColumnIndexOrThrow(MediaStore.Images.Media._ID))
                        contentUri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
                    }
                }
            }

            if (contentUri == null && dataPath == null) {
                promise.reject("NOT_FOUND", "Image not found in MediaStore")
                return
            }

            // Preserve extension if user omitted it
            val ext = try {
                val n = (currentDisplayName.ifEmpty { dataPath ?: "" })
                val dot = n.lastIndexOf('.')
                if (dot >= 0) n.substring(dot) else ""
            } catch (e: Exception) { "" }
            val sanitized = newDisplayNameRaw.replace("[\\\\/:*?\"<>|]".toRegex(), " ").trim()
            val targetName = if (sanitized.endsWith(ext) || ext.isEmpty()) sanitized else (sanitized + ext)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && contentUri != null) {
                val values = ContentValues().apply { put(MediaStore.Images.Media.DISPLAY_NAME, targetName) }
                val rows = resolver.update(contentUri!!, values, null, null)
                if (rows > 0) {
                    promise.resolve(true)
                } else {
                    promise.reject("RENAME_FAILED", "Update affected 0 rows")
                }
                return
            }

            // Fallback for older versions: rename the actual file, then scan
            val fromPath = dataPath ?: uri?.path
            if (fromPath == null) {
                promise.reject("NO_PATH", "Could not resolve file path")
                return
            }
            val fromFile = File(fromPath)
            val destFile = File(fromFile.parentFile, targetName)
            val ok = fromFile.renameTo(destFile)
            if (!ok) {
                promise.reject("RENAME_FAILED", "File renameTo returned false")
                return
            }
            try {
                // Scan new file so gallery updates
                MediaScannerConnection.scanFile(context, arrayOf(destFile.absolutePath), null, null)
            } catch (_: Exception) { }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RENAME_ERROR", e.message)
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
    fun getMediaAlbums(promise: Promise) {
        Log.d("ScreenshotModule", "Getting media albums (images + videos)...")
        try {
            val resolver = context.contentResolver
            val bucketIdToAlbum = HashMap<String, WritableMap>()

            fun addRow(bucketId: String, bucketName: String, dateAdded: Long, data: String) {
                val key = bucketId
                val existing = bucketIdToAlbum[key]
                if (existing == null) {
                    val album = Arguments.createMap()
                    album.putString("id", key)
                    album.putString("name", bucketName)
                    album.putInt("count", 1)
                    album.putDouble("latest", dateAdded.toDouble())
                    album.putString("coverUri", "file://$data")
                    bucketIdToAlbum[key] = album
                } else {
                    val count = existing.getInt("count") + 1
                    existing.putInt("count", count)
                    val prevLatest = existing.getDouble("latest")
                    if (dateAdded.toDouble() >= prevLatest) {
                        existing.putDouble("latest", dateAdded.toDouble())
                        existing.putString("coverUri", "file://$data")
                    }
                }
            }

            // Images
            run {
                val projection = arrayOf(
                    MediaStore.Images.Media.BUCKET_DISPLAY_NAME,
                    MediaStore.Images.Media.BUCKET_ID,
                    MediaStore.Images.Media.DATE_ADDED,
                    MediaStore.Images.Media.DATA
                )
                val selection = "${MediaStore.Images.Media.MIME_TYPE} LIKE 'image/%'"
                val sortOrder = "${MediaStore.Images.Media.DATE_ADDED} DESC"
                val cursor = resolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, projection, selection, null, sortOrder)
                cursor?.use {
                    while (it.moveToNext()) {
                        try {
                            val bucketName = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_DISPLAY_NAME)) ?: "Unknown"
                            val bucketId = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_ID)) ?: bucketName
                            val dateAdded = it.getLong(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED))
                            val data = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATA))
                            addRow(bucketId, bucketName, dateAdded, data)
                        } catch (e: Exception) { Log.e("ScreenshotModule", "Error reading image album row: ${e.message}") }
                    }
                }
            }

            // Videos
            run {
                val projection = arrayOf(
                    MediaStore.Video.Media.BUCKET_DISPLAY_NAME,
                    MediaStore.Video.Media.BUCKET_ID,
                    MediaStore.Video.Media.DATE_ADDED,
                    MediaStore.Video.Media.DATA
                )
                val selection = "${MediaStore.Video.Media.MIME_TYPE} LIKE 'video/%'"
                val sortOrder = "${MediaStore.Video.Media.DATE_ADDED} DESC"
                val cursor = resolver.query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, projection, selection, null, sortOrder)
                cursor?.use {
                    while (it.moveToNext()) {
                        try {
                            val bucketName = it.getString(it.getColumnIndexOrThrow(MediaStore.Video.Media.BUCKET_DISPLAY_NAME)) ?: "Unknown"
                            val bucketId = it.getString(it.getColumnIndexOrThrow(MediaStore.Video.Media.BUCKET_ID)) ?: bucketName
                            val dateAdded = it.getLong(it.getColumnIndexOrThrow(MediaStore.Video.Media.DATE_ADDED))
                            val data = it.getString(it.getColumnIndexOrThrow(MediaStore.Video.Media.DATA))
                            addRow(bucketId, bucketName, dateAdded, data)
                        } catch (e: Exception) { Log.e("ScreenshotModule", "Error reading video album row: ${e.message}") }
                    }
                }
            }

            val result = Arguments.createArray()
            val sorted = bucketIdToAlbum.values.sortedByDescending { it.getDouble("latest") }
            for (album in sorted) { result.pushMap(album) }
            promise.resolve(result)
            Log.d("ScreenshotModule", "Found ${sorted.size} media albums")
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error getting media albums: ${e.message}")
            promise.reject("ALBUMS_ERROR", "Error getting media albums: ${e.message}")
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
        
        // Only show notification if background service is NOT running
        // If background service is running, it will handle the notification to avoid duplicates
        if (!isBackgroundServiceRunning()) {
            showNotification()
        } else {
            Log.d("ScreenshotModule", "Background service is running, skipping notification to avoid duplicates")
        }
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
            
            // Open app intent
            val openAppIntent = Intent(context, Class.forName("com.anonymous.SmartShot.MainActivity")).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("openScreenshotsTab", true)
            }
            val openAppPending = PendingIntent.getActivity(
                context, 100, openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            
            // Edit action - opens edit screen via deep link
            val editDeepLink = Uri.parse("smartshot:///edit-screenshot")
            val editIntent = Intent(Intent.ACTION_VIEW, editDeepLink).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val editPending = PendingIntent.getActivity(
                context, 102, editIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            
            // Dismiss action - dismisses the notification
            val dismissIntent = Intent(context, Class.forName("com.anonymous.SmartShot.ScreenshotDetectionService")).apply {
                action = ScreenshotDetectionService.ACTION_DISMISS_NOTIFICATION
                putExtra(ScreenshotDetectionService.EXTRA_NOTIFICATION_ID, NOTIFICATION_ID)
            }
            val dismissPending = PendingIntent.getService(
                context, 103, dismissIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_camera)
                .setContentTitle("Screenshot Detected! 📸")
                .setContentText("Someone took a screenshot of the app")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setContentIntent(openAppPending)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setVibrate(longArrayOf(0, 1000, 500, 1000))
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                // Add action buttons - these will appear below the notification
                .addAction(android.R.drawable.ic_menu_view, "Open", openAppPending)
                .addAction(android.R.drawable.ic_menu_edit, "Edit", editPending)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Dismiss", dismissPending)
                .setStyle(NotificationCompat.BigTextStyle()
                    .bigText("A screenshot was detected. Use the buttons below to open the app, edit the screenshot, or dismiss this notification."))
                .build()
            
            notificationManager.notify(NOTIFICATION_ID, notification)
            Log.d("ScreenshotModule", "Notification displayed successfully with actions")
            
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error showing notification: ${e.message}", e)
        }
    }
    
    @ReactMethod
    fun getAppSpecificDirectoryPath(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val appSpecificDir = context.getExternalFilesDir(null)
                if (appSpecificDir != null) {
                    val smartShotDir = File(appSpecificDir, "SmartShot")
                    // Create directory if it doesn't exist
                    if (!smartShotDir.exists()) {
                        val created = smartShotDir.mkdirs()
                        if (created && smartShotDir.exists() && smartShotDir.isDirectory) {
                            Log.d("ScreenshotModule", "Created and returning app-specific directory: ${smartShotDir.absolutePath}")
                            promise.resolve(smartShotDir.absolutePath)
                            return
                        }
                    } else if (smartShotDir.isDirectory) {
                        Log.d("ScreenshotModule", "Returning existing app-specific directory: ${smartShotDir.absolutePath}")
                        promise.resolve(smartShotDir.absolutePath)
                        return
                    }
                }
            }
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e("ScreenshotModule", "Error getting app-specific directory path: ${e.message}")
            promise.reject("DIRECTORY_ERROR", "Failed to get app-specific directory path: ${e.message}")
        }
    }
    
    @ReactMethod
    fun createExternalStorageDirectory(promise: Promise) {
        try {
            Log.d("ScreenshotModule", "Creating external storage directory...")
            
            // On Android 10+, direct writes to /storage/emulated/0 are restricted
            // For Android 10+, use app-specific external directory (no permissions needed)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    val appSpecificDir = context.getExternalFilesDir(null)
                    if (appSpecificDir != null) {
                        val smartShotDir = File(appSpecificDir, "SmartShot")
                        Log.d("ScreenshotModule", "Using app-specific directory: ${smartShotDir.absolutePath}")
                        
                        if (!smartShotDir.exists()) {
                            val created = smartShotDir.mkdirs()
                            if (created && smartShotDir.exists() && smartShotDir.isDirectory) {
                                Log.d("ScreenshotModule", "Successfully created app-specific directory: ${smartShotDir.absolutePath}")
                                promise.resolve(true)
                                return
                            }
                        } else if (smartShotDir.isDirectory) {
                            Log.d("ScreenshotModule", "App-specific directory already exists: ${smartShotDir.absolutePath}")
                            promise.resolve(true)
                            return
                        }
                    }
                } catch (appDirError: Exception) {
                    Log.w("ScreenshotModule", "App-specific directory creation failed, trying Downloads: ${appDirError.message}")
                }
            }
            
            // Check permission first (for Android 10-12 if using Downloads)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                val hasWritePermission = ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE
                ) == PackageManager.PERMISSION_GRANTED
                
                if (!hasWritePermission) {
                    val errorMsg = "WRITE_EXTERNAL_STORAGE permission not granted. Please grant storage permission first, or use the 'Select Folder' option in Settings."
                    Log.e("ScreenshotModule", errorMsg)
                    promise.reject("PERMISSION_DENIED", errorMsg)
                    return
                }
            }
            
            // Use Pictures directory for better privacy and accessibility
            // Pictures folder is more accessible on Android 10+ and is more appropriate for image-related data
            val picturesDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
            val smartShotDir = File(picturesDir, "SmartShot")
            
            Log.d("ScreenshotModule", "Attempting to create directory at: ${smartShotDir.absolutePath}")
            
            // Check if Pictures directory exists and is writable
            if (picturesDir == null || !picturesDir.exists()) {
                // Try to create Pictures directory (should exist, but just in case)
                try {
                    val picturesCreated = picturesDir?.mkdirs()
                    if (picturesCreated == null || picturesCreated == false || !picturesDir.exists()) {
                        val errorMsg = "Pictures directory does not exist and cannot be created: ${picturesDir?.absolutePath ?: "null"}"
                        Log.e("ScreenshotModule", errorMsg)
                        promise.reject("PICTURES_NOT_ACCESSIBLE", errorMsg)
                        return
                    }
                } catch (e: Exception) {
                    val errorMsg = "Cannot access Pictures directory: ${e.message}"
                    Log.e("ScreenshotModule", errorMsg, e)
                    promise.reject("PICTURES_NOT_ACCESSIBLE", errorMsg)
                    return
                }
            }
            
            // Check if Pictures directory is writable
            if (!picturesDir.canWrite()) {
                val errorMsg = "Cannot write to Pictures directory: ${picturesDir.absolutePath}. Permission may be denied or storage may be full. On Android 10+, please use 'Select Folder' in Settings."
                Log.e("ScreenshotModule", errorMsg)
                promise.reject("WRITE_DENIED", errorMsg)
                return
            }
            
            // Create directory if it doesn't exist
            if (!smartShotDir.exists()) {
                try {
                    val created = smartShotDir.mkdirs()
                    if (created) {
                        // Verify it was actually created
                        if (smartShotDir.exists() && smartShotDir.isDirectory) {
                            Log.d("ScreenshotModule", "Successfully created directory: ${smartShotDir.absolutePath}")
                            promise.resolve(true)
                        } else {
                            val errorMsg = "Directory creation reported success but directory does not exist: ${smartShotDir.absolutePath}"
                            Log.e("ScreenshotModule", errorMsg)
                            promise.reject("VERIFICATION_FAILED", errorMsg)
                        }
                    } else {
                        val errorMsg = "mkdirs() returned false. Cannot create directory: ${smartShotDir.absolutePath}. Check permissions and storage space."
                        Log.e("ScreenshotModule", errorMsg)
                        promise.reject("CREATION_FAILED", errorMsg)
                    }
                } catch (createException: Exception) {
                    val errorMsg = "Exception during directory creation: ${createException.message}. Path: ${smartShotDir.absolutePath}"
                    Log.e("ScreenshotModule", errorMsg, createException)
                    promise.reject("CREATION_EXCEPTION", errorMsg)
                }
            } else {
                if (smartShotDir.isDirectory) {
                    Log.d("ScreenshotModule", "Directory already exists: ${smartShotDir.absolutePath}")
                    promise.resolve(true)
                } else {
                    val errorMsg = "Path exists but is not a directory: ${smartShotDir.absolutePath}"
                    Log.e("ScreenshotModule", errorMsg)
                    promise.reject("NOT_A_DIRECTORY", errorMsg)
                }
            }
        } catch (e: Exception) {
            val errorMsg = "Unexpected error creating directory: ${e.message}. Check permissions, storage space, and Android version."
            Log.e("ScreenshotModule", errorMsg, e)
            promise.reject("DIRECTORY_ERROR", errorMsg)
        }
    }
}
