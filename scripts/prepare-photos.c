#include <CoreFoundation/CoreFoundation.h>
#include <CoreGraphics/CoreGraphics.h>
#include <ImageIO/ImageIO.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <limits.h>
#include <sys/stat.h>

static int number(CFDictionaryRef properties, CFStringRef key, int fallback) {
    CFNumberRef value = CFDictionaryGetValue(properties, key);
    int result = fallback;
    if (value && CFGetTypeID(value) == CFNumberGetTypeID()) CFNumberGetValue(value, kCFNumberIntType, &result);
    return result;
}

static int prepare(const char *input, const char *output) {
    CFURLRef sourceURL = CFURLCreateFromFileSystemRepresentation(NULL, (const UInt8 *)input, strlen(input), false);
    CGImageSourceRef source = sourceURL ? CGImageSourceCreateWithURL(sourceURL, NULL) : NULL;
    if (sourceURL) CFRelease(sourceURL);
    if (!source) return 1;
    CFDictionaryRef properties = CGImageSourceCopyPropertiesAtIndex(source, 0, NULL);
    if (!properties) { CFRelease(source); return 1; }
    int width = number(properties, kCGImagePropertyPixelWidth, 0);
    int height = number(properties, kCGImagePropertyPixelHeight, 0);
    int orientation = number(properties, kCGImagePropertyOrientation, 1);
    CFRelease(properties);
    if (width <= 0 || height <= 0) { CFRelease(source); return 1; }
    if (orientation >= 5 && orientation <= 8) { int swap = width; width = height; height = swap; }
    double scale = fmin(1.0, fmin(1920.0 / width, 1080.0 / height));
    int edge = (int)floor(fmax(width, height) * scale);
    if (edge < 1) edge = 1;
    CFMutableDictionaryRef options = CFDictionaryCreateMutable(NULL, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFNumberRef maximum = CFNumberCreate(NULL, kCFNumberIntType, &edge);
    CFDictionarySetValue(options, kCGImageSourceCreateThumbnailFromImageAlways, kCFBooleanTrue);
    CFDictionarySetValue(options, kCGImageSourceCreateThumbnailWithTransform, kCFBooleanTrue);
    CFDictionarySetValue(options, kCGImageSourceThumbnailMaxPixelSize, maximum);
    CGImageRef image = CGImageSourceCreateThumbnailAtIndex(source, 0, options);
    CFRelease(maximum); CFRelease(options); CFRelease(source);
    if (!image) return 1;
    if (CGImageGetWidth(image) > 1920 || CGImageGetHeight(image) > 1080) { CGImageRelease(image); return 1; }
    CFURLRef destinationURL = CFURLCreateFromFileSystemRepresentation(NULL, (const UInt8 *)output, strlen(output), false);
    CGImageDestinationRef destination = destinationURL ? CGImageDestinationCreateWithURL(destinationURL, CFSTR("public.jpeg"), 1, NULL) : NULL;
    if (destinationURL) CFRelease(destinationURL);
    if (!destination) { CGImageRelease(image); return 1; }
    CFMutableDictionaryRef settings = CFDictionaryCreateMutable(NULL, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    double quality = 0.78;
    CFNumberRef qualityValue = CFNumberCreate(NULL, kCFNumberDoubleType, &quality);
    CFDictionarySetValue(settings, kCGImageDestinationLossyCompressionQuality, qualityValue);
    // A fresh destination gets pixels and color information, not the source EXIF/XMP/IPTC.
    CGImageDestinationAddImage(destination, image, settings);
    int success = CGImageDestinationFinalize(destination);
    CFRelease(qualityValue); CFRelease(settings); CFRelease(destination); CGImageRelease(image);
    if (success) chmod(output, 0600);
    return success ? 0 : 1;
}

int main(int argc, char **argv) {
    if (argc < 3) { fprintf(stderr, "Expected output folder and source photos.\n"); return 1; }
    for (int i = 2; i < argc; i++) {
        char output[PATH_MAX];
        if (snprintf(output, sizeof(output), "%s/photo-%02d.jpg", argv[1], i - 1) >= sizeof(output) || prepare(argv[i], output)) {
            fprintf(stderr, "Could not prepare photo %d.\n", i - 1); return 1;
        }
    }
    return 0;
}
