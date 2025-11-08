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
import androidx.work.*

class ScreenshotDetectionService : Service() {
    
    private var contentObserver: ContentObserver? = null
    private val CHANNEL_ID = "screenshot_detection_service"
    private val SCREENSHOT_NOTIFICATION_CHANNEL_ID = "screenshot_notification"
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
        const val ACTION_SCREENSHOT_DETECTED = "SCREENSHOT_DETECTED"
        const val EXTRA_ANDROID14_API = "android14_api"
    }
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        createNotificationChannel()
        createScreenshotNotificationChannel()
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_SERVICE -> {
                Log.d(TAG, "Starting screenshot detection service")
                acquireShortWakeLock()
                
                // Start as foreground service to keep it running in background
                startForegroundService()
                
                // For Android 14+, Activity.ScreenCaptureCallback only works when activity is visible
                // For older versions, use ContentObserver which works in background
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    startScreenshotDetection()
                } else {
                    Log.d(TAG, "Android 14+ detected - Activity.ScreenCaptureCallback works when app is open, " +
                            "ContentObserver will work in background for older detection method")
                    // Still register ContentObserver for Android 14+ as fallback when app is closed
                    // Note: Android 14+ API only works when activity is visible
                    startScreenshotDetection()
                }
            }
            ACTION_SCREENSHOT_DETECTED -> {
                Log.d(TAG, "Screenshot detected via Android 14+ API")
                val isAndroid14Api = intent.getBooleanExtra(EXTRA_ANDROID14_API, false)
                onScreenshotDetected(null, isAndroid14Api)
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
                startForegroundService()
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    startScreenshotDetection()
                } else {
                    // Register ContentObserver for Android 14+ as fallback
                    startScreenshotDetection()
                }
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
    
  private fun onScreenshotDetected(uri: Uri?, isAndroid14Api: Boolean = false) {
    Log.d(TAG, "Processing screenshot detection - Android 14 API: $isAndroid14Api, URI: $uri")
    
    // Show notification with Open, Edit, and Dismiss actions
    showScreenshotNotification(uri)
    
    // Send event to React Native
    sendEventToReactNative(uri, isAndroid14Api)
    
    // Send to background server using WorkManager
    sendToBackgroundServer(uri, isAndroid14Api)
  }
  
  private fun sendToBackgroundServer(uri: Uri?, isAndroid14Api: Boolean) {
    try {
      // Prepare data for WorkManager
      val inputData = workDataOf(
        ScreenshotUploadWorker.KEY_TIMESTAMP to System.currentTimeMillis(),
        ScreenshotUploadWorker.KEY_URI to (uri?.toString() ?: ""),
        ScreenshotUploadWorker.KEY_ANDROID14_API to isAndroid14Api,
        ScreenshotUploadWorker.KEY_PACKAGE_NAME to packageName
      )
      
      // Create WorkManager request with constraints
      val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED) // Requires network connection
        .setRequiresBatteryNotLow(false) // Don't require battery to not be low
        .build()
      
      val workRequest = OneTimeWorkRequestBuilder<ScreenshotUploadWorker>()
        .setInputData(inputData)
        .setConstraints(constraints)
        .setBackoffCriteria(
          BackoffPolicy.EXPONENTIAL,
          WorkRequest.MIN_BACKOFF_MILLIS,
          java.util.concurrent.TimeUnit.MILLISECONDS
        )
        .addTag("screenshot-upload") // Tag for easy identification
        .build()
      
      // Enqueue the work request
      WorkManager.getInstance(this).enqueue(workRequest)
      
      Log.d(TAG, "Enqueued screenshot upload work request")
      
    } catch (e: Exception) {
      Log.e(TAG, "Failed to enqueue screenshot upload work: ${e.message}", e)
    }
  }
    
  private fun showScreenshotNotification(uri: Uri?) {
    try {
      val notificationId = screenshotNotificationCounter.incrementAndGet()
      
      // Open image action - opens the screenshot in gallery
      val openImageIntent = Intent(Intent.ACTION_VIEW).apply {
        if (uri != null) {
          setDataAndType(uri, "image/*")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
      }
      val openImagePending = PendingIntent.getActivity(
        this, 101, openImageIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      
      // Edit action - opens edit screen in app via deep link
      val deepLink = Uri.parse("smartshot:///edit-screenshot?screenshotUri=" + Uri.encode(uri?.toString() ?: ""))
      val editIntent = Intent(Intent.ACTION_VIEW, deepLink).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        uri?.let { setClipData(ClipData.newRawUri("screenshot", it)) }
      }
      val editPending = PendingIntent.getActivity(
        this, 102, editIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      
      // Dismiss action - dismisses the notification
      val dismissIntent = Intent(this, ScreenshotDetectionService::class.java).apply {
        action = ACTION_DISMISS_NOTIFICATION
        putExtra(EXTRA_NOTIFICATION_ID, notificationId)
      }
      val dismissPending = PendingIntent.getService(
        this, 103, dismissIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      
      // Open app action - opens the app (default tap action)
      val openAppIntent = Intent(this, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra("openScreenshotsTab", true)
      }
      val openAppPending = PendingIntent.getActivity(
        this, 100, openAppIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      
      // Create notification with actions - actions should be visible as buttons
      val notification = NotificationCompat.Builder(this, SCREENSHOT_NOTIFICATION_CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_menu_camera)
        .setContentTitle("Screenshot captured 📸")
        .setContentText("Tap for options")
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_MESSAGE)
        .setAutoCancel(true)
        .setContentIntent(openAppPending)
        .setDefaults(NotificationCompat.DEFAULT_ALL)
        .setShowWhen(true)
        .setWhen(System.currentTimeMillis())
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        // Add actions - these will appear as buttons below the notification
        .addAction(android.R.drawable.ic_menu_view, "Open", openImagePending)
        .addAction(android.R.drawable.ic_menu_edit, "Edit", editPending)
        .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Dismiss", dismissPending)
        .setStyle(NotificationCompat.BigTextStyle()
          .bigText("A screenshot was detected. Use the buttons below to open it in gallery, edit it in the app, or dismiss this notification."))
        .build()
      
      val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      notificationManager.notify(notificationId, notification)
      
      Log.d(TAG, "Screenshot notification shown with ID: $notificationId")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to show screenshot notification: ${e.message}", e)
    }
  }
    
    private fun sendEventToReactNative(uri: Uri?, isAndroid14Api: Boolean = false) {
        // Try to get React Native context and send event
        try {
            val mainApplication = application as? MainApplication
            val reactContext = mainApplication?.reactNativeHost?.reactInstanceManager?.currentReactContext
            if (reactContext != null) {
                val params = Arguments.createMap()
                params.putString("message", "Screenshot detected!")
                params.putString("uri", uri?.toString() ?: "")
                params.putDouble("timestamp", System.currentTimeMillis().toDouble())
                params.putBoolean("android14Api", isAndroid14Api)
                
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("ScreenshotDetected", params)
                
                Log.d(TAG, "Event sent to React Native (Android 14 API: $isAndroid14Api)")
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
      notificationManager.deleteNotificationChannel(CHANNEL_ID)
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Screenshot Detection Service",
        NotificationManager.IMPORTANCE_LOW // Low importance for persistent foreground service
      ).apply {
        description = "Background service for detecting screenshots"
        setShowBadge(false)
        enableVibration(false)
        enableLights(false)
        setSound(null, null) // Silent
        lockscreenVisibility = Notification.VISIBILITY_SECRET // Don't show on lock screen
      }
      notificationManager.createNotificationChannel(channel)
      Log.d(TAG, "Notification channel created for foreground service")
    }
  }
  
  private fun createScreenshotNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      notificationManager.deleteNotificationChannel(SCREENSHOT_NOTIFICATION_CHANNEL_ID)
      val channel = NotificationChannel(
        SCREENSHOT_NOTIFICATION_CHANNEL_ID,
        "Screenshot Notifications",
        NotificationManager.IMPORTANCE_HIGH // High importance for screenshot notifications
      ).apply {
        description = "Notifications when screenshots are detected"
        setShowBadge(true)
        enableVibration(true)
        enableLights(true)
        setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI, null)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }
      notificationManager.createNotificationChannel(channel)
      Log.d(TAG, "Screenshot notification channel created")
    }
  }
    
  private fun startForegroundService() {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        // Create a low-priority, silent notification for foreground service
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
          .setSmallIcon(android.R.drawable.ic_menu_camera)
          .setContentTitle("SmartShot is running")
          .setContentText("Monitoring for screenshots in the background")
          .setPriority(NotificationCompat.PRIORITY_LOW)
          .setOngoing(true)
          .setAutoCancel(false)
          .setSilent(true)
          .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
          .build()
        startForeground(FOREGROUND_NOTIFICATION_ID, notification)
        Log.d(TAG, "Foreground service started")
      }
    } catch (e: Exception) {
      Log.e(TAG, "Failed to start foreground service: ${e.message}", e)
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
    // scheduleRestart()
    }

  override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.d(TAG, "Task removed by user; scheduling service restart")
    // scheduleRestart()
    }

  private fun scheduleRestart() {
    // try {
    //   val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
    //   val restartIntent = Intent(this, ServiceRestarter::class.java).apply {
    //     action = ACTION_RESTART_SERVICE
    //   }
    //   val pending = PendingIntent.getBroadcast(
    //     this,
    //     2001,
    //     restartIntent,
    //     PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    //   )
    //   val triggerAt = System.currentTimeMillis() + 2000L
    //   if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
    //     alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
    //   } else {
    //     alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pending)
    //   }
    // } catch (e: Exception) {
    //   Log.e(TAG, "Failed to schedule restart: ${e.message}")
    // }
  }
}
