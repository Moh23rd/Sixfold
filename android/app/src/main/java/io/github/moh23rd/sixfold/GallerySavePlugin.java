package io.github.moh23rd.sixfold;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.pm.PackageManager;
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

/** Saves a finished result card into the phone's photo gallery. */
@CapacitorPlugin(
    name = "GallerySave",
    permissions = {
        @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class GallerySavePlugin extends Plugin {

    private static final String FOLDER = "Sixfold";

    @PluginMethod
    public void save(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "saveWithPermission");
            return;
        }
        write(call);
    }

    @PermissionCallback
    private void saveWithPermission(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) {
            write(call);
            return;
        }
        call.reject("storage permission denied");
    }

    private void write(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("missing image data");
            return;
        }

        String name = call.getString("name", "sixfold-result.png");
        if (!name.toLowerCase().endsWith(".png")) name = name + ".png";

        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException err) {
            call.reject("could not read image data", err);
            return;
        }

        ContentResolver resolver = getContext().getContentResolver();
        long now = System.currentTimeMillis();
        Uri uri = null;

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                uri = insertQueued(resolver, name, now);
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) throw new IllegalStateException("could not open image");
                    out.write(bytes);
                }
                ContentValues done = new ContentValues();
                done.put(MediaStore.Images.Media.IS_PENDING, 0);
                resolver.update(uri, done, null, null);
            } else {
                // Android 9 and older have no RELATIVE_PATH: MediaStore needs the
                // real file path, and the row is rejected without one.
                File target = uniqueFile(name);
                try (OutputStream out = new FileOutputStream(target)) {
                    out.write(bytes);
                }
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DATA, target.getAbsolutePath());
                values.put(MediaStore.Images.Media.DISPLAY_NAME, target.getName());
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                values.put(MediaStore.Images.Media.DATE_TAKEN, now);
                values.put(MediaStore.Images.Media.DATE_ADDED, now / 1000L);
                uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("could not index image");
            }

            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            call.resolve(result);
        } catch (Exception err) {
            if (uri != null) {
                try { resolver.delete(uri, null, null); } catch (Exception ignored) {}
            }
            call.reject("could not save image", err);
        }
    }

    /** A pending row for Android 10+, stamped with the moment it was saved. */
    private Uri insertQueued(ContentResolver resolver, String name, long now) throws IOException {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + FOLDER);
        values.put(MediaStore.Images.Media.IS_PENDING, 1);
        // Without DATE_TAKEN some galleries fall back to a zero date and file the
        // picture at the start of the library instead of today.
        values.put(MediaStore.Images.Media.DATE_TAKEN, now);
        values.put(MediaStore.Images.Media.DATE_ADDED, now / 1000L);
        Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IllegalStateException("could not create image");
        return uri;
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
