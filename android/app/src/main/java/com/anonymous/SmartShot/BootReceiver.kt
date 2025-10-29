package com.anonymous.SmartShot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "BootReceiver"
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        val receivedAction = intent.action
        if (receivedAction == Intent.ACTION_BOOT_COMPLETED ||
            receivedAction == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            receivedAction == Intent.ACTION_REBOOT ||
            receivedAction == Intent.ACTION_MY_PACKAGE_REPLACED) {
            Log.d(TAG, "Boot/replace event: $receivedAction, starting screenshot detection service")
            val serviceIntent = Intent(context, ScreenshotDetectionService::class.java).apply {
                this.action = ScreenshotDetectionService.ACTION_START_SERVICE
            }
            ContextCompat.startForegroundService(context, serviceIntent)
        }
    }
}
