package io.github.moh23rd.sixfold;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Saves a finished result card into the phone's photo gallery.
 *
 * <p>The PNG arrives in chunks. A 1080px card is a little over 100 KB, but a
 * bridge message that gets cut short still decodes to a valid but short PNG:
 * the gallery indexes it, then drops the row on its next scan, which looks like
 * a photo that appears for a second and disappears. Chunks plus a byte-count
 * check before the row is published make that impossible.
 */
@CapacitorPlugin(
    name = "GallerySave",
    permissions = {
        @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class GallerySavePlugin extends Plugin {

    private static final String FOLDER = "Sixfold";

    /** One in-flight card: where its bytes go and how many have arrived. */
    private static final class Sink {
        final String name;
        final long stamp;
        final ContentResolver resolver;
        final Uri uri;           // Android 10+: the pending MediaStore row
        final File file;         // Android 9 and older: the real target file
        final OutputStream out;
        long bytes;

        Sink(String name, long stamp, ContentResolver resolver, Uri uri, File file, OutputStream out) {
            this.name = name;
            this.stamp = stamp;
            this.resolver = resolver;
            this.uri = uri;
            this.file = file;
            this.out = out;
        }
    }

    private final Map<String, Sink> sinks = new ConcurrentHashMap<>();

    /* ---------- single call (kept for small payloads and older JS) ---------- */

    @PluginMethod
    public void save(PluginCall call) {
        if (needsPermission()) {
            requestPermissionForAlias("storage", call, "writeAfterPermission");
            return;
        }
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("missing image data");
            return;
        }
        Sink sink = null;
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            sink = open(call.getString("name", "sixfold-result.png"));
            sink.bytes = bytes.length;
            sink.out.write(bytes);
            call.resolve(publish(sink));
        } catch (Exception err) {
            discard(sink);
            call.reject("could not save image", err);
        }
    }

    @PermissionCallback
    private void writeAfterPermission(PluginCall call) {
        if (needsPermission()) {
            call.reject("storage permission denied");
            return;
        }
        save(call);
    }

    /* ---------- chunked session ---------- */

    @PluginMethod
    public void begin(PluginCall call) {
        if (needsPermission()) {
            requestPermissionForAlias("storage", call, "beginAfterPermission");
            return;
        }
        try {
            Sink sink = open(call.getString("name", "sixfold-result.png"));
            String id = UUID.randomUUID().toString();
            sinks.put(id, sink);
            JSObject result = new JSObject();
            result.put("id", id);
            call.resolve(result);
        } catch (Exception err) {
            call.reject("could not start image", err);
        }
    }

    @PermissionCallback
    private void beginAfterPermission(PluginCall call) {
        if (needsPermission()) {
            call.reject("storage permission denied");
            return;
        }
        begin(call);
    }

    @PluginMethod
    public void write(PluginCall call) {
        String id = call.getString("id");
        Sink sink = id == null ? null : sinks.get(id);
        if (sink == null) {
            call.reject("unknown image");
            return;
        }
        String data = call.getString("data");
        if (data == null) {
            call.reject("missing image data");
            return;
        }
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            synchronized (sink) {
                sink.out.write(bytes);
                sink.bytes += bytes.length;
            }
            JSObject result = new JSObject();
            result.put("received", sink.bytes);
            call.resolve(result);
        } catch (Exception err) {
            sinks.remove(id);
            discard(sink);
            call.reject("could not write image", err);
        }
    }

    @PluginMethod
    public void end(PluginCall call) {
        String id = call.getString("id");
        Sink sink = id == null ? null : sinks.remove(id);
        if (sink == null) {
            call.reject("unknown image");
            return;
        }
        try {
            call.resolve(publish(sink));
        } catch (Exception err) {
            discard(sink);
            call.reject("could not save image", err);
        }
    }

    @PluginMethod
    public void abort(PluginCall call) {
        String id = call.getString("id");
        Sink sink = id == null ? null : sinks.remove(id);
        if (sink != null) discard(sink);
        call.resolve();
    }

    /* ---------- internals ---------- */

    private boolean needsPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            && getPermissionState("storage") != PermissionState.GRANTED;
    }

    private Sink open(String rawName) throws IOException {
        String name = rawName == null || rawName.isEmpty() ? "sixfold-result.png" : rawName;
        if (!name.toLowerCase().endsWith(".png")) name = name + ".png";

        ContentResolver resolver = getContext().getContentResolver();
        long now = System.currentTimeMillis();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // A second pending row with the same display name can replace the
            // first one, which is how a saved card can vanish a moment after
            // the gallery shows it. Give every save its own name.
            name = uniqueName(resolver, name);
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
            values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + FOLDER);
            values.put(MediaStore.Images.Media.IS_PENDING, 1);
            // Stamped up front, in the units MediaStore expects (taken is ms,
            // added/modified are seconds), so the gallery files the card under
            // the moment it was saved instead of an unknown date.
            values.put(MediaStore.Images.Media.DATE_TAKEN, now);
            values.put(MediaStore.Images.Media.DATE_ADDED, now / 1000L);
            values.put(MediaStore.Images.Media.DATE_MODIFIED, now / 1000L);
            Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("could not create image");
            OutputStream out = resolver.openOutputStream(uri);
            if (out == null) throw new IllegalStateException("could not open image");
            return new Sink(name, now, resolver, uri, null, out);
        }

        // Android 9 and older have no RELATIVE_PATH and reject a row without a
        // file path, so the bytes go to a real file first.
        File target = uniqueFile(name);
        OutputStream out = new FileOutputStream(target);
        return new Sink(target.getName(), now, resolver, null, target, out);
    }

    /** Close, verify, and only then let the gallery see the picture. */
    private JSObject publish(Sink sink) throws IOException, IllegalStateException {
        sink.out.flush();
        sink.out.close();
        if (sink.bytes <= 0) throw new IOException("empty image");

        if (sink.uri != null) {
            try (AssetFileDescriptor fd = sink.resolver.openAssetFileDescriptor(sink.uri, "r")) {
                long stored = fd == null ? -1 : fd.getLength();
                if (stored >= 0 && stored != sink.bytes) {
                    throw new IOException("short write: " + stored + " of " + sink.bytes);
                }
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.Images.Media.IS_PENDING, 0);
            int updated = sink.resolver.update(sink.uri, done, null, null);
            if (updated < 1) throw new IllegalStateException("could not publish image");
        } else if (sink.file != null) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DATA, sink.file.getAbsolutePath());
            values.put(MediaStore.Images.Media.DISPLAY_NAME, sink.file.getName());
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
            values.put(MediaStore.Images.Media.DATE_TAKEN, sink.stamp);
            values.put(MediaStore.Images.Media.DATE_ADDED, sink.stamp / 1000L);
            values.put(MediaStore.Images.Media.DATE_MODIFIED, sink.stamp / 1000L);
            Uri uri = sink.resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("could not index image");
            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            return result;
        }

        JSObject result = new JSObject();
        result.put("uri", sink.uri.toString());
        return result;
    }

    private void discard(Sink sink) {
        if (sink == null) return;
        try { sink.out.close(); } catch (Exception ignored) {}
        if (sink.uri != null) {
            try { sink.resolver.delete(sink.uri, null, null); } catch (Exception ignored) {}
        }
        if (sink.file != null) {
            try { if (sink.file.exists()) sink.file.delete(); } catch (Exception ignored) {}
        }
    }

    private boolean exists(ContentResolver resolver, String name) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false;
        String selection = MediaStore.MediaColumns.DISPLAY_NAME + "=? AND "
            + MediaStore.MediaColumns.RELATIVE_PATH + "=?";
        String path = Environment.DIRECTORY_PICTURES + "/" + FOLDER + "/";
        try (Cursor cursor = resolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            new String[] { MediaStore.MediaColumns._ID },
            selection,
            new String[] { name, path },
            null
        )) {
            return cursor != null && cursor.moveToFirst();
        } catch (Exception err) {
            return false;
        }
    }

    private String uniqueName(ContentResolver resolver, String name) {
        String base = name.substring(0, name.length() - 4);
        String candidate = name;
        int index = 1;
        while (exists(resolver, candidate)) {
            candidate = base + "-" + index + ".png";
            index += 1;
            if (index > 999) break;
        }
        return candidate;
    }

    /** Never overwrite an earlier card: sixfold-merge.png, sixfold-merge-1.png, ... */
    private File uniqueFile(String name) throws IOException {
        File dir = new File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
            FOLDER
        );
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("could not create folder");

        String base = name.substring(0, name.length() - 4);
        File target = new File(dir, name);
        int index = 1;
        while (target.exists()) {
            target = new File(dir, base + "-" + index + ".png");
            index += 1;
            if (index > 999) throw new IOException("could not name image");
        }
        return target;
    }
}
