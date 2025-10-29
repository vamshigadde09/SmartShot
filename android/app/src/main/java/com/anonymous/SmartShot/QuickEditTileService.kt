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
            val latest = getLatestScreenshot()
            if (latest != null) {
                val deepLink = Uri.parse("smartshot://edit-screenshot?screenshotUri=" + Uri.encode(latest.toString()))
                val intent = Intent(Intent.ACTION_VIEW, deepLink).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                startActivityAndCollapse(intent)
            } else {
                // If none found, open app main activity
                val fallback = Intent(this, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    putExtra("openScreenshotsTab", true)
                }
                startActivityAndCollapse(fallback)
            }
        } catch (e: Exception) {
            Log.e("QuickEditTile", "Failed to handle tile click: ${e.message}")
        }
    }

    private fun getLatestScreenshot(): Uri? {
        val images = MediaStore.Images.Media.EXTERNAL_CONTENT_URI

        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                MediaStore.Images.Media.RELATIVE_PATH else MediaStore.Images.Media.DATA,
            MediaStore.Images.Media.DATE_ADDED
        )

        val selection = (
            "LOWER(" + MediaStore.Images.Media.DISPLAY_NAME + ") LIKE ? OR " +
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                "LOWER(" + MediaStore.Images.Media.RELATIVE_PATH + ") LIKE ?"
            else
                "LOWER(" + MediaStore.Images.Media.DATA + ") LIKE ?")
        )
        val like = "%screenshot%"
        val selectionArgs = arrayOf(like, like)

        val sortOrder = MediaStore.Images.Media.DATE_ADDED + " DESC"

        var cursor: Cursor? = null
        return try {
            cursor = contentResolver.query(images, projection, selection, selectionArgs, sortOrder)
            if (cursor != null && cursor.moveToFirst()) {
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
                val id = cursor.getLong(idCol)
                Uri.withAppendedPath(images, id.toString())
            } else null
        } catch (e: Exception) {
            Log.e("QuickEditTile", "Query error: ${e.message}")
            null
        } finally {
            cursor?.close()
        }
    }
}


