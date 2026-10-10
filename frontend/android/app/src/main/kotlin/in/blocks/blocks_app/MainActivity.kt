package `in`.blocks.blocks_app

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // Gives the reel editor a picture of a video the person chose, so the timeline shows
        // their footage instead of a blank tile. Any failure answers "no picture" and the app
        // falls back to a plain tile; nothing here can stop a reel from being made.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "in.blocks/video_frame")
            .setMethodCallHandler { call, result ->
                if (call.method != "frame") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                val path = call.argument<String>("path")
                val out = call.argument<String>("out")
                val atMs = (call.argument<Number>("atMs") ?: 0).toLong()
                if (path == null || out == null) {
                    result.success(null)
                    return@setMethodCallHandler
                }
                Thread {
                    var answer: String? = null
                    val retriever = MediaMetadataRetriever()
                    try {
                        retriever.setDataSource(path)
                        val frame = retriever.getFrameAtTime(
                            atMs * 1000L,
                            MediaMetadataRetriever.OPTION_CLOSEST_SYNC,
                        )
                        if (frame != null) {
                            // Small is enough for a timeline tile and keeps memory low.
                            val longest = 540f
                            val scale = longest / maxOf(frame.width, frame.height)
                            val picture = if (scale < 1f) {
                                Bitmap.createScaledBitmap(
                                    frame,
                                    maxOf(1, (frame.width * scale).toInt()),
                                    maxOf(1, (frame.height * scale).toInt()),
                                    true,
                                )
                            } else {
                                frame
                            }
                            File(out).parentFile?.mkdirs()
                            FileOutputStream(out).use { stream ->
                                picture.compress(Bitmap.CompressFormat.JPEG, 82, stream)
                            }
                            answer = out
                        }
                    } catch (_: Exception) {
                        answer = null
                    } finally {
                        try {
                            retriever.release()
                        } catch (_: Exception) {
                        }
                    }
                    runOnUiThread { result.success(answer) }
                }.start()
            }
    }
}
