package expo.modules.savetodownloads

import android.content.ContentValues
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

// Copies a file from the app's own storage into the phone's public
// Downloads folder via MediaStore — no permission needed on Android 10+
// (the app's minSdk is 30), and no folder picker, which on Android 11+
// refuses the Downloads root anyway. If a file with the same name already
// exists, MediaStore picks a free name itself ("name (1).xlsx").
class SaveToDownloadsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SaveToDownloads")

    AsyncFunction("saveAsync") { sourceUri: String, fileName: String, mimeType: String ->
      val context = appContext.reactContext ?: throw CodedException("No Android context")
      val resolver = context.contentResolver
      val source = File(Uri.parse(sourceUri).path ?: throw CodedException("Bad source URI: $sourceUri"))

      val values = ContentValues().apply {
        put(MediaStore.Downloads.DISPLAY_NAME, fileName)
        put(MediaStore.Downloads.MIME_TYPE, mimeType)
        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        put(MediaStore.Downloads.IS_PENDING, 1)
      }
      val target = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        ?: throw CodedException("Couldn't create the file in Downloads")

      try {
        resolver.openOutputStream(target)?.use { out -> source.inputStream().use { it.copyTo(out) } }
          ?: throw CodedException("Couldn't open the file in Downloads")
        resolver.update(target, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
      } catch (e: Exception) {
        resolver.delete(target, null, null)
        throw e
      }

      // The name MediaStore actually used, in case it had to rename.
      resolver.query(target, arrayOf(MediaStore.Downloads.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else fileName
      } ?: fileName
    }
  }
}
