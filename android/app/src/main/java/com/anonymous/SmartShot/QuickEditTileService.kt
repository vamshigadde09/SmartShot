package com.anonymous.SmartShot

import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.util.Log

class QuickEditTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        qsTile?.state = Tile.STATE_ACTIVE
        qsTile?.updateTile()
    }

    override fun onClick() {
        super.onClick()
        try {
            // Start capture flow: request MediaProjection and capture one screenshot
            val capture = Intent(this, ScreenshotCaptureActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            startActivityAndCollapse(capture)
        } catch (e: Exception) {
            Log.e("QuickEditTile", "Failed to handle tile click: ${e.message}")
        }
    }
}


