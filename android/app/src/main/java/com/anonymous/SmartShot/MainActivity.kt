package com.anonymous.SmartShot
import expo.modules.splashscreen.SplashScreenManager

import android.app.Activity
import android.content.Intent
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.net.Uri
import android.os.Bundle
import android.Manifest
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  // Android 14+ screenshot detection callback
  @Volatile
  private var screenCaptureCallback: Activity.ScreenCaptureCallback? = null
  private val PERMISSION_REQUEST_CODE = 1001
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    // setTheme(R.style.AppTheme);
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a738c56c9a6119210cb55f0b613eb8b6af
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    super.onCreate(null)
    
    // Initialize Android 14+ screenshot detection callback
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { // Android 14 (API 34)
      screenCaptureCallback = object : Activity.ScreenCaptureCallback {
        override fun onScreenCaptured() {
          Log.d("MainActivity", "Screenshot detected via Android 14+ API")
          onScreenshotDetected()
        }
      }
    }
    
    // Request runtime permissions on app start
    requestPermissionsOnStart()
    try {
      val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
      if (!pm.isIgnoringBatteryOptimizations(packageName)) {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
          data = Uri.parse("package:$packageName")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(intent)
      }
    } catch (_: Exception) { }
  }
  
  override fun onStart() {
    super.onStart()
    // Register Android 14+ screenshot detection callback
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val callback = screenCaptureCallback
      if (callback != null) {
        try {
          registerScreenCaptureCallback(mainExecutor, callback)
          Log.d("MainActivity", "Registered Android 14+ screenshot detection callback")
        } catch (e: Exception) {
          Log.e("MainActivity", "Failed to register screen capture callback: ${e.message}")
        }
      }
    }
  }
  
  override fun onStop() {
    // Unregister Android 14+ screenshot detection callback
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val callback = screenCaptureCallback
      if (callback != null) {
        try {
          unregisterScreenCaptureCallback(callback)
          Log.d("MainActivity", "Unregistered Android 14+ screenshot detection callback")
        } catch (e: Exception) {
          Log.e("MainActivity", "Failed to unregister screen capture callback: ${e.message}")
        }
      }
    }
    super.onStop()
  }
  
  private fun onScreenshotDetected() {
    // Send event to React Native
    try {
      val mainApplication = application as? MainApplication
      val reactContext = mainApplication?.reactNativeHost?.reactInstanceManager?.currentReactContext
      if (reactContext != null) {
        val params = com.facebook.react.bridge.Arguments.createMap()
        params.putString("message", "Screenshot detected!")
        params.putString("uri", "")
        params.putDouble("timestamp", System.currentTimeMillis().toDouble())
        params.putBoolean("android14Api", true)
        
        reactContext
          .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("ScreenshotDetected", params)
        
        Log.d("MainActivity", "Screenshot event sent to React Native")
      } else {
        Log.d("MainActivity", "React Native context not available")
      }
    } catch (e: Exception) {
      Log.e("MainActivity", "Could not send event to React Native: ${e.message}")
    }
    
    // Notify ScreenshotDetectionService to handle background server communication
    try {
      val intent = Intent(this, ScreenshotDetectionService::class.java).apply {
        action = ScreenshotDetectionService.ACTION_SCREENSHOT_DETECTED
        putExtra(ScreenshotDetectionService.EXTRA_ANDROID14_API, true)
      }
      startService(intent)
    } catch (e: Exception) {
      Log.e("MainActivity", "Failed to notify service: ${e.message}")
    }
  }
  private fun requestPermissionsOnStart() {
    try {
      val permissions = mutableListOf<String>()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        if (!PermissionManager.hasStoragePermission(this)) {
          permissions.add(Manifest.permission.READ_MEDIA_IMAGES)
          permissions.add(Manifest.permission.READ_MEDIA_VIDEO)
        }
        if (!PermissionManager.hasNotificationPermission(this)) {
          permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
      } else {
        if (!PermissionManager.hasStoragePermission(this)) {
          permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
      }
      // Microphone for audio notes
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        permissions.add(Manifest.permission.RECORD_AUDIO)
      }

      if (permissions.isNotEmpty()) {
        ActivityCompat.requestPermissions(this, permissions.toTypedArray(), PERMISSION_REQUEST_CODE)
      }
    } catch (e: Exception) {
      Log.e("MainActivity", "Error requesting permissions: ${e.message}")
    }
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == PERMISSION_REQUEST_CODE) {
      var allGranted = true
      for (result in grantResults) {
        if (result != PackageManager.PERMISSION_GRANTED) {
          allGranted = false
          break
        }
      }
      if (allGranted) {
        try {
          val intent = Intent(this, ScreenshotDetectionService::class.java).apply { action = ScreenshotDetectionService.ACTION_START_SERVICE }
          startService(intent)
          Log.d("MainActivity", "All permissions granted; started background service")
        } catch (e: Exception) {
          Log.w("MainActivity", "Failed to start service after permission: ${e.message}")
        }
      } else {
        Log.w("MainActivity", "Some permissions were denied")
      }
    }
  }
  
  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    // Always set the new intent so React Native Linking receives deep links
    setIntent(intent)
    // Additional extras like "openScreenshotsTab" can still be read by JS via Linking.getInitialURL or AppState listeners
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
