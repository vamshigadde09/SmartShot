package com.anonymous.SmartShot

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

object PermissionManager {
    
    private const val PERMISSION_REQUEST_CODE = 1001
    private const val TAG = "PermissionManager"
    
    fun hasStoragePermission(context: Context): Boolean {
        return try {
            val hasPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Android 13+ uses READ_MEDIA_IMAGES
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.READ_MEDIA_IMAGES
                ) == PackageManager.PERMISSION_GRANTED
            } else {
                // Android 12 and below use READ_EXTERNAL_STORAGE
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.READ_EXTERNAL_STORAGE
                ) == PackageManager.PERMISSION_GRANTED
            }
            Log.d(TAG, "Storage permission: $hasPermission")
            hasPermission
        } catch (e: Exception) {
            Log.e(TAG, "Error checking storage permission: ${e.message}")
            false
        }
    }
    
    fun hasNotificationPermission(context: Context): Boolean {
        return try {
            val hasPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
            } else {
                true // Notifications are granted by default on older versions
            }
            Log.d(TAG, "Notification permission: $hasPermission")
            hasPermission
        } catch (e: Exception) {
            Log.e(TAG, "Error checking notification permission: ${e.message}")
            true // Default to true for older versions
        }
    }
    
    fun requestPermissions(activity: Activity) {
        try {
            val permissions = mutableListOf<String>()
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                permissions.add(Manifest.permission.READ_MEDIA_IMAGES)
                permissions.add(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE)
            }
            
            ActivityCompat.requestPermissions(
                activity,
                permissions.toTypedArray(),
                PERMISSION_REQUEST_CODE
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error requesting permissions: ${e.message}")
        }
    }
    
    fun hasAllRequiredPermissions(context: Context): Boolean {
        return try {
            val hasStorage = hasStoragePermission(context)
            val hasNotification = hasNotificationPermission(context)
            val allGranted = hasStorage && hasNotification
            Log.d(TAG, "All permissions granted: $allGranted")
            allGranted
        } catch (e: Exception) {
            Log.e(TAG, "Error checking all permissions: ${e.message}")
            false
        }
    }
}
