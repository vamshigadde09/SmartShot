package com.anonymous.SmartShot

import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import androidx.annotation.RequiresApi
import androidx.core.graphics.createBitmap
import java.io.OutputStream
import java.nio.ByteBuffer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ScreenshotCaptureActivity : Activity() {
  companion object {
    private const val REQ_MEDIA_PROJECTION = 6001
  }

  private var mediaProjection: MediaProjection? = null
  private var imageReader: ImageReader? = null
  private var virtualDisplay: VirtualDisplay? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      val mgr = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      startActivityForResult(mgr.createScreenCaptureIntent(), REQ_MEDIA_PROJECTION)
    } catch (e: Exception) {
      Log.e("ScreenshotCapture", "Failed to start projection intent: ${e.message}")
      finish()
    }
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != REQ_MEDIA_PROJECTION) {
      finish()
      return
    }

    if (resultCode != RESULT_OK || data == null) {
      // User canceled
      finish()
      return
    }

    try {
      val mgr = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      mediaProjection = mgr.getMediaProjection(resultCode, data)

      val metrics = DisplayMetrics()
      val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val display = display
        display?.getRealMetrics(metrics)
      } else {
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(metrics)
      }
      val width = metrics.widthPixels
      val height = metrics.heightPixels
      val density = metrics.densityDpi

      imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 1)
      virtualDisplay = mediaProjection?.createVirtualDisplay(
        "smartshot_capture",
        width,
        height,
        density,
        DisplayManager.VIRTUAL_DISPLAY_FLAG_OWN_CONTENT_ONLY or DisplayManager.VIRTUAL_DISPLAY_FLAG_PUBLIC,
        imageReader?.surface,
        null,
        null
      )

      imageReader?.setOnImageAvailableListener({ reader ->
        try {
          reader.setOnImageAvailableListener(null, null)
          val image = reader.acquireLatestImage()
          if (image != null) {
            val plane = image.planes[0]
            val pixelStride = plane.pixelStride
            val rowStride = plane.rowStride
            val rowPadding = rowStride - pixelStride * width
            val buffer: ByteBuffer = plane.buffer
            val bitmap = createBitmap(width + rowPadding / pixelStride, height)
            bitmap.copyPixelsFromBuffer(buffer)
            val cropped = Bitmap.createBitmap(bitmap, 0, 0, width, height)
            image.close()

            val uri = saveBitmapToMediaStore(cropped)
            cleanup()
            openEditor(uri)
          } else {
            cleanup()
            finish()
          }
        } catch (e: Exception) {
          Log.e("ScreenshotCapture", "Capture error: ${e.message}")
          cleanup()
          finish()
        }
      }, null)
    } catch (e: Exception) {
      Log.e("ScreenshotCapture", "Projection setup failed: ${e.message}")
      cleanup()
      finish()
    }
  }

  private fun saveBitmapToMediaStore(bitmap: Bitmap): Uri? {
    return try {
      val name = "SmartShot_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date()) + ".png"
      val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, name)
        put(MediaStore.Images.Media.MIME_TYPE, "image/png")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/SmartShot")
          put(MediaStore.Images.Media.IS_PENDING, 1)
        }
      }
      val resolver = contentResolver
      val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
      if (uri != null) {
        val out: OutputStream? = resolver.openOutputStream(uri)
        if (out != null) {
          out.use { stream ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
          }
        } else {
          Log.e("ScreenshotCapture", "OpenOutputStream returned null")
          return null
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          values.clear()
          values.put(MediaStore.Images.Media.IS_PENDING, 0)
          resolver.update(uri, values, null, null)
        }
      }
      uri
    } catch (e: Exception) {
      Log.e("ScreenshotCapture", "Save failed: ${e.message}")
      null
    }
  }

  private fun openEditor(uri: Uri?) {
    try {
      val deepLink = Uri.parse("smartshot://edit-screenshot?screenshotUri=" + Uri.encode(uri?.toString() ?: ""))
      val intent = Intent(Intent.ACTION_VIEW, deepLink).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      startActivity(intent)
    } catch (_: Exception) { }
    finish()
  }

  private fun cleanup() {
    try { virtualDisplay?.release() } catch (_: Exception) {}
    try { imageReader?.close() } catch (_: Exception) {}
    try { mediaProjection?.stop() } catch (_: Exception) {}
  }
}


