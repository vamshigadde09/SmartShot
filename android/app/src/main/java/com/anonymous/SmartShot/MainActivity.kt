package com.anonymous.SmartShot
import expo.modules.splashscreen.SplashScreenManager

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
  private fun requestPermissionsOnStart() {
    try {
      val permissions = mutableListOf<String>()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        if (!PermissionManager.hasStoragePermission(this)) {
          permissions.add(Manifest.permission.READ_MEDIA_IMAGES)
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
    // Handle intent to open screenshots tab
    if (intent?.getBooleanExtra("openScreenshotsTab", false) == true) {
      // This will be handled by React Native navigation
      setIntent(intent)
    }
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
