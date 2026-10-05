# Color adjustments

The compression inspector has **Color & filters** and **Export settings** tabs. Both use the existing all-images/per-image scope. Color edits are part of each complete settings snapshot, survive output-format and compression-preset changes, invalidate stale downloads, and appear in the ZIP manifest. Reset edits clears color settings in the selected scope while retaining format, quality and resize settings. Reloading clears images and edits, as it does other in-memory work.

## Controls

Eight filter choices include Original, Vivid, Warm, Cool, Vintage, Film, Noir and Fade. Filter intensity ranges from 0 to 100; zero removes the look while keeping manual edits. Thumbnails are generated from the selected original image with the same filter transform as exports. One source decode supplies eight 120×80 thumbnails. With no selected image, thumbnails use the existing generated dune sample.

Exposure, brilliance, brightness, contrast, highlights, shadows, whites, blacks, saturation, vibrance, temperature and tint range from −100 to 100. Exposure maps to −2…+2 EV, with 50 representing +1 EV. Sharpness and vignette range from 0 to 100. Sliders apply through the existing 300 ms scheduler debounce; numeric drafts commit on blur or Enter and cancel on Escape. Double-click resets a slider. Arrow keys operate sliders and switch inspector tabs.

## Circle selection

Choose **Circle selection** to create or edit one independent local adjustment for the current image. Entering this mode creates a complete per-image settings snapshot; other images and global settings are unaffected. Whole-image edits run first, followed by this local layer. All filters and fourteen controls are available for either layer. Returning to **Whole image** or finishing the selection keeps the local layer applied. **Reset edits** resets only the layer being edited; **Remove local adjustments** removes the selection and its edits. Restoring global settings removes the per-image snapshot as before.

In selection mode the stage fits the final output image. Drag inside the circle to move it, drag its square handle to resize, or drag outside to draw a new circle from its centre. Position and radius can also be set numerically. Arrow keys move the focused circle; Shift uses larger steps. Arrow keys on the handle change its radius. Escape or pointer cancellation discards an unfinished drag. Processing starts when the drag ends, so pointer movement does not enqueue repeated encoding tasks.

Radius is a percentage of the shorter output edge, so the guide and export remain circular for both portrait and landscape images. Centre coordinates are normalized to the final resized/cropped image. The dashed inner circle marks the fully affected area. Feather uses a smooth transition to zero at the outer circle; **Outside** inverts this mask. Guides appear only while selecting and are never encoded. Current geometry and local edits are included in the settings identity and ZIP manifest; inactive local edits do not invalidate a neutral result.

## Processing

Each task starts from the original Blob, decodes to sRGB with the existing orientation behavior, and resizes using the existing pipeline. The encoding Worker applies edits to target RGBA pixels before JPEG, WebP, PNG or AVIF encoding. The main-thread decode fallback sends RGBA through the same Worker transform. PNG compressed-byte passthrough is used only when there are no active edits.

Exposure scales linear-light values before conversion to sRGB. A 256-entry lookup avoids per-pixel power calculations for exposure. Tone controls use luminance masks for shadows/highlights/white/black levels. Brilliance combines shadow opening, highlight restraint, midtone lift and modest saturation. Saturation and vibrance adjust distance from luminance, with vibrance emphasizing less saturated pixels. These are PicForge's own transforms, not exact replicas of another photo editor's controls.

Temperature adjusts the red/blue axis; tint adjusts green/magenta. Filter strength blends each selected look with manually edited pixels. Vignette attenuates edges. An alpha-weighted unsharp mask uses three rotating scratch rows. RGB edits preserve alpha; fully transparent pixels retain their hidden RGB. Edits operate in place without allocating a full extra image.

## Scope

Color edits support still images accepted by the existing browser decoder. They do not alter Motion Photo extraction, Live Photo conversion or video frames. Animated GIF/APNG/WebP inputs with active edits report a translated settings error rather than exporting unchanged color or flattening frames. Reset both editing layers or remove the active local layer to resume supported animated exports. Neutral edits leave the original compression and PNG passthrough paths unchanged.
