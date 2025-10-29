package com.anonymous.SmartShot

import android.app.*
import android.content.Context
import android.content.Intent
import android.app.AlarmManager
import android.app.PendingIntent
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
import androidx.core.app.NotificationCompat
import android.content.ClipData
import java.util.concurrent.atomic.AtomicInteger
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class ScreenshotDetectionService : Service() {
    
    private var contentObserver: ContentObserver? = null
    private val CHANNEL_ID = "screenshot_detection_service"
    private val FOREGROUND_NOTIFICATION_ID = 1001
    private val screenshotNotificationCounter = AtomicInteger(2000)
    private var reactContext: com.facebook.react.bridge.ReactApplicationContext? = null
    
    companion object {
        private const val TAG = "ScreenshotDetectionService"
        const val ACTION_START_SERVICE = "START_SERVICE"
        const val ACTION_STOP_SERVICE = "STOP_SERVICE"
        const val ACTION_DISMISS_NOTIFICATION = "DISMISS_NOTIFICATION"
        const val EXTRA_NOTIFICATION_ID = "extra_notification_id"
        const val ACTION_RESTART_SERVICE = "RESTART_SERVICE"
    }
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        createNotificationChannel()
        startForegroundService()
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_SERVICE -> {
                Log.d(TAG, "Starting screenshot detection service")
                acquireShortWakeLock()
                startScreenshotDetection()
            }
            ACTION_STOP_SERVICE -> {
                Log.d(TAG, "Stopping screenshot detection service")
                stopSelf()
            }
            ACTION_DISMISS_NOTIFICATION -> {
                Log.d(TAG, "Dismiss notification action received")
                val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                val id = intent.getIntExtra(EXTRA_NOTIFICATION_ID, -1)
                if (id != -1) notificationManager.cancel(id)
            }
            else -> {
                // Service was restarted by system
                Log.d(TAG, "Service restarted by system")
                acquireShortWakeLock()
                startScreenshotDetection()
            }
        }
        return START_STICKY
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    private fun startScreenshotDetection() {
        try {
            if (contentObserver == null) {
                contentObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
                    override fun onChange(selfChange: Boolean, uri: Uri?) {
                        super.onChange(selfChange, uri)
                        Log.d(TAG, "Content changed: $uri, selfChange: $selfChange")
                        
                        try {
                            if (isScreenshot(uri)) {
                                Log.d(TAG, "Screenshot detected in background!")
                                onScreenshotDetected(uri)
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Error in screenshot detection: ${e.message}")
                        }
                    }
                }
                
                val contentResolver = contentResolver
                
                // Register for both external and internal storage
                contentResolver.registerContentObserver(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    true,
                    contentObserver!!
                )
                
                contentResolver.registerContentObserver(
                    MediaStore.Images.Media.INTERNAL_CONTENT_URI,
                    true,
                    contentObserver!!
                )
                
                Log.d(TAG, "ContentObserver registered in background service")
            } else {
                Log.d(TAG, "ContentObserver already registered")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start screenshot detection: ${e.message}")
            // Try to restart after a delay
            Handler(Looper.getMainLooper()).postDelayed({
                startScreenshotDetection()
            }, 5000)
        }
    }
    
    private fun isScreenshot(uri: Uri?): Boolean {
        if (uri == null) {
            Log.d(TAG, "URI is null")
            return false
        }
        
        Log.d(TAG, "Checking URI: $uri")
        
        val projection = arrayOf(
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.DATA,
            MediaStore.Images.Media.DATE_ADDED,
            MediaStore.Images.Media.MIME_TYPE
        )
        
        val cursor = contentResolver.query(uri, projection, null, null, null)
        cursor?.use {
            if (it.moveToFirst()) {
                val displayName = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME))
                val data = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATA))
                val dateAdded = it.getLong(it.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED))
                val mimeType = it.getString(it.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE))
                
                Log.d(TAG, "File: $displayName, Path: $data, MIME: $mimeType")
                
                // Check if it's a recent file (within last 10 seconds)
                val currentTime = System.currentTimeMillis() / 1000
                val isRecent = (currentTime - dateAdded) < 10
                
                // More comprehensive screenshot detection
                val isScreenshot = isRecent && (
                    // Common screenshot naming patterns
                    displayName.startsWith("Screenshot_") ||
                    displayName.startsWith("screenshot_") ||
                    displayName.startsWith("Screen_") ||
                    displayName.startsWith("screen_") ||
                    displayName.startsWith("IMG_") ||
                    displayName.startsWith("img_") ||
                    displayName.contains("Screenshot") ||
                    displayName.contains("screenshot") ||
                    displayName.contains("Screen") ||
                    displayName.contains("screen") ||
                    // Common screenshot directories
                    data.contains("/Screenshots/") ||
                    data.contains("/Pictures/Screenshots/") ||
                    data.contains("/DCIM/Screenshots/") ||
                    data.contains("/Screenshots") ||
                    data.contains("/screenshots") ||
                    data.contains("/Screen") ||
                    data.contains("/screen") ||
                    // Some devices use different patterns
                    data.contains("Screenshot") ||
                    data.contains("screenshot") ||
                    // Check if it's a PNG (screenshots are often PNG)
                    (mimeType == "image/png" && isRecent)
                )
                
                Log.d(TAG, "Is screenshot: $isScreenshot, Is recent: $isRecent, Time diff: ${currentTime - dateAdded}")
                return isScreenshot
            }
        }
        return false
    }
    
    private fun onScreenshotDetected(uri: Uri?) {
        // Show notification
        showScreenshotNotification(uri)
        
        // Try to send event to React Native if app is running
        sendEventToReactNative(uri)
    }
    
    private fun showScreenshotNotification(uri: Uri?) {
        val notificationId = screenshotNotificationCounter.incrementAndGet()
        // Open action: view the captured image with external viewer
        val openImageIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "image/*")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val openImagePending = PendingIntent.getActivity(
            this, 101, openImageIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Edit action: deep link into app's edit screen
        val deepLink = Uri.parse("smartshot://edit-screenshot?screenshotUri=" + Uri.encode(uri?.toString() ?: ""))
        val editIntent = Intent(Intent.ACTION_VIEW, deepLink).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            // Attach the URI as ClipData so read permission is actually granted
            uri?.let { setClipData(ClipData.newRawUri("screenshot", it)) }
        }
        val editPending = PendingIntent.getActivity(
            this, 102, editIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Dismiss action: cancel notification via service action
        val dismissIntent = Intent(this, ScreenshotDetectionService::class.java).apply {
            action = ACTION_DISMISS_NOTIFICATION
            putExtra(EXTRA_NOTIFICATION_ID, notificationId)
        }
        val dismissPending = PendingIntent.getService(
            this, 103, dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Tapping the body: open app gallery
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("openScreenshotsTab", true)
        }
        val openAppPending = PendingIntent.getActivity(
            this, 100, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentTitle("Screenshot captured 📸")
            .setContentText("Open, edit, or dismiss")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(openAppPending)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .addAction(android.R.drawable.ic_menu_view, "Open", openImagePending)
            .addAction(android.R.drawable.ic_menu_edit, "Edit", editPending)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Dismiss", dismissPending)
            .build()

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(notificationId, notification)

        Log.d(TAG, "Screenshot notification shown with actions")
    }
    
    private fun sendEventToReactNative(uri: Uri?) {
        // Try to get React Native context and send event
        try {
            val mainApplication = application as? MainApplication
            val reactContext = mainApplication?.reactNativeHost?.reactInstanceManager?.currentReactContext
            if (reactContext != null) {
                val params = Arguments.createMap()
                params.putString("message", "Screenshot detected!")
                params.putString("uri", uri?.toString() ?: "")
                params.putDouble("timestamp", System.currentTimeMillis().toDouble())
                
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("ScreenshotDetected", params)
                
                Log.d(TAG, "Event sent to React Native")
            } else {
                Log.d(TAG, "React Native context not available")
            }
        } catch (e: Exception) {
            Log.d(TAG, "Could not send event to React Native: ${e.message}")
        }
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
            // Delete existing channel if it exists to recreate with new settings
            notificationManager.deleteNotificationChannel(CHANNEL_ID)
            
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Screenshot Detection Service",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Background service for detecting screenshots"
                setShowBadge(true)
                enableVibration(true)
                enableLights(true)
                setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI, null) // Use system default sound
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            
            notificationManager.createNotificationChannel(channel)
            Log.d(TAG, "Notification channel created with HIGH importance and sound")
        }
    }
    
    private fun startForegroundService() {
        try {
            val notification = NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_camera)
                .setContentTitle("SmartShot is running")
                .setContentText("Monitoring for screenshots in the background")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setOngoing(true)
                .setAutoCancel(false)
                .setSilent(true) // Silent for the persistent notification
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build()
            
            startForeground(FOREGROUND_NOTIFICATION_ID, notification)
            Log.d(TAG, "Foreground service started successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start foreground service: ${e.message}")
        }
    }

    private fun acquireShortWakeLock() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            @Suppress("DEPRECATION")
            val wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SmartShot::WakeLock")
            wl.acquire(3000)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire wake lock: ${e.message}")
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service destroyed")
        contentObserver?.let { observer ->
            contentResolver.unregisterContentObserver(observer)
            contentObserver = null
        }
        scheduleRestart()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.d(TAG, "Task removed by user; scheduling service restart")
        scheduleRestart()
    }

    private fun scheduleRestart() {
        try {
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val restartIntent = Intent(this, ServiceRestarter::class.java).apply {
                action = ACTION_RESTART_SERVICE
            }
            val pending = PendingIntent.getBroadcast(
                this,
                2001,
                restartIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val triggerAt = System.currentTimeMillis() + 2000L
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pending)
            }
            Log.d(TAG, "Restart scheduled in 2s")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule restart: ${e.message}")
        }
    }
}
