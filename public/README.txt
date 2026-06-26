# Marker target placeholder

This directory should contain your `.mind` target file and its source image.

**For the prototype, do one of the following:**

1. **Use the official MindAR example card:**
   - Download `card.png` and `card.mind` from the MindAR examples repo
   - Rename to `targets.png` and `targets.mind`
   - Print `targets.png` and scan with the app

2. **Train your own target:**
   - Pick any high-contrast image (a QR code, a logo, a business card)
   - Run: `npx mind-ar compile <your-image>.png` to generate a `.mind` file
   - Save as `public/targets.mind`
   - Print `targets.png`

Without a valid `.mind` file, the app will boot but fail to detect any marker.
