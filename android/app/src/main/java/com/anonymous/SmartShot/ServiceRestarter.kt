package com.anonymous.SmartShot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat

class ServiceRestarter : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        try {
            if (intent?.action == ScreenshotDetectionService.ACTION_RESTART_SERVICE) {
                Log.d("ServiceRestarter", "Restart action received; starting foreground service")
                val serviceIntent = Intent(context, ScreenshotDetectionService::class.java).apply {
                    action = ScreenshotDetectionService.ACTION_START_SERVICE
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ContextCompat.startForegroundService(context, serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            }
        } catch (e: Exception) {
            Log.e("ServiceRestarter", "Failed to restart service: ${e.message}")
        }
    }
}


